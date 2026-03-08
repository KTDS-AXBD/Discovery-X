---
description: "내부 배치 분석 — Claude Code 구독으로 AI 분석 처리. API Credit 소비 없이 DB 아이템을 배치 분석."
---

# /ax-batch-analysis

Claude Code 구독(claude -p)을 활용해 D1 원격 DB의 미처리 아이템을 로컬에서 배치 분석하는 스킬이에요.
Anthropic API 크레딧을 소비하지 않고, 동일한 AI 파이프라인 로직을 로컬에서 수행해요.

## 사전 조건

- `wrangler` CLI 로그인 상태 (`npx wrangler whoami`)
- D1 원격 DB 접근 권한

## Steps

### Step 1: DB 이름 추출 + 미처리 아이템 조회

wrangler.toml에서 DB 이름을 자동 추출하고, 미처리 아이템 수를 확인해요.

```bash
DB_NAME=$(grep 'database_name' wrangler.toml | head -1 | awk -F'"' '{print $2}')
echo "DB: $DB_NAME"
```

**Radar 미처리 조회:**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT COUNT(*) as cnt FROM radar_items WHERE ai_processed_at IS NULL AND status IN ('COLLECTED', 'SCORED');" \
  --json
```

**Ontology 미처리 조회:**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT COUNT(*) as cnt FROM evidence WHERE ontology_extracted_at IS NULL OR ontology_extracted_at < created_at;" \
  --json
```

두 결과를 사용자에게 보여주고 다음 단계로 진행해요.

### Step 2: 분석 모드 선택

AskUserQuestion으로 사용자에게 모드를 선택받아요.

```
어떤 분석을 실행할까요?

1. **radar** — Radar→Ideas 클러스터링 + 아이디어 생성 (미처리 N건)
2. **ontology** — Evidence→엔티티/관계 추출 (미처리 N건)
3. **all** — 둘 다 실행
```

### Step 3: 배치 처리

선택된 모드에 따라 처리해요. 한 번에 최대 **5건**씩 처리하고, 에러 시 해당 아이템을 건너뛰고 계속해요.

---

#### Mode: radar

Radar 아이템을 클러스터링하고 아이디어를 생성해요.

**3-1. 미처리 아이템 상세 조회 (최대 5건):**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT id, title, title_ko, summary, summary_ko, key_points, url FROM radar_items WHERE ai_processed_at IS NULL AND status IN ('COLLECTED', 'SCORED') LIMIT 5;" \
  --json
```

**3-2. tenant_id 확인 (radar_sources 경유):**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT DISTINCT rs.tenant_id FROM radar_items ri JOIN radar_sources rs ON ri.source_id = rs.id WHERE ri.ai_processed_at IS NULL AND ri.status IN ('COLLECTED', 'SCORED') LIMIT 1;" \
  --json
```

**3-3. 클러스터링 프롬프트 구성:**

조회된 아이템들로 다음 프롬프트를 구성해서 직접 분석해요 (claude -p 불필요, 현재 세션에서 처리):

```
다음 Radar 아이템들을 주제별로 클러스터링하세요.

규칙:
- 유사한 주제/기술/시장을 다루는 아이템을 같은 클러스터로 묶습니다
- 단독 아이템도 1개짜리 클러스터로 만듭니다
- 각 클러스터에 한국어 주제명을 부여합니다

아이템 목록:
[{id}] {title_ko 또는 title}
{summary_ko 또는 summary}
---
(반복)

JSON 형식으로 응답:
{
  "clusters": [
    { "topic": "주제명", "itemIds": ["id1", "id2"], "rationale": "묶은 이유" }
  ]
}
```

**3-4. 각 클러스터에서 아이디어 생성:**

각 클러스터마다 다음 프롬프트로 아이디어를 생성해요:

```
주제: {cluster.topic}
묶은 이유: {cluster.rationale}

소스:
- {item.title_ko}: {item.summary_ko}
  핵심: {item.key_points}
(반복)

다음 JSON 형식으로 사업 아이디어를 생성하세요:
{
  "title": "아이디어 제목 (한국어, 30자 이내)",
  "summary": "1-2문장 요약",
  "whyNow": "왜 지금인지 1줄 설명"
}
```

**3-5. 아이디어 DB 저장:**

생성된 아이디어마다 UUID를 생성하고 INSERT해요.

```bash
# 아이디어 INSERT
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "INSERT INTO ideas (id, tenant_id, owner_id, title, status, created_by_agent, created_at, updated_at) VALUES ('idea-{uuid}', '{tenant_id}', 'system-agent', '{title}', 'ACTIVE', 1, unixepoch(), unixepoch());"

# 소스 연결 INSERT (클러스터 내 각 radar_item)
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "INSERT INTO idea_sources (id, idea_id, radar_item_id, added_at) VALUES ('isrc-{uuid}', 'idea-{uuid}', '{radar_item_id}', unixepoch());"
```

**주의**: SQL 문자열 내 작은따옴표는 두 번(`''`)으로 이스케이프해요.

---

#### Mode: ontology

Evidence에서 온톨로지 엔티티와 관계를 추출해요.

