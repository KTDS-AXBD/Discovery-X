---
code: DX-PLAN-009
title: 아이템 수집 시스템 고도화 — Signal Capture Engine
version: "0.3"
status: Draft
category: PLAN
created: 2026-03-10
updated: 2026-03-10
author: Sinclair Seo
---

# 아이템 수집 시스템 고도화 — Signal Capture Engine

> **Req**: DX-REQ-012 (F41, P1)
> **Review**: 1차 검토 7.5 → v0.2 8.5 → v0.3 재검토 반영

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 수집 채널이 개발자 DB INSERT에 의존. 품질 판단 체계 부재로 노이즈 지속. 수동 수집 경로 없음. 유형 분류 혼재. 전환 이벤트 미정의 |
| **Solution** | 수동 수집 우선 → 채널 자율 등록 → 4축 Health Score + 3축 유형 분류 + 큐 기반 파이프라인 + 전환 이벤트 정의 + 운영 정책 체계화 |
| **Function/UX Effect** | 사용자가 즉시 정보 등록 → "아이디어로 보내기" 액션 → Source Health Dashboard에서 운영 액션 수행 |
| **Core Value** | Signal Capture Engine — 정보 수집 민주화 + 품질 자동 관리 + Signal→Idea 연결 → Discovery 파이프라인 입력 품질 극대화 |

---

## 1. Overview

### 1.1 Purpose & Positioning

```
Signal Capture (Radar) → Idea Generation (Ideas) → Validation (Discovery)
```

Radar는 **Signal Capture Engine** — 외부·내부 정보 신호를 포착하여 아이디어 생성의 원천을 제공한다.

고도화 목표:
1. **수동 수집 경로** 제공 (최우선 — 사용자는 먼저 정보를 등록한다)
2. 채널 관리 **사용자 자율 모델** 전환
3. **4축 복합 지표** 품질 판단 + 운영 정책
4. **3축 유형 분류** 정규화
5. **Signal → Idea 명시적 연결** (전환 이벤트 정의)

### 1.2 Background

**현재 구조**:
- `radar_sources`: `sourceType`(rss/web/youtube), `userId`, `keywords`, `radarTags`
- `api.radar.sources.ts`: CRUD API 존재
- Cron → RSS/Web 자동 수집 → `radar_items`
- `radarItemUserStatus`: like/dislike reaction
- `idea_sources`: radar_item → idea 연결 (현재 `link_type` 없음)

**구조적 한계**:
1. metrics가 source에 혼재 → 집계 성능 저하
2. 유형 분류 혼재 (채널·수집방식·콘텐츠 미분리)
3. AI 품질 평가 미정의 + 운영 정책 부재
4. Cron 단일 실행 → 채널 증가 시 타임아웃
5. 도메인 분류 단일 TEXT → M:N 불가
6. 전환(conversion) 이벤트 정의 없음
7. 원문 저장 범위 불명확 + dedupe 전략 부재

### 1.3 예상 운영 규모

| 항목 | 초기 (v0.7.0) | 중기 (v0.8.0+) |
|------|:------------:|:-------------:|
| 채널 수 | 30~50 | 100~300 |
| 일 수집량 | 50~100 건 | 200~500 건 |
| 수동 수집 | 5~10 건/일 | 20~50 건/일 |
| 사용자 수 | 5~10명 | 20~50명 |

### 1.4 Related Documents

- [[DX-REQ-012]] F41: 아이템 수집 시스템 고도화
- `app/features/radar/db/schema.ts` — 현재 Radar 스키마
- `app/features/radar/service/radar.service.ts` — 현재 Radar 서비스
- `app/routes/api.radar.sources.ts` — 현재 소스 CRUD API

---

## 2. Scope

### 2.1 In Scope

- [ ] **S1**: 수동 아이템 수집 — URL 크롤링, 직접 텍스트 입력, PDF/문서 업로드
- [ ] **S2**: Signal → Idea 연결 — "아이디어로 보내기" 액션 + 전환 이벤트 정의
- [ ] **S3**: 채널(소스) 관리 UI + Source Lifecycle (ACTIVE/PAUSED/REVIEW/ARCHIVED/FAILED)
- [ ] **S4**: 3축 유형 분류 — source_type × collection_type × content_type
- [ ] **S5**: 도메인 분류 — M:N 관계 (radar_domains + 조인 테이블)
- [ ] **S6**: 4축 품질 판단 + AI 평가 운영 정책
- [ ] **S7**: Source Health Dashboard — 운영 액션 중심 UX
- [ ] **S8**: 큐 기반 수집 파이프라인 + 장애 대응 설계
- [ ] **S9**: 아이템 원문 저장 + Dedupe 전략

