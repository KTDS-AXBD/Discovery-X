# Discovery-X Cron 엔드포인트 등록 가이드

> 프로덕션 URL: **https://dx.minu.best**
> 외부 Cron 서비스: **cron-job.org**
> 최종 업데이트: 2026-02-26 (13개 — Cron 통합 리팩토링 반영)

---

## 인증 방식

모든 Cron 엔드포인트는 `CRON_SECRET` 환경 변수로 인증한다.
엔드포인트에 따라 **두 가지 인증 패턴**이 사용된다:

| 패턴 | 헤더/파라미터 | 대상 엔드포인트 |
|------|-------------|---------------|
| **Query Param** | `?secret=$CRON_SECRET` | daily, agent-review, embeddings, lab, weekly-summary |
| **Bearer Token** | `Authorization: Bearer $CRON_SECRET` | signal-route, vectorize, maintenance, matrix-scoring |

---

## 전체 Cron 엔드포인트 목록 (13개) — 현행

> 2026-02-26 Cron 통합 리팩토링 반영 (19→13: maintenance 신규 + alerts/log-archive/memory-compact/projection-sync/pattern-extract 통합, lab/vectorize 파라미터 방식으로 전환)

| # | 엔드포인트 | HTTP | 인증 | Feature Flag | 권장 스케줄 | cron-job.org ID |
|---|----------|------|------|-------------|-----------|----------------|
| 1 | `/api/cron/daily` | GET | Query Param | — | 매일 09:00 KST | 7211996 |
| 2 | `/api/cron/agent-review` | POST | Query Param | — (autonomyLevel ≥ 2) | 매일 10:00 KST | 7213910 |
| 3 | `/api/cron/embeddings` | GET | Query Param | — | 매 30분 | 7227104 |
| 4 | `/api/cron/weekly-summary` | GET | Query Param | — | 매주 월요일 09:00 KST | 7288786 |
| 5 | `/api/cron/signal-route` | GET | Bearer | `pipelineBridge` | 매 15분 | 7288789 |
| 6 | `/api/cron/matrix-scoring` | POST | Bearer | — | 매일 06:30 KST | 7288800 |
| 7 | `/api/cron/maintenance?task=all` | POST | Bearer | — | 매주 일요일 03:00 KST | 7319976 |
| 8 | `/api/cron/maintenance?task=pattern-extract` | POST | Bearer | — | 매일 04:00 KST | 7319980 |
| 9 | `/api/cron/lab?mode=extract` | GET | Query Param | — | 매일 11:00 KST | 7319981 |
| 10 | `/api/cron/lab?mode=analyze` | GET | Query Param | — | 매일 12:00 KST | 7319982 |
| 11 | `/api/cron/vectorize?type=graph` | GET | Bearer | `vectorizeSearch` | 매 30분 | 7319983 |
| 12 | `/api/cron/vectorize?type=memory` | GET | Bearer | `vectorizeSearch` | 매 30분 | 7319985 |
| 13 | `/api/cron/vectorize?type=signal` | GET | Bearer | `vectorizeSearch` | 매 30분 | 7319988 |

---

## cron-job.org 등록 설정

### 공통 설정

- **Request Timeout**: 30초
- **Notification**: 실패 시 이메일 알림 활성화
- **Save responses**: 활성화 (디버깅용)
- **Timezone**: Asia/Seoul (KST, UTC+9)

### 인증 패턴별 cron-job.org 설정

#### Query Param 방식

- **URL**: `https://dx.minu.best/api/cron/{endpoint}?secret=YOUR_CRON_SECRET`
- **Method**: GET 또는 POST (엔드포인트별 상이)
- **Headers**: 없음

#### Bearer Token 방식

- **URL**: `https://dx.minu.best/api/cron/{endpoint}`
- **Method**: GET 또는 POST (엔드포인트별 상이)
- **Headers**:
  ```
  Authorization: Bearer YOUR_CRON_SECRET
  ```

---

## curl 테스트 명령어

### Query Param 인증 (GET)

```bash
# daily — 일간 알림 + 자동 종료
curl "https://dx.minu.best/api/cron/daily?secret=$CRON_SECRET"

# alerts — 알림 규칙 스캔
curl "https://dx.minu.best/api/cron/alerts?secret=$CRON_SECRET"

# embeddings — 임베딩 동기화
curl "https://dx.minu.best/api/cron/embeddings?secret=$CRON_SECRET"

# lab-extract — 온톨로지 추출
curl "https://dx.minu.best/api/cron/lab-extract?secret=$CRON_SECRET"

# lab-analyze — 온톨로지 분석
curl "https://dx.minu.best/api/cron/lab-analyze?secret=$CRON_SECRET"

# pattern-extract — 패턴 추출
curl "https://dx.minu.best/api/cron/pattern-extract?secret=$CRON_SECRET"

# shadow-analyze — 섀도우 분석
curl "https://dx.minu.best/api/cron/shadow-analyze?secret=$CRON_SECRET"

# weekly-summary — 주간 요약 이메일
curl "https://dx.minu.best/api/cron/weekly-summary?secret=$CRON_SECRET"

# log-archive — 로그 아카이브
curl "https://dx.minu.best/api/cron/log-archive?secret=$CRON_SECRET"
```

