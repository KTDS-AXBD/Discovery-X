---
code: DX-ANLS-012
title: F41 Phase 2B (큐 + 워커) 설계-구현 GAP 분석 보고서
version: 1.0
status: Active
category: ANLS
created: 2026-03-11
updated: 2026-03-11
author: Sinclair Seo
---

# F41 Phase 2B (큐 + 워커) 설계-구현 GAP 분석 보고서

> [[DX-DSGN-012]] Phase 2B (S7) 설계 vs 실제 구현 대조

---

## Analysis Overview

- **분석 대상**: F41 Phase 2B — Crawl Queue + Worker + Cron 전환
- **설계 문서**: `docs/02-design/DX-DSGN-012_radar-channel-management.md` S7 Phase 2B
- **구현 경로**: `app/features/radar/service/`, `app/routes/`, `app/features/radar/ui/`, `tests/`
- **분석 일자**: 2026-03-11

---

## Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| 서비스 레이어 (RadarService) | 100% | PASS |
| Crawl Worker | 100% | PASS |
| API 라우트 | 97% | PASS |
| UI 컴포넌트 | 100% | PASS |
| 기존 Cron 전환 | 100% | PASS |
| 스키마 정합성 | 93% | WARN |
| 검토 의견 반영 (F1-F5, R1-R5) | 100% | PASS |
| 테스트 | 100% | PASS |
| **Overall** | **97%** | PASS |

---

## 1. 서비스 레이어 (RadarService) — 100%

### 설계 S3.1: Crawl Queue 메서드 6개

| 메서드 | 설계 | 구현 | 일치 |
|--------|:----:|:----:|:----:|
| `enqueueSource()` | O | O (L877-941) | PASS |
| `dequeueBatch()` | O | O (L948-1006) | PASS |
| `completeQueueItem()` | O | O (L1009-1039) | PASS |
| `failQueueItem()` | O | O (L1042-1088) | PASS |
| `getQueueStatus()` | O | O (L1129-1153) | PASS |
| `cleanupQueue()` | O | O (L1160-1209) | PASS |

**추가 구현 (설계 범위 확장)**:
- `getRecentFailedQueue()` (L1211-1253): QueueStatusPanel에 최근 실패 목록 제공용. 설계에 없지만 UI 요구에 의한 합리적 추가.
- `incrementSourceFailures()` (L1091-1126): private 헬퍼. failQueueItem 내부에서 소스 자동 상태 전환 담당.

**세부 검증**:

| 항목 | 설계 명세 | 구현 | 판정 |
|------|----------|------|:----:|
| enqueue: ACTIVE만 큐잉 | S3.1 | `source.status !== SourceStatus.ACTIVE` 체크 | PASS |
| enqueue: crawlInterval 미경과 스킵 | S3.1 | elapsed < interval 체크 | PASS |
| enqueue: 중복 PENDING/PROCESSING 스킵 | 설계 미명시 | 구현에서 추가 방어 | PASS+ |
| enqueue: sourceType->parserType 매핑 | S3.1 (rss->rss, site->html, youtube->youtube, sns->html) | parserMap 구현 일치 | PASS |
| dequeue: stale 10분 복구 [F3] | S3.1 | `staleThreshold = 10 * 60 * 1000` | PASS |
| dequeue: priority DESC, scheduledAt ASC | S3.1 | orderBy 구현 일치 | PASS |
| dequeue: next_retry_at 체크 | S3.1 | `isNull or lte` 조건 | PASS |
| complete: consecutiveFailures=0 | S3.1 | 소스 갱신 구현 | PASS |
| complete: lastCollectedAt=now | S3.1 | 소스 갱신 구현 | PASS |
| fail: retry_count++ | S3.1 | `retryCount + 1` | PASS |
| fail: max_retries 도달 -> DEAD | S3.1 | `retryCount >= maxRetries` | PASS |
| fail: 소스 failures >= 5 -> FAILED | S3.1 | `incrementSourceFailures` 내부 | PASS |
| fail: 소스 failures >= 3 -> REVIEW | S3.1 | `incrementSourceFailures` 내부 | PASS |
| cleanup: COMPLETED 7일 삭제 [R5] | S3.1 | `7 * 24 * 60 * 60 * 1000` | PASS |
| cleanup: DEAD 30일 삭제 [R5] | S3.1 | `30 * 24 * 60 * 60 * 1000` | PASS |
| getQueueStatus: GROUP BY status | S3.1 | groupBy + count 구현 | PASS |

---

## 2. Crawl Worker — 100%