### 2.2 Out of Scope

- 실시간 수집 (WebSocket/SSE)
- 외부 OAuth 연동
- 채널 추천 시스템
- Topic clustering / Trend detection (향후 Signal Intelligence)

---

## 3. 데이터 모델

### 3.1 테이블 구조

```
기존 테이블 (유지 + 확장)
├── radar_sources         — + collection_type, status(lifecycle), crawl_interval
├── radar_items           — + content_type, raw_content, parsed_content, dedupe_key
├── radar_item_user_status — 유지
├── radar_runs            — 유지
└── idea_sources          — + link_type (전환 이벤트 정의)

신규 테이블
├── radar_source_metrics  — 채널별 일별 집계 스냅샷
├── radar_item_metrics    — 아이템별 AI 품질 지표
├── radar_domains         — 도메인 분류 마스터
├── radar_source_domains  — 채널↔도메인 M:N
└── radar_crawl_queue     — 수집 큐 (+ 장애 대응 필드)
```

### 3.2 관계 구조

```
radar_sources (채널)
  ├── radar_items (아이템) [1:N]
  │     ├── radar_item_user_status (사용자 반응) [1:N]
  │     ├── radar_item_metrics (품질 지표) [1:1]
  │     └── idea_sources (전환 연결) [1:N]
  │           └── ideas (아이디어) [N:1]
  ├── radar_source_metrics (채널 지표) [1:N per date]
  ├── radar_source_domains (도메인) [M:N]
  │     └── radar_domains (마스터)
  └── radar_crawl_queue (수집 큐) [1:N]
```

### 3.3 3축 유형 분류

| 축 | 필드 | 값 | 설명 |
|---|------|-----|------|
| **source_type** | `radar_sources.source_type` | rss, site, youtube, sns | 채널 유형 |
| **collection_type** | `radar_sources.collection_type` | auto, manual | 수집 방식 |
| **content_type** | `radar_items.content_type` | article, video, document, memo | 콘텐츠 유형 |

```typescript
export const SourceType = {
  RSS: "rss", SITE: "site", YOUTUBE: "youtube", SNS: "sns",
} as const;

export const CollectionType = {
  AUTO: "auto", MANUAL: "manual",
} as const;

export const ContentType = {
  ARTICLE: "article", VIDEO: "video", DOCUMENT: "document", MEMO: "memo",
} as const;
```

### 3.4 Source Lifecycle (재검토 §5.3 반영)

```
ACTIVE → PAUSED (사용자 수동 일시정지)
ACTIVE → REVIEW (건강도 임계치 도달 / fetch 실패 반복 / 전환 0건 장기)
ACTIVE → FAILED (영구 실패 — 5회 연속 fetch 실패)
REVIEW → ACTIVE (사용자 확인 후 복구)
REVIEW → ARCHIVED (사용자 판단으로 폐기)
PAUSED → ACTIVE (재시작)
```

`radar_sources` 확장:
```sql
ALTER TABLE radar_sources ADD COLUMN collection_type TEXT DEFAULT 'auto';
ALTER TABLE radar_sources ADD COLUMN status TEXT DEFAULT 'ACTIVE';
  -- ACTIVE | PAUSED | REVIEW | ARCHIVED | FAILED
ALTER TABLE radar_sources ADD COLUMN crawl_interval INTEGER DEFAULT 86400;
  -- 초 단위 수집 간격 (기본 1일)
ALTER TABLE radar_sources ADD COLUMN last_collected_at INTEGER;
ALTER TABLE radar_sources ADD COLUMN consecutive_failures INTEGER DEFAULT 0;
```

### 3.5 아이템 원문 저장 + Dedupe (재검토 §5.1~5.2 반영)