### Query Param 인증 (POST)

```bash
# agent-review — AI 에이전트 자율 리뷰
curl -X POST "https://dx.minu.best/api/cron/agent-review?secret=$CRON_SECRET"
```

### Bearer Token 인증 (GET)

```bash
# signal-route — 시그널 자동 라우팅
curl -H "Authorization: Bearer $CRON_SECRET" https://dx.minu.best/api/cron/signal-route

# memory-vectorize — 메모리 벡터화
curl -H "Authorization: Bearer $CRON_SECRET" https://dx.minu.best/api/cron/memory-vectorize

# signal-vectorize — 시그널 벡터화
curl -H "Authorization: Bearer $CRON_SECRET" https://dx.minu.best/api/cron/signal-vectorize

# graph-vectorize — 그래프 벡터화
curl -H "Authorization: Bearer $CRON_SECRET" https://dx.minu.best/api/cron/graph-vectorize

# profile-learn — 프로필 학습
curl -H "Authorization: Bearer $CRON_SECRET" https://dx.minu.best/api/cron/profile-learn
```

### Bearer Token 인증 (POST)

```bash
# memory-compact — 메모리 압축
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://dx.minu.best/api/cron/memory-compact

# projection-sync — 프로젝션 동기화
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://dx.minu.best/api/cron/projection-sync

# matrix-scoring — 매트릭스 스코어링
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://dx.minu.best/api/cron/matrix-scoring

# briefing — 일간 브리핑
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://dx.minu.best/api/cron/briefing
```

---

## 권장 스케줄 요약

### 매일 실행

| 시간 (KST) | 엔드포인트 | 설명 |
|------------|----------|------|
| 04:00 | pattern-extract | 패턴 추출 (최근 7일 decision_logs) |
| 05:00 | shadow-analyze | 섀도우 분석 (pending shadow_runs) |
| 06:30 | matrix-scoring | 매트릭스 시그널 보정 재계산 |
| 07:00 | briefing | 일간 브리핑 Projection 갱신 |
| 09:00 | daily | 일간 알림 + 기한 초과 자동 종료 |
| 09:30 | alerts | KPI 임계치/SLA 위반 알림 |
| 10:00 | agent-review | AI 에이전트 자율 리뷰 |
| 11:00 | lab-extract | 온톨로지 추출 |
| 12:00 | lab-analyze | 온톨로지 분석 |

### 매 15~30분 실행

| 주기 | 엔드포인트 | 설명 |
|-----|----------|------|
| 매 15분 | signal-route | 시그널 자동 라우팅 |
| 매 30분 | embeddings | Discovery/Evidence 임베딩 동기화 |
| 매 30분 | memory-vectorize | Agent Memory 벡터화 |
| 매 30분 | signal-vectorize | Shared Signal 벡터화 |
| 매 30분 | graph-vectorize | Graph 노드 벡터화 |

### 매주 실행

| 시간 (KST) | 엔드포인트 | 설명 |
|------------|----------|------|
| 일요일 03:00 | memory-compact | 메모리 압축 (아카이브 + 토큰 예산) |
| 일요일 03:00 | log-archive | 30일 이상 decision_logs 아카이브 |
| 일요일 04:00 | projection-sync | Projection 일괄 동기화 |
| 일요일 05:00 | profile-learn | 프로필 학습 |
| 월요일 09:00 | weekly-summary | 주간 요약 이메일 |

---

## Health 엔드포인트

```bash
# 인증 불요 — 외부 모니터링 서비스에서 호출 가능
curl https://dx.minu.best/api/health
```

응답 예시:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-19T00:00:00.000Z",
  "version": "v6.15",
  "checks": {
    "database": { "status": "ok", "latencyMs": 5 },
    "vectorize": { "status": "ok" },
    "featureFlags": { ... },
    "cronEndpoints": 19
  }
}
```

- **200**: healthy
- **503**: degraded (DB 연결 실패 등)

cron-job.org에서 `/api/health`를 1분 간격으로 모니터링 등록 권장.

---

## Feature Flag 의존성 참고

일부 엔드포인트는 Feature Flag가 비활성이면 `{ skipped: true }` 응답을 반환한다:

| Feature Flag | 영향 받는 엔드포인트 |
|-------------|-------------------|
| `FF_VECTORIZE_SEARCH` | memory-vectorize, signal-vectorize, graph-vectorize |
| `FF_PIPELINE_BRIDGE` | signal-route |
| `FF_PROFILE_LEARNER` | profile-learn |

Feature Flag는 `wrangler.toml`의 환경 변수 또는 Cloudflare Dashboard에서 설정한다.