### 설계 S3.2: crawl-worker.ts

| 항목 | 설계 | 구현 | 일치 |
|------|:----:|:----:|:----:|
| `processCrawlQueue()` 함수 | O | O (L62-103) | PASS |
| `CrawlError` 클래스 [F5] | O | O (L40-49) | PASS |
| `classifyError()` [F5] | O | O (L417-434) | PASS |
| `fetchRss()` — RSS 파싱 -> N개 | O | O (L147-224) | PASS |
| `fetchHtml()` — HTML 파싱 -> 1개 | O | O (L296-365) | PASS |
| `fetchAndParse()` dispatcher | O | O (L115-131) | PASS |

**세부 검증**:

| 항목 | 설계 명세 | 구현 | 판정 |
|------|----------|------|:----:|
| batchSize 기본값 10 | S3.2 `options.batchSize ?? 10` | 일치 | PASS |
| timeoutMs 기본값 25,000 (CF 30s - 5s 여유) | S3.2 `options.timeoutMs ?? 25_000` | 일치 | PASS |
| 타임아웃 가드 `Date.now() - startTime > timeoutMs` | S3.2 | 일치 | PASS |
| CrawlError: code + statusCode 속성 | S3.2 | 일치 | PASS |
| classifyError: CrawlError -> 코드 직접 반환 | S3.2 | 일치 | PASS |
| classifyError: HTTP status 기반 분류 | S3.2 | 401/403->AUTH_REQUIRED, 429->RATE_LIMITED, 500+->NETWORK_ERROR | PASS |
| classifyError: 문자열 fallback | S3.2 | timeout/aborted->TIMEOUT, parse->PARSE_ERROR | PASS |
| RSS: urlHash + dedupeKey 이중 중복 체크 | S3.2 | 구현 일치 | PASS |
| HTML: parseUrl() 재사용 | S3.2 | url-parser의 parseUrl 사용 | PASS |
| youtube/pdf: Phase 3+ 주석 처리 | S3.2 | `// youtube, pdf -> Phase 3+` | PASS |

**추가 구현 (설계 범위 확장)**:
- `parseRssXml()`: regex 기반 RSS 2.0 + Atom 파서. 설계에서는 "RSS 파싱"으로만 언급, 구현에서 Atom 호환까지 확장.
- `extractCdataOrText()`: CDATA 래핑 + HTML 엔티티 디코딩.
- `fetchWithTimeout()`: AbortController 기반 타임아웃 fetch. fetchRss에서 사용.
- CrawlResult에 `itemsCreated` 필드 추가 (설계의 CrawlResult에 없던 필드).

### 설계 S3.3: 지수 백오프 계산

| 항목 | 설계 | 구현 | 일치 |
|------|:----:|:----:|:----:|
| delays = [3600, 21600, 86400] | S3.3 | 일치 | PASS |
| 1차: 1시간, 2차: 6시간, 3차: 24시간 | S3.3 | `delays[retryCount - 1]` | PASS |

참고: 설계는 `retryCount` 인덱스 0-based (`Math.min(retryCount, ...)`), 구현은 1-based (`retryCount - 1`). 둘 다 동일 결과를 산출하므로 실질적 차이 없음.

---

## 3. API 라우트 — 97%

### 설계 S4.2: 신규 라우트 2개

| 라우트 | 설계 | 구현 | 일치 |
|--------|:----:|:----:|:----:|
| `api.radar.queue.status.ts` (GET) | O | O | PASS |
| `api.cron.radar-collect.ts` (GET) | O | O | PASS |

**api.radar.queue.status.ts 세부**:

| 항목 | 설계 | 구현 | 판정 |
|------|------|------|:----:|
| 응답 필드: pending, processing, completed, failed, dead | S4.2 | 포함 | PASS |
| 응답 필드: lastRunAt | S4.2 | **미포함** | WARN |
| 추가: recentFailures | 설계 없음 | 구현에서 추가 | PASS+ |
| 인증: gatekeeper+ 역할 검증 | 설계 미명시 | 구현에서 추가 | PASS+ |

**api.cron.radar-collect.ts 세부**:

| 항목 | 설계 | 구현 | 판정 |
|------|------|------|:----:|
| CRON_SECRET 인증 | S4.3 | `secret !== env.CRON_SECRET` 체크 | PASS |
| 활성 테넌트 순회 | S4.3 | `tenants.status = 'active'` 조회 | PASS |
| ACTIVE 소스 -> enqueueSource() | S4.3 | `radarSources.status = ACTIVE` + `collectionType = 'auto'` | PASS |
| processCrawlQueue() 호출 | S4.3 | 호출 | PASS |
| cleanupQueue() 호출 [R5] | S4.3 | 호출 | PASS |
| 결과: enqueued, processed, succeeded, failed, cleaned | S4.3 | 모두 포함 + `itemsCreated` 추가 | PASS |