**3-1. 온톨로지 타입 목록 조회:**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT id, name_ko, domain FROM ontology_types;" \
  --json
```

**3-2. 미처리 Evidence 상세 조회 (최대 5건):**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT e.id, e.content, e.discovery_id, d.tenant_id FROM evidence e JOIN discoveries d ON e.discovery_id = d.id WHERE e.ontology_extracted_at IS NULL OR e.ontology_extracted_at < e.created_at LIMIT 5;" \
  --json
```

**3-3. 각 Evidence에 대해 기존 노드 조회:**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT label, ontology_type_id FROM context_nodes WHERE discovery_id = '{discovery_id}';" \
  --json
```

**3-4. 엔티티/관계 추출 프롬프트:**

```
당신은 비즈니스/전략 온톨로지 전문가입니다.
주어진 Evidence 텍스트에서 핵심 엔티티(개념)와 관계를 추출하세요.

규칙:
1. 엔티티는 구체적이고 재사용 가능한 개념 (예: "ESG 시장", "탄소중립 정책")
2. 일반적이거나 모호한 개념은 제외 (예: "성장", "변화")
3. ontologyTypeId는 반드시 아래 목록에서 선택
4. strength: 0.0~1.0 (관계 강도)
5. confidence: 0.0~1.0 (추출 확신도)
6. 기존 노드와 유사한 엔티티는 같은 label 사용

사용 가능한 온톨로지 타입:
{typeList를 id: nameKo(domain) 형태로 나열}

기존 노드:
{existingNodes를 label(ontologyTypeId) 형태로 나열}

Evidence 텍스트:
{evidence.content}

JSON 형식으로 응답:
{
  "entities": [
    { "label": "엔티티명", "ontologyTypeId": "ONT-XX", "confidence": 0.95 }
  ],
  "relations": [
    { "fromLabel": "A", "toLabel": "B", "relationType": "supports|contradicts|causes|relates_to|depends_on", "strength": 0.8, "confidence": 0.85 }
  ]
}
```

**3-5. 추출 결과 저장:**

confidence >= 0.5인 엔티티만 저장해요.

```bash
# 노드 INSERT (confidence >= 0.8인 것만 auto_generated=1)
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "INSERT INTO context_nodes (id, discovery_id, label, ontology_type_id, source_evidence_id, confidence, auto_generated, reviewed, created_at) VALUES ('cn-{uuid}', '{discovery_id}', '{label}', '{ontologyTypeId}', '{evidence_id}', {confidence}, 1, 0, unixepoch());"

# 엣지 INSERT (from/to 노드가 모두 confidence >= 0.8인 경우만)
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "INSERT INTO context_edges (id, from_node_id, to_node_id, relation_type, strength, source_evidence_id, confidence, auto_generated, reviewed, created_at) VALUES ('ce-{uuid}', '{from_node_id}', '{to_node_id}', '{relationType}', {strength_as_int_0_100}, '{evidence_id}', {confidence}, 1, 0, unixepoch());"
```

**주의**:
- `context_edges.strength`는 0~100 정수로 저장 (LLM 출력 0.0~1.0에 100을 곱함)
- `confidence >= 0.5 && < 0.8`인 노드는 INSERT하되 `reviewed=0`으로만 기록 (엣지 연결 제외)
- `confidence < 0.5`인 엔티티는 무시

### Step 4: 처리 완료 마킹

처리된 아이템의 타임스탬프를 업데이트해요.

**Radar:**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "UPDATE radar_items SET ai_processed_at = unixepoch() WHERE id IN ('{id1}', '{id2}', ...);"
```

**Ontology:**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "UPDATE evidence SET ontology_extracted_at = unixepoch() WHERE id IN ('{id1}', '{id2}', ...);"
```

### Step 5: 결과 요약

처리 결과를 테이블로 출력해요.

```
## 배치 분석 결과

| 항목 | 값 |
|------|------|
| 모드 | {radar / ontology / all} |
| Radar 처리 | {N}건 |
| 아이디어 생성 | {N}건 |
| Evidence 처리 | {N}건 |
| 노드 생성 | {N}건 |
| 엣지 생성 | {N}건 |
| 에러 | {N}건 |
| 소요 시간 | {N}초 |
| API 크레딧 소비 | 0 (Claude Code 구독 사용) |
```

에러가 있었다면 에러 목록도 함께 출력해요.

## 중요 규칙

1. **DB 이름 자동 추출**: `grep 'database_name' wrangler.toml`에서 가져옴
2. **timestamp**: `unixepoch()` 사용 (D1/SQLite 표준)
3. **tenant_id 격리**: 조회 시 tenant_id 조건 필수 포함
4. **배치 크기**: 한 번에 최대 5건 (로컬이므로 CF 30초 제한 없지만 안전하게)
5. **에러 처리**: 개별 아이템 에러 시 건너뛰고 다음 아이템 계속 처리
6. **SQL 이스케이프**: 작은따옴표 → `''`, 줄바꿈 → 공백 치환
7. **UUID 생성**: `uuidgen` 또는 랜덤 문자열 사용 (형식: `{prefix}-{uuid}`)
8. **분석은 현재 세션에서 직접 수행** — claude -p 별도 호출 불필요
