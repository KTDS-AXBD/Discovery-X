---
name: ax-batch-analysis
description: |
  내부 배치 분석 — Claude Code 구독으로 AI 분석 처리. API Credit 소비 없이 D1 원격 DB의 미처리 아이템을 배치 분석.
  cron 보조용: 누락분 보정 + 대량 처리 보충.
  모드: radar (클러스터링→아이디어), ontology (엔티티/관계 추출), eval (아이템 품질 평가), all.
---

# ax-batch-analysis — 내부 배치 분석

Claude Code 구독을 활용해 D1 원격 DB의 미처리 아이템을 로컬에서 배치 분석하는 스킬.
프로덕션 cron(`api.cron.ai-pipeline`, `api.cron.lab`) 보조용 — 누락분 보정 및 대량 처리.

## 사전 조건

- `wrangler` CLI 로그인 (`npx wrangler whoami`)
- D1 원격 DB 접근 권한

## 실행 방식 (하이브리드)

- **인수 있음**: `$ARGUMENTS`가 `radar`, `ontology`, `eval`, `all` 중 하나이면 해당 모드를 즉시 실행
- **인수 없음**: 인터랙티브 모드 → Step 1~2를 거쳐 모드 선택

## Step 1: DB 이름 추출 + 미처리 현황 조회

```bash
DB_NAME=$(grep 'database_name' wrangler.toml | head -1 | awk -F'"' '{print $2}')
echo "DB: $DB_NAME"
```

**Radar 미처리:**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT COUNT(*) as cnt FROM radar_items WHERE ai_processed_at IS NULL AND status IN ('COLLECTED', 'SCORED');" \
  --json
```

**Ontology 미처리:**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT COUNT(*) as cnt FROM evidence WHERE ontology_extracted_at IS NULL OR ontology_extracted_at < created_at;" \
  --json
```

**Eval 미평가:**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT COUNT(*) as cnt FROM radar_items ri WHERE ri.status IN ('COLLECTED', 'SCORED') AND NOT EXISTS (SELECT 1 FROM radar_item_metrics rim WHERE rim.item_id = ri.id AND rim.evaluated_at IS NOT NULL);" \
  --json
```

결과를 사용자에게 보여주고, 인수가 없으면 AskUserQuestion으로 모드를 선택받는다.

## Step 2: 모드 선택 (인터랙티브만)

AskUserQuestion으로 선택:
1. **radar** — Radar→Ideas 클러스터링 + 아이디어 생성 (미처리 N건)
2. **ontology** — Evidence→엔티티/관계 추출 (미처리 N건)
3. **eval** — Radar 아이템 품질 평가 → radar_item_metrics UPSERT (미평가 N건)
4. **all** — 전체 실행 (radar + ontology + eval)

## Step 3: 분석 실행

선택된 모드에 따라 처리. 한 번에 최대 **5건**씩. 에러 시 해당 아이템 건너뛰고 계속.

---

### Mode: radar

프로덕션 로직 참조: `app/lib/ai-pipeline/service.ts` + `app/lib/ai-pipeline/prompts.ts`

**3-1. 프롬프트 참조:**
```
Read app/lib/ai-pipeline/prompts.ts
```
`CLUSTER_SYSTEM_PROMPT`, `IDEA_GENERATION_SYSTEM_PROMPT`를 읽고 동일 패턴으로 분석한다.

**3-2. 미처리 아이템 상세 조회 (최대 5건):**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT id, title, title_ko, summary, summary_ko, key_points, url FROM radar_items WHERE ai_processed_at IS NULL AND status IN ('COLLECTED', 'SCORED') LIMIT 5;" \
  --json
```

**3-3. tenant_id 확인:**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT DISTINCT rs.tenant_id FROM radar_items ri JOIN radar_sources rs ON ri.source_id = rs.id WHERE ri.ai_processed_at IS NULL AND ri.status IN ('COLLECTED', 'SCORED') LIMIT 1;" \
  --json
```

**3-4. 클러스터링:**
조회된 아이템들을 `CLUSTER_SYSTEM_PROMPT`와 동일한 패턴으로 직접 분석한다 (Claude Code 세션 내).

```
다음 N개 아이템을 클러스터링하세요:

[{id}] {title_ko 또는 title}
{summary_ko 또는 summary}
---
(반복)
```

JSON 응답: `{ "clusters": [{ "topic": "...", "itemIds": [...], "rationale": "..." }] }`

**3-5. 아이디어 생성:**
각 클러스터마다 `IDEA_GENERATION_SYSTEM_PROMPT` 패턴으로 아이디어 생성.

```
주제: {cluster.topic}
묶은 이유: {cluster.rationale}

소스:
- {item.title_ko}: {item.summary_ko}
  핵심: {item.key_points}