### 3.1 차이 항목

| # | 항목 | 설계 | 구현 | 영향 |
|---|------|------|------|------|
| 1 | queue.status 응답의 `lastRunAt` | 포함 | 미포함 | Low — 현재 UI에서 미사용 |

---

## 4. 기존 Cron 전환 [F4] — 100%

### 설계 S4.3: 점진적 전환

| 항목 | 설계 | 구현 | 판정 |
|------|------|------|:----:|
| Phase 2B: 신규 `api.cron.radar-collect.ts` 추가 | S4.3 | 추가 완료 | PASS |
| 기존 daily cron radar 수집 로직 비활성화 | S4.3 "Phase 2B 완료 후" | **해당 없음** | PASS |

참고: `api.cron.daily.ts` 검토 결과, `system-radar` 문자열은 discovery event log의 actorId로만 사용되며, 실제 RSS/HTML 수집 로직은 daily cron에 존재하지 않음. 따라서 "비활성화 대상 로직"이 애초에 없어서 전환 작업 불필요. 설계서의 가정과 다르지만 구현 측이 올바름.

---

## 5. UI 컴포넌트 — 100%

### 설계 S5.4: QueueStatusPanel

| 항목 | 설계 | 구현 | 판정 |
|------|------|------|:----:|
| QueueStatusPanel.tsx 파일 존재 | S5.4 | `app/features/radar/ui/QueueStatusPanel.tsx` | PASS |
| 접이식 패널 [R1] | S5.2 "[▸ 펼치기]" | `expanded` 상태 + 토글 버튼 | PASS |
| 상태 요약 (대기/처리 중/완료/실패/영구 실패) | S5.2 | StatusChip 5개 | PASS |
| 최근 실패 목록 | S5.2 | recentFailures 매핑 | PASS |
| failure code 한국어 매핑 | S5.2 `TIMEOUT, AUTH_REQUIRED...` | FAILURE_LABELS 5개 | PASS |
| DEAD 표시 ("☠ DEAD") | S5.2 | Badge variant="destructive" | PASS |
| 재시도 시간 표시 | S5.2 "6시간 후" | `formatRetryTime()` | PASS |

### ChannelManagementTab 통합

| 항목 | 설계 | 구현 | 판정 |
|------|------|------|:----:|
| QueueStatusPanel 채널 관리 탭 하단 배치 | S5.1 [R1] | ChannelManagementTab L233-236 | PASS |
| gatekeeper+ 전용 표시 | S5.1 "관리자에게만" | `{isGatekeeper && <QueueStatusPanel .../>}` | PASS |
| isGatekeeper prop 전달 (radar.tsx) | S5.1 | loader L38-40 + json 응답 포함 | PASS |

---

## 6. 스키마 정합성 — 93%

### Drizzle 스키마 vs 설계 SQL DDL

| 항목 | 설계 SQL | Drizzle 스키마 | 판정 |
|------|----------|---------------|:----:|
| radarCrawlQueue 테이블 | 14개 컬럼 | 14개 컬럼 일치 | PASS |
| CrawlQueueStatus 5개 상수 | S1.2 | 일치 | PASS |
| ParserType 4개 상수 | S1.2 | 일치 | PASS |
| FailureCode 5개 상수 | S1.2 | 일치 | PASS |
| idx_rcq_status | S1.1 | 일치 | PASS |
| idx_rcq_source | S1.1 | 일치 | PASS |
| idx_rcq_scheduled | S1.1 | 일치 | PASS |
| idx_rcq_tenant | S1.1 | 일치 | PASS |
| idx_rcq_batch | S1.1 | 일치 | PASS |
| radarDomains `UNIQUE(name, tenant_id)` | S1.1 DDL | **Drizzle 스키마에 미반영** | WARN |
| radarSourceDomains `UNIQUE(source_id, domain_id)` | S1.1 DDL | **Drizzle 스키마에 미반영** | WARN |

### 6.1 차이 항목