`radar_items` 확장:
```sql
ALTER TABLE radar_items ADD COLUMN content_type TEXT DEFAULT 'article';
ALTER TABLE radar_items ADD COLUMN raw_content TEXT;
  -- 원본 HTML/텍스트 (parser 변경 시 재처리용)
ALTER TABLE radar_items ADD COLUMN parsed_content TEXT;
  -- 파싱된 본문 텍스트
ALTER TABLE radar_items ADD COLUMN excerpt TEXT;
  -- 앞 200자 발췌 (UI 미리보기용)
ALTER TABLE radar_items ADD COLUMN metadata TEXT;
  -- JSON: { author, publishedAt, wordCount, language, ... }
ALTER TABLE radar_items ADD COLUMN dedupe_key TEXT;
  -- URL canonicalization + title hash → 중복 탐지 키
```

**Dedupe 전략** (3단계):
1. **URL Canonicalization**: 쿼리 파라미터(utm_*) 제거 + 프로토콜 정규화 → `urlHash` (기존)
2. **Title + Date Hash**: `SHA256(title_normalized + published_date)` → `dedupe_key`
3. **Near-duplicate** (Phase 3+): 본문 embedding 코사인 유사도 > 0.95 → 중복 경고

### 3.6 Idea Conversion 이벤트 정의 (재검토 §3.1 반영)

`idea_sources` 확장:
```sql
ALTER TABLE idea_sources ADD COLUMN link_type TEXT DEFAULT 'primary';
  -- primary: 직접 전환 ("아이디어로 보내기" 버튼)
  -- secondary: AI 파이프라인 자동 연결
  -- reference: 사용자가 아이디어 본문에서 참조 링크
ALTER TABLE idea_sources ADD COLUMN created_by TEXT;
  -- 'user' | 'ai-pipeline' | 'system'
```

**전환율 계산 기준**:
- **전환 인정**: `link_type = 'primary'` 또는 `link_type = 'secondary'`만 (reference 제외)
- **집계 기준**: unique idea 수 / unique item 수
- **윈도우**: 7일(단기) + 30일(장기) 병행
- **Source 귀속**: 아이템의 `source_id`로 채널에 귀속

### 3.7 `radar_source_metrics` (신규)

```sql
CREATE TABLE radar_source_metrics (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES radar_sources(id),
  date TEXT NOT NULL,
  total_items INTEGER DEFAULT 0,
  new_items_today INTEGER DEFAULT 0,
  total_ideas INTEGER DEFAULT 0,
  avg_relevance REAL DEFAULT 0,
  avg_novelty REAL DEFAULT 0,
  engagement_rate REAL DEFAULT 0,
  conversion_rate_7d REAL DEFAULT 0,
  conversion_rate_30d REAL DEFAULT 0,
  health_score REAL DEFAULT 0.5,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(source_id, date)
);
```

### 3.8 `radar_item_metrics` (신규)