```

JSON 응답: `{ "title": "...", "summary": "...", "whyNow": "..." }`

**3-6. DB 저장:**
```bash
# 아이디어 INSERT
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "INSERT INTO ideas (id, tenant_id, owner_id, title, status, created_by_agent, created_at, updated_at) VALUES ('idea-{uuid}', '{tenant_id}', 'system-agent', '{title}', 'ACTIVE', 1, unixepoch(), unixepoch());"

# 소스 연결 INSERT (클러스터 내 각 radar_item)
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "INSERT INTO idea_sources (id, idea_id, radar_item_id, added_at) VALUES ('isrc-{uuid}', 'idea-{uuid}', '{radar_item_id}', unixepoch());"
```

---

### Mode: ontology

프로덕션 로직 참조: `app/lib/ontology/extractor.ts` + `app/lib/ontology/prompts.ts`

**3-1. 프롬프트 참조:**
```
Read app/lib/ontology/prompts.ts
```
`EXTRACTION_SYSTEM_PROMPT`를 읽고 동일 패턴으로 분석한다.

**3-2. 온톨로지 타입 목록 조회:**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT id, name_ko, domain FROM ontology_types;" \
  --json
```

**3-3. 미처리 Evidence 상세 조회 (최대 5건):**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT e.id, e.content, e.discovery_id, d.tenant_id FROM evidence e JOIN discoveries d ON e.discovery_id = d.id WHERE e.ontology_extracted_at IS NULL OR e.ontology_extracted_at < e.created_at LIMIT 5;" \
  --json
```

**3-4. 각 Evidence에 대해 기존 노드 조회:**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT label, ontology_type_id FROM context_nodes WHERE discovery_id = '{discovery_id}';" \
  --json
```

**3-5. 엔티티/관계 추출:**
`EXTRACTION_SYSTEM_PROMPT` 패턴으로 직접 분석 (Claude Code 세션 내).

```
## Evidence 텍스트
{evidence.content}

## 사용 가능한 온톨로지 타입
{id}: {nameKo} ({domain})

## 기존 엔티티 노드
- {label} ({ontologyTypeId})

위 Evidence에서 엔티티와 관계를 추출하세요. JSON만 출력하세요.
```

**3-6. DB 저장:**

confidence 기준:
- `>= 0.8`: 노드 INSERT + 엣지 생성 대상
- `0.5 ~ 0.8`: 노드 INSERT (reviewed=0), 엣지 제외
- `< 0.5`: 무시

```bash
# 노드 INSERT
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "INSERT INTO context_nodes (id, discovery_id, label, ontology_type_id, source_evidence_id, confidence, auto_generated, reviewed, created_at) VALUES ('cn-{uuid}', '{discovery_id}', '{label}', '{ontologyTypeId}', '{evidence_id}', {confidence}, 1, 0, unixepoch());"

# 엣지 INSERT (from/to 모두 >= 0.8인 경우만)
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "INSERT INTO context_edges (id, from_node_id, to_node_id, relation_type, strength, source_evidence_id, confidence, auto_generated, reviewed, created_at) VALUES ('ce-{uuid}', '{from_node_id}', '{to_node_id}', '{relationType}', {strength_x_100}, '{evidence_id}', {confidence}, 1, 0, unixepoch());"
```

**주의**: `context_edges.strength`는 0~100 정수 (LLM 출력 × 100)

---

### Mode: eval

Radar 아이템의 AI 품질 평가 → `radar_item_metrics` UPSERT. 설계 문서: DX-DSGN-013 §3.

**3-1. 미평가 아이템 상세 조회 (최대 5건):**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT ri.id, ri.title, ri.title_ko, ri.summary, ri.summary_ko, ri.url, rs.name as source_name
   FROM radar_items ri
   JOIN radar_sources rs ON ri.source_id = rs.id
   WHERE ri.status IN ('COLLECTED', 'SCORED')
     AND NOT EXISTS (SELECT 1 FROM radar_item_metrics rim WHERE rim.item_id = ri.id AND rim.evaluated_at IS NOT NULL)
   LIMIT 5;" \
  --json
```

**3-2. tenant_id 확인:**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT DISTINCT rs.tenant_id FROM radar_items ri JOIN radar_sources rs ON ri.source_id = rs.id WHERE ri.status IN ('COLLECTED', 'SCORED') AND NOT EXISTS (SELECT 1 FROM radar_item_metrics rim WHERE rim.item_id = ri.id AND rim.evaluated_at IS NOT NULL) LIMIT 1;" \
  --json
```

**3-3. 품질 평가:**
각 아이템에 대해 아래 프롬프트로 직접 평가한다 (Claude Code 세션 내).