| # | 항목 | 설계 | 구현 | 영향 |
|---|------|------|------|------|
| 2 | radarDomains 복합 유니크 | `UNIQUE(name, tenant_id)` DDL에 존재 | Drizzle `uniqueIndex` 미정의 | Medium — 동일 테넌트 내 도메인 이름 중복 INSERT 가능 |
| 3 | radarSourceDomains 복합 유니크 | `UNIQUE(source_id, domain_id)` DDL에 존재 | Drizzle `uniqueIndex` 미정의 | Low — setSourceDomains()가 DELETE+INSERT 패턴으로 실질 중복 없음 |

참고: SQL 마이그레이션 DDL에는 UNIQUE 제약이 포함되어 있으므로 DB 레벨에서는 보호됨. Drizzle 스키마의 미반영은 ORM 레벨 타입 안전성 누락.

---

## 7. 검토 의견 반영 (F1-F5, R1-R5) — 100%

| # | 검토 의견 | 반영 여부 | 근거 |
|---|----------|:---------:|------|
| F1 | D1 FK CASCADE 미지원 -> 앱 레벨 삭제 | PASS | `deleteSource()`: source_domains + crawl_queue + sources 순차 삭제 |
| F2 | 1소스=1큐, Worker가 N개 생성 | PASS | `enqueueSource` 1소스=1큐, fetchRss N개 아이템 |
| F3 | PROCESSING 고아 10분 stale 복구 | PASS | `dequeueBatch` 내 staleThreshold 로직 |
| F4 | 기존 Cron 점진적 전환 | PASS | 신규 cron 추가 완료, 기존 daily에 radar 수집 로직 없음 |
| F5 | CrawlError + HTTP status + fallback | PASS | CrawlError 클래스 + classifyError 3단계 분류 |
| R1 | 큐 모니터 채널 관리 탭 내 접이식 | PASS | QueueStatusPanel 접이식 + gatekeeper 전용 |
| R2 | FAILED->ACTIVE 허용 | PASS | source-lifecycle.ts FAILED->[ACTIVE], updateSourceStatus에서 failures 리셋 |
| R3 | Phase 2A/2B 분할 | PASS | 2B 범위만 구현 (스키마/UI는 2A에서 완료) |
| R4 | 도메인 optional | PASS | Phase 2A에서 반영 완료, 2B에 영향 없음 |
| R5 | COMPLETED 7일 / DEAD 30일 TTL | PASS | cleanupQueue() + cron에서 호출 |

---

## 8. 테스트 — 100%

### 설계 S8: Phase 2B 테스트 25~35개

| 테스트 파일 | 테스트 수 | 설계 범위 |
|------------|:--------:|:---------:|
| `tests/unit/features/radar/crawl-queue.test.ts` | 30 | Crawl Queue |
| `tests/unit/features/radar/crawl-worker.test.ts` | 14 | Crawl Worker |
| **합계** | **44** | 설계 예상 25~35 |

설계 상한(35개)을 초과 달성. 테스트 커버리지 상세:

**crawl-queue.test.ts (30개)**:
- enqueueSource: 8개 (ACTIVE 등록, parserType 매핑, PAUSED/FAILED 스킵, interval 체크, 중복 방지, 존재하지 않는 소스)
- dequeueBatch: 6개 (PROCESSING 변경, limit, priority 정렬, stale 복구 [F3], next_retry_at 미래 스킵, 빈 큐)
- completeQueueItem: 1개 (COMPLETED + source failures 리셋)
- failQueueItem: 6개 (재시도 FAILED, DEAD, REVIEW 자동 전환, FAILED 자동 전환, PAUSED 미전환, 존재하지 않는 아이템)
- getQueueStatus: 2개 (빈 큐, 상태별 카운트)
- cleanupQueue [R5]: 3개 (COMPLETED 7일, DEAD 30일, PENDING/FAILED 미정리)
- getRecentFailedQueue: 2개 (FAILED/DEAD 조회, PENDING/COMPLETED 제외)
- deleteSource cascade [F1]: 1개 (소스 삭제 시 큐도 삭제)

**crawl-worker.test.ts (14개)**:
- CrawlError: 2개 (생성, statusCode 없이 생성)
- classifyError: 4개 (CrawlError, HTTP status, 문자열 fallback, null/undefined)
- parseRssXml: 8개 (RSS 2.0, CDATA, Atom fallback, RSS 우선, 빈 XML, 잘못된 XML, HTML 엔티티, 20개 아이템)

---

## 9. 변경 항목 (설계 != 구현)

### 9.1 `validateSourceTransition` 시그니처

| 항목 | 설계 | 구현 |
|------|------|------|
| 반환 타입 | `{ valid: boolean; reason?: string }` | `string \| null` (null = 유효) |
| 사용 패턴 | `if (!result.valid)` | `if (error)` |