```sql
CREATE TABLE radar_item_metrics (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL UNIQUE REFERENCES radar_items(id),
  topic_relevance REAL DEFAULT 0,
  novelty REAL DEFAULT 0,
  quality REAL DEFAULT 0,
  composite_score REAL DEFAULT 0,
  model_version TEXT,                    -- 평가에 사용된 모델 버전
  evaluated_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### 3.9 `radar_domains` + `radar_source_domains` (신규)

```sql
CREATE TABLE radar_domains (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  tenant_id TEXT REFERENCES tenants(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE radar_source_domains (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES radar_sources(id),
  domain_id TEXT NOT NULL REFERENCES radar_domains(id),
  UNIQUE(source_id, domain_id)
);
```

### 3.10 `radar_crawl_queue` (신규 — 장애 대응 강화)

```sql
CREATE TABLE radar_crawl_queue (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES radar_sources(id),
  url TEXT NOT NULL,
  dedupe_key TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  -- PENDING | PROCESSING | COMPLETED | FAILED | DEAD
  priority INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  parser_type TEXT DEFAULT 'html',
  -- html | rss | youtube | pdf
  failure_code TEXT,
  -- TIMEOUT | PARSE_ERROR | AUTH_REQUIRED | RATE_LIMITED | NETWORK_ERROR
  error TEXT,
  batch_id TEXT,
  scheduled_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,
  next_retry_at INTEGER
);
```

---

## 4. 4축 Health Score + AI 평가 운영 정책

### 4.1 구성 요소

| 축 | 가중치 | 계산 방식 | 데이터 소스 |
|---|:------:|----------|-----------|
| **Topic Relevance** | 30% | 아이템 topic_relevance 평균 | `radar_item_metrics` |
| **Novelty** | 20% | 아이템 novelty 평균 | `radar_item_metrics` |
| **Engagement** | 20% | viewed/total + like/(like+dislike) | `radar_item_user_status` |
| **Idea Conversion** | 30% | primary+secondary 전환율 (30일) | `idea_sources` JOIN |

```
health = (relevance × 0.3) + (novelty × 0.2) + (engagement × 0.2) + (conversion × 0.3)
```

활성화 조건: 수집 아이템 ≥ 20건

### 4.2 AI 평가 운영 정책 (재검토 §3.2 반영)

| 정책 항목 | 결정 |
|----------|------|
| **평가 시점** | 배치 (Nightly Cron) — 인라인 평가는 수집 지연 유발 |
| **평가 실패 fallback** | 실패 시 `composite_score = 0`, `evaluated_at = NULL` 유지 → 다음 배치에서 재시도 |
| **재평가 주기** | 기본 1회 (최초 평가 후 고정). 모델 버전 변경 시 전체 재평가 트리거 |
| **모델 버전 관리** | `radar_item_metrics.model_version` 필드로 추적. 버전 변경 시 이전 버전 스코어와 비교 리포트 생성 |
| **점수 보정** | 모델 변경 시 기존 30일 아이템의 스코어 분포를 비교 → ±20% 이상 드리프트 시 경고 |
| **비용 상한** | 일 500건 × ~2K 토큰/건 = ~1M 토큰/일. claude -p 구독 토큰 활용 (DX-REQ-011) |
| **AI vs 사용자 충돌** | 사용자 피드백 우선 — AI 스코어가 높아도 dislike 비율 > 50%면 건강도에 반영 |

### 4.3 Novelty 구현 세부 (재검토 §3.2 반영)

| 케이스 | 처리 |
|--------|------|
| 같은 주제, 다른 표현 | embedding 코사인 유사도 > 0.85 → novelty 감점 (Phase 3) |
| 같은 기사 재배포 | dedupe_key(title+date hash) 일치 → 수집 단계에서 제거 |
| 비교 범위 | **채널 내부 + 전체 corpus** 이중 비교 (채널 내 30일, 전체 7일) |
| 과도한 novelty | novelty > 0.95 + relevance < 0.3 → 잡음 의심 플래그 |

---

## 5. 아키텍처

### 5.1 수집 파이프라인 (큐 기반 + 장애 대응)

```
[Source] → [Scheduler] → [Crawl Queue] → [Worker] → [Deduper] → [Parser] → [Item]
              (Cron)         (Table)      (Batch)    (dedupe_key)  (type별)     ↓
                                                                          [AI Evaluator]
                                                                           (Nightly)
```

**Queue 운영 정책** (재검토 §3.3 반영):

| 정책 | 값 |
|------|-----|
| 최대 재시도 횟수 | 3회 (`max_retries`) |
| 지수 백오프 | 1차: 1시간, 2차: 6시간, 3차: 24시간 (`next_retry_at` 계산) |
| 영구 실패 기준 | 3회 재시도 실패 → status = `DEAD` + source.consecutive_failures++ |
| Source 비활성화 | `consecutive_failures ≥ 5` → source.status = `FAILED` |
| 동일 source 최소 수집 간격 | `crawl_interval` (기본 86400초 = 1일) |
| 동일 도메인 호출 제한 | 같은 도메인 10초 간격 (rate limit 방지) |
| 배치 크기 | 10건/Cron 실행 (CF Workers 타임아웃 방지) |
| 중복 방지 | `dedupe_key` 일치 시 큐에서 즉시 COMPLETED (수집 스킵) |
| 실패 유형 분류 | `failure_code`: TIMEOUT / PARSE_ERROR / AUTH_REQUIRED / RATE_LIMITED / NETWORK_ERROR |

### 5.2 UI 구조 (운영 액션 중심 — 재검토 §3.4 반영)

```
/radar
├── 탭 1: 피드 (기존 — 기본 탭)
│   └── 각 아이템에 "아이디어로 보내기" 버튼 (S2, Phase 1)
├── 탭 2: 수동 등록 (Phase 1A/1B)
│   ├── URL 입력 + 자동 크롤링
│   ├── 텍스트 직접 입력
│   └── 파일 업로드 (PDF/DOCX/TXT)
├── 탭 3: Source Health (Phase 3)
│   ├── 건강도 요약 카드
│   ├── 채널별 트렌드 차트
│   └── 운영 액션 ──────────────────────────
│       ├── "비활성화 추천" — health < 0.3 소스 목록 + 원클릭 PAUSED
│       ├── "전환 0건 소스" — 최근 30일 전환 없는 소스 보기
│       ├── "고성과 소스 복제" — conversion 높은 소스의 유사 소스 등록 유도
│       └── "도메인별 커버리지" — 등록된 도메인 중 소스 부족 영역 경고
└── 탭 4: 채널 관리 (Phase 2)
    ├── 채널 목록 (카드 뷰 + 3축 필터 + 검색)
    ├── 채널 추가 모달
    ├── 채널 편집 (lifecycle 상태 변경 포함)
    └── 큐 상태 모니터 (진행 중/실패/대기)
```

**Signal → Idea 연결 UX** (재검토 §5.4 반영):

피드 탭의 각 아이템에 최소 1개 명시적 연결 동작:
- **"아이디어로 보내기"** 버튼 → `idea_sources` INSERT (link_type: 'primary')
- 기존 AI 파이프라인 자동 연결 → link_type: 'secondary'
- 아이디어 편집 시 소스 참조 추가 → link_type: 'reference'

### 5.3 API 라우트

| 라우트 | 메서드 | 기능 | Phase |
|--------|--------|------|:-----:|
| `api.radar.sources` | GET/POST | 소스 목록/추가 | 기존 확장 |
| `api.radar.sources.$id` | PATCH/DELETE | 소스 편집/삭제 + lifecycle 변경 | 2 |
| `api.radar.sources.$id.metrics` | GET | 소스별 지표 (일별) | 3 |
| `api.radar.sources.health` | POST | 건강도 일괄 재계산 (Cron) | 3 |
| `api.radar.manual-collect` | POST | 수동 수집 (URL/텍스트) | 1A |
| `api.radar.manual-collect.upload` | POST | 파일 업로드 수집 | 1B |
| `api.radar.items.$id.send-to-idea` | POST | Signal → Idea 전환 | 1A |
| `api.radar.domains` | GET/POST/DELETE | 도메인 CRUD | 2 |
| `api.radar.queue.status` | GET | 수집 큐 상태 | 2 |

---

## 6. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| URL 크롤링 실패율 | Medium | High | 기본 fetch + fallback 텍스트 입력 + failure_code 분류 |
| CF Workers 메모리 (파일 업로드) | High | Medium | 10MB 제한 + 클라이언트사이드 PDF.js |
| Health Score 초기 데이터 부족 | Low | High | ≥ 20건 후 활성화 |
| AI 평가 모델 drift | Medium | Medium | model_version 추적 + ±20% drift 경고 |
| 큐 poison message | Medium | Low | 3회 재시도 → DEAD + source FAILED 전환 |
| 3축 마이그레이션 복잡도 | Medium | Medium | 자동 변환 SQL + 검증 쿼리 |
| Dedupe 과감지 (유사하지만 다른 기사) | Low | Medium | Phase 1은 URL+title hash만, embedding은 Phase 3 |

---

## 7. 실행 계획 (Phase 1 세분화 — 재검토 §4.5 반영)

### Phase 1A: 수동 수집 — URL + 텍스트 (1~2 세션)

1. [ ] 마이그레이션: `radar_sources` + `radar_items` 확장 (collection_type, content_type, raw_content, parsed_content, excerpt, metadata, dedupe_key, status/lifecycle)
2. [ ] 3축 유형 상수 정의 + 기존 데이터 마이그레이션 (web→site)
3. [ ] `idea_sources` 확장 (link_type, created_by)
4. [ ] 수동 수집 UI — URL 입력 + 텍스트 직접 입력
5. [ ] `api.radar.manual-collect` 라우트 (URL fetch + HTML 파싱 → raw_content/parsed_content/excerpt)
6. [ ] 수동 수집용 시스템 소스 (`__manual__`) 자동 생성
7. [ ] **"아이디어로 보내기"** 버튼 (피드 탭 아이템 → idea_sources INSERT)

### Phase 1B: 수동 수집 — 파일 업로드 (1 세션)

8. [ ] `api.radar.manual-collect.upload` 라우트 (PDF/DOCX/TXT → 텍스트 추출)
9. [ ] 클라이언트사이드 PDF.js 텍스트 추출 (CF Workers 메모리 제한 회피)
10. [ ] 파일 업로드 UI + 미리보기

### Phase 2: 채널 관리 + 도메인 + 큐 (2 세션)

11. [ ] 마이그레이션: `radar_domains` + `radar_source_domains` + `radar_crawl_queue`
12. [ ] Source Lifecycle 구현 (ACTIVE/PAUSED/REVIEW/ARCHIVED/FAILED)
13. [ ] 채널 관리 탭 UI (목록 + 추가 + 편집 + lifecycle 상태 변경)
14. [ ] 도메인 CRUD API + UI (태그 선택)
15. [ ] 큐 기반 수집: Cron → Queue → 인라인 처리 + 장애 대응

### Phase 3: 품질 판단 + Health Dashboard (2 세션)

16. [ ] 마이그레이션: `radar_source_metrics` + `radar_item_metrics`
17. [ ] AI 아이템 품질 평가 (Nightly Cron, model_version 추적)
18. [ ] Novelty 평가 (채널 내 30일 + 전체 7일 이중 비교)
19. [ ] Health Score 4축 계산 + conversion_rate 7d/30d 병행
20. [ ] Source Health Dashboard (운영 액션 포함: 비활성화 추천, 전환 0건, 부족 경고)
21. [ ] Cron 건강도 일괄 갱신 + REVIEW 상태 자동 전환

---

## 8. 검토 의견 대응 매트릭스

### 1차 검토 (v0.1 → v0.2)

| # | 검토 의견 | 대응 | 반영 위치 |
|---|----------|------|----------|
| 3.1 | 데이터 모델 불완전 | metrics 분리 테이블 | §3.7~3.8 |
| 3.2 | AI 평가 정의 미흡 | 4축 정의 + 계산 방식 | §4.2 |
| 3.3 | SourceType 혼재 | 3축 분리 | §3.3 |
| 3.4 | Cron 한계 | Queue + Worker | §5.1 |
| 3.5 | 도메인 M:N 불가 | 조인 테이블 | §3.9 |
| 4 | UX 관리 중심 | Health Dashboard | §5.2 |
| 6 | Phase 순서 | 수동 수집 우선 | §7 |

### 재검토 (v0.2 → v0.3)

| # | 검토 의견 | 대응 | 반영 위치 |
|---|----------|------|----------|
| 3.1 | Conversion 이벤트 미정의 | idea_sources.link_type + 전환율 계산 기준 | §3.6 |
| 3.2 | AI 평가 운영 정책 부재 | 7개 정책 항목 + novelty 세부 4케이스 | §4.2~4.3 |
| 3.3 | Queue 장애 대응 미흡 | 10개 운영 정책 + failure_code 분류 | §5.1 |
| 3.4 | Dashboard 행동 부족 | 4개 운영 액션 추가 | §5.2 |
| 5.1 | 원문 저장 구조 없음 | raw_content/parsed_content/excerpt/metadata | §3.5 |
| 5.2 | Dedupe 전략 없음 | 3단계 (URL→title+date→embedding) | §3.5 |
| 5.3 | Source lifecycle 부족 | 5상태 + 전환 규칙 | §3.4 |
| 5.4 | Signal→Idea 연결 없음 | "아이디어로 보내기" 버튼 + link_type 3종 | §3.6, §5.2 |
| 4.5 | Phase 1 과부하 | 1A(URL+텍스트) / 1B(파일) 분할 | §7 |

---

## 9. Next Steps

1. [ ] **즉시**: Phase 1A Design 문서 — 수동 수집 스키마 + URL 파싱 + "아이디어로 보내기" 상세
2. [ ] Phase 1A 구현 시작
3. [ ] 재검토 최종 결론 확인: "Design Spec 1건 추가 → 개발 문서 전환 가능"

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-10 | Initial draft — 인터뷰 기반 요구사항 + 아키텍처 | Sinclair Seo |
| 0.2 | 2026-03-10 | 1차 검토 반영 — 데이터 모델 재설계, 3축 유형, 4축 Health, Phase 순서, UX 전환, 큐 파이프라인 | Sinclair Seo |
| 0.3 | 2026-03-10 | 재검토 반영 — 전환 이벤트 정의, AI 운영 정책, Queue 장애 대응, Dashboard 액션, 원문 저장+Dedupe, Source lifecycle, Phase 1 분할 | Sinclair Seo |