```
당신은 AX BD팀의 신사업 발굴 정보 품질 평가 전문가입니다.

## 평가 기준

1. **Topic Relevance** (0~1): BD/신사업 발굴에 얼마나 관련이 있는지
   - 1.0: 직접적인 신사업 기회, 시장 변화, 기술 트렌드
   - 0.7: 간접 관련 (산업 동향, 경쟁사 동향)
   - 0.3: 약한 관련 (일반 기술 뉴스)
   - 0.0: 무관 (스포츠, 연예 등)

2. **Novelty** (0~1): 기존에 알려지지 않은 새로운 정보/관점 정도
   - 1.0: 완전히 새로운 발견/발표
   - 0.7: 새로운 분석/해석
   - 0.3: 이미 알려진 정보의 업데이트
   - 0.0: 재탕/중복

3. **Quality** (0~1): 내용의 깊이와 신뢰성
   - 1.0: 데이터 기반, 전문가 분석, 출처 명확
   - 0.7: 합리적 분석, 일부 데이터
   - 0.3: 의견 중심, 데이터 부족
   - 0.0: 광고/홍보/근거 없는 주장

## 입력

제목: {title_ko 또는 title}
요약: {summary_ko 또는 summary}
소스: {source_name}

## 출력 (JSON만)

{ "topicRelevance": 0.7, "novelty": 0.5, "quality": 0.8, "reasoning": "..." }
```

**3-4. Composite Score 계산:**
```
composite = (topicRelevance × 0.4) + (novelty × 0.3) + (quality × 0.3)
```

**Novelty 과감지 플래그**: `novelty > 0.95 AND topicRelevance < 0.3` → 결과 출력 시 `⚠️ 잡음 의심` 표시.

**3-5. DB 저장 (UPSERT):**
```bash
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "INSERT INTO radar_item_metrics (id, item_id, tenant_id, topic_relevance, novelty, quality, composite_score, model_version, evaluated_at, created_at)
   VALUES ('rim-{uuid}', '{item_id}', '{tenant_id}', {topicRelevance}, {novelty}, {quality}, {composite}, 'claude-opus-4-6', unixepoch(), unixepoch())
   ON CONFLICT(item_id) DO UPDATE SET
     topic_relevance = excluded.topic_relevance,
     novelty = excluded.novelty,
     quality = excluded.quality,
     composite_score = excluded.composite_score,
     model_version = excluded.model_version,
     evaluated_at = excluded.evaluated_at;"
```

**주의**: `model_version`은 실행 시 사용된 모델 ID를 기록 (예: `claude-opus-4-6`, `claude-sonnet-4-6`).

---

### 모드 확장 가이드

새 배치 분석 모드를 추가하려면 아래 패턴을 따른다:

1. `### Mode: {모드명}` 섹션을 추가
2. 프로덕션 소스 참조 경로를 명시 (`app/lib/{모듈}/` + `prompts.ts`)
3. 미처리 아이템 조회 SQL을 작성
4. 프롬프트 패턴을 Read + 직접 분석 방식으로 기술
5. DB 저장 SQL을 작성
6. Step 1의 미처리 현황 조회에 새 SQL을 추가
7. Step 2의 AskUserQuestion 선택지에 새 모드를 추가

---

## Step 4: 처리 완료 마킹

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

**Eval:**
별도 마킹 불필요 — `radar_item_metrics.evaluated_at`이 마킹 역할 (Step 3-5에서 UPSERT 시 설정됨).

## Step 5: 결과 요약

```
## 배치 분석 결과

| 항목 | 값 |
|------|------|
| 모드 | {radar / ontology / eval / all} |
| Radar 처리 | {N}건 |
| 아이디어 생성 | {N}건 |
| Evidence 처리 | {N}건 |
| 노드 생성 | {N}건 |
| 엣지 생성 | {N}건 |
| Eval 평가 | {N}건 |
| 평균 composite | {0.XX} |
| 잡음 의심 | {N}건 |
| 에러 | {N}건 |
| API 크레딧 소비 | 0 (Claude Code 구독 사용) |
```

에러가 있었다면 에러 목록도 함께 출력한다.

## 핵심 규칙

1. **DB 이름 자동 추출**: `grep 'database_name' wrangler.toml`
2. **timestamp**: `unixepoch()` 사용 (D1/SQLite 표준)
3. **tenant_id 격리**: 조회 시 tenant_id 조건 필수
4. **배치 크기**: 한 번에 최대 5건
5. **에러 처리**: 개별 아이템 에러 시 건너뛰고 계속
6. **SQL 이스케이프**: 작은따옴표 → `''`, 줄바꿈 → 공백 치환
7. **UUID 생성**: `uuidgen` 또는 Bash 랜덤 (형식: `{prefix}-{uuid}`)
8. **분석은 현재 세션에서 직접 수행** — claude -p 별도 호출 불필요
9. **프롬프트 공유**: 프로덕션 코드의 prompts.ts를 Read로 참조하여 일관성 유지