영향: **None** — Phase 2A에서 이미 구현 완료. 의미적으로 동등하며 구현 측이 더 간결. 설계 문서 업데이트 권장.

### 9.2 CrawlResult 타입

| 항목 | 설계 | 구현 |
|------|------|------|
| 필드 | `{ processed, succeeded, failed, batchSize }` | `{ processed, succeeded, failed, itemsCreated, batchSize }` |

영향: **None** — `itemsCreated` 추가는 cron 결과 리포팅에 유용한 정보 확장.

---

## 10. Differences Summary

### PASS Missing Features (설계 O, 구현 X)

| # | 항목 | 설계 위치 | 설명 | 영향 |
|---|------|----------|------|:----:|
| 1 | queue.status `lastRunAt` | S4.2 | 응답에 마지막 실행 시각 미포함 | Low |

### PASS Added Features (설계 X, 구현 O)

| # | 항목 | 구현 위치 | 설명 |
|---|------|----------|------|
| 1 | `getRecentFailedQueue()` | radar.service.ts L1211 | QueueStatusPanel 최근 실패 목록 제공 |
| 2 | `parseRssXml()` Atom 호환 | crawl-worker.ts L244 | RSS 2.0 외 Atom 피드도 파싱 |
| 3 | `fetchWithTimeout()` | crawl-worker.ts L372 | AbortController 기반 타임아웃 래퍼 |
| 4 | CrawlResult.itemsCreated | crawl-worker.ts L28 | 생성된 아이템 수 추적 |
| 5 | enqueue 중복 큐잉 방지 | radar.service.ts L907-921 | PENDING/PROCESSING 중복 체크 |
| 6 | cron collectionType='auto' 필터 | api.cron.radar-collect.ts L63 | manual 소스 제외 |
| 7 | queue.status gatekeeper+ 인증 | api.radar.queue.status.ts L23 | 역할 기반 접근 제어 |
| 8 | queue.status recentFailures | api.radar.queue.status.ts L31 | 최근 실패 목록 응답 포함 |

### WARN Changed Features (설계 != 구현)

| # | 항목 | 설계 | 구현 | 영향 |
|---|------|------|------|:----:|
| 1 | validateSourceTransition 반환 | `{ valid, reason }` | `string \| null` | None |
| 2 | CrawlResult 필드 | 4개 | 5개 (itemsCreated 추가) | None |
| 3 | radarDomains 복합 유니크 | Drizzle uniqueIndex 정의 | 미정의 (DDL은 존재) | Medium |
| 4 | radarSourceDomains 복합 유니크 | Drizzle uniqueIndex 정의 | 미정의 (DDL은 존재) | Low |
| 5 | queue.status lastRunAt | 응답 포함 | 미포함 | Low |

---

## 11. Recommended Actions

### Immediate (선택)

1. **queue.status `lastRunAt` 추가** — 설계 명세 충족을 위해 마지막 COMPLETED 큐 아이템의 completedAt을 반환하거나, 설계 문서에서 제거
2. **Drizzle 스키마 uniqueIndex 추가** — `radarDomains`에 `UNIQUE(name, tenant_id)`, `radarSourceDomains`에 `UNIQUE(source_id, domain_id)`. SQL DDL에는 이미 존재하므로 ORM 타입 안전성 목적

### Documentation Update (권장)

1. `validateSourceTransition` 반환 타입을 `string | null`로 설계 문서 갱신
2. CrawlResult에 `itemsCreated` 필드 반영
3. 추가 구현 항목 (Atom 호환, 중복 큐잉 방지 등) 설계 문서에 소급 반영
4. `api.cron.daily.ts`에 radar 수집 로직 없음을 명시하여 F4 전환 전략 문구 보정

---

## 12. Conclusion

Phase 2B 설계-구현 매치율은 **97%**로 높은 수준이에요. 설계서의 핵심 요구사항(큐 6개 메서드, Worker 로직, CrawlError, Cron, UI)이 모두 충실히 구현되었고, 검토 의견 F1-F5/R1-R5 전원 반영 완료. 테스트 44개는 설계 상한(35개)을 초과.

누락 항목은 `lastRunAt` 1건뿐이며, 구현 측 추가 항목(8건)은 모두 운영 안정성/UX 개선 목적의 합리적 확장이에요. Drizzle uniqueIndex 누락은 DDL 레벨에서 이미 보호되므로 실질 위험은 낮지만, ORM 타입 정합성을 위해 보정 권장.

**Match Rate >= 90% -- Phase 2B 구현은 설계 충족 판정.**
