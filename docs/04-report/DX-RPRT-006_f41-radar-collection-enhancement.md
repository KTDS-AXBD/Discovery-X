---
code: DX-RPRT-006
title: F41 아이템 수집 시스템 고도화 완료 보고
version: "1.0"
status: Active
category: RPRT
created: 2026-03-13
updated: 2026-03-13
author: Sinclair Seo
---

# F41 아이템 수집 시스템 고도화 완료 보고

> **Feature**: F41 — Signal Capture Engine 고도화
> **Requirement**: DX-REQ-012 (P1)
> **Duration**: 2026-03-10 (S356) ~ 2026-03-13 (S391)
> **Owner**: Sinclair Seo
> **Project**: Discovery-X v0.6.0 → v0.7.0

---

## Executive Summary

### 핵심 지표

| 항목 | 결과 |
|------|------|
| **Design Match Rate** | 94.9% (전체), 97% (Phase 2B), 97% (Phase 3A) |
| **Files Created/Modified** | 27 소스 + 19 라우트 + 12 테스트 = 58파일 |
| **Lines of Code** | 6,698 LOC (radar feature 전체) |
| **Tests** | 276개 (유닛 215 + 통합 33 + E2E 28) |
| **All Tests Passing** | Yes |
| **Migrations** | 4개 (0055, 0057, 0058, 0061) |
| **Architecture Compliance** | 100% |
| **Convention Compliance** | 98% |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **문제 해결** | 수집 채널이 개발자 DB INSERT에 의존하고, 품질 판단 체계가 없어 노이즈가 지속되던 문제를 해결. 수동 수집 경로 없음 → 3가지 수동 수집(URL/텍스트/파일) + 자동 큐 파이프라인 구축. 58개 채널 중 43개 미분류 → AI 일괄 분류 도구 제공 |
| **솔루션** | 4단계 점진 구현: (1) 수동 수집 3경로 (2) 채널 자율 관리 + 도메인/폴더 분류 + 큐 기반 파이프라인 (3) 4축 Health Score + AI 품질 평가 + 운영 대시보드 (4) 폴더 고도화 + AI 분류 추천. 설계 문서 5건 + 분석 3건 기반 SDD 방식 |
| **기능/UX 변화** | Radar 페이지 4-탭 구조: 피드(실행이력+최근아이템) → 수동등록(URL/텍스트/파일) → Source Health(4축 건강도+운영액션) → 채널관리(카드뷰+도메인/폴더/유형 그룹핑). "아이디어로 보내기" 버튼으로 Signal→Idea 명시적 전환. AI 일괄 분류로 미분류 채널 원클릭 정리 |
| **핵심 가치** | Signal Capture Engine — 정보 수집 민주화 + 품질 자동 관리 + Signal→Idea 연결. Discovery 파이프라인의 입력 품질을 정량화하고, 운영자가 데이터 기반으로 채널을 관리할 수 있게 됨. 4축 Health Score로 저성과 채널 자동 감지 + REVIEW 전환 |

---

## PDCA 사이클 요약

### Plan

**계획 문서**: [[DX-PLAN-009]] v0.4 — "아이템 수집 시스템 고도화 — Signal Capture Engine"

10개 Scope 항목(S1~S10)을 4개 Phase로 분할:

| Phase | 범위 | 예상 세션 | 실제 세션 |
|:-----:|------|:--------:|:--------:|
| 1A | 수동 수집 — URL + 텍스트 + Signal→Idea | 1~2 | 2 (S356~S357) |
| 1B | 수동 수집 — 파일 업로드 | 1 | 1 (S358) |
| 2A | 채널 관리 + 도메인 + Source Lifecycle | 1 | 1 (S360) |
| 2B | 큐 기반 수집 파이프라인 + 장애 대응 | 1 | 1 (S361) |
| 3A | Health Score 서비스 + Cron + API | 1 | 1 (S362) |
| 3B | Health Dashboard UI + 운영 액션 | 1 | 2 (S366~S367) |
| 3C | AI 아이템 평가 + 도메인 커버리지 | - | 1 (S388) |
| 4 | 폴더 고도화 | 1 | 2 (S385~S387) |
| 4+ | AI 분류 추천 + E2E + 버그 수정 | - | 2 (S390~S391) |
| **합계** | | **6~8** | **13** |

검토 2회(v0.1→v0.2, v0.2→v0.3) + 폴더 확장(v0.4)으로 Plan 품질 강화.

### Design

5건의 설계 문서:

| 문서 | 제목 | Phase |
|------|------|:-----:|
| [[DX-DSGN-010]] | Radar 수동 수집 + Signal→Idea 연결 | 1A |
| [[DX-DSGN-012]] | Radar 채널 관리 + 도메인 분류 + 수집 큐 | 2A+2B |
| [[DX-DSGN-013]] | Radar Health Score + AI 품질 평가 + Dashboard | 3A+3B |
| [[DX-DSGN-014]] | Radar 폴더 시스템 고도화 | 4 |
| - | Phase 1B (파일 업로드) — 사후 구현, 설계 문서 미작성 | 1B |

### Do (구현)

#### 데이터 모델

**신규 테이블 4개**:
- `radar_domains` — 도메인 분류 마스터 (M:N)
- `radar_source_domains` — 채널↔도메인 조인
- `radar_crawl_queue` — 수집 큐 (14 컬럼, 장애 대응 필드 포함)
- `radar_source_metrics` — 채널별 일별 건강도 스냅샷

**확장 테이블 3개**:
- `radar_sources` — +5 컬럼 (collection_type, status, crawl_interval, last_collected_at, consecutive_failures)
- `radar_items` — +6 컬럼 (content_type, raw_content, parsed_content, excerpt, item_metadata, dedupe_key)
- `idea_sources` — +2 컬럼 (link_type, created_by)

**기존 테이블 활용 2개**:
- `radar_item_metrics` — AI 품질 평가 결과 (마이그레이션 0058)
- `radar_folders` / `radar_source_folders` — 폴더 시스템 (마이그레이션 0061)

#### 서비스 레이어

| 서비스 | LOC | 주요 기능 |
|--------|:---:|----------|
| `radar.service.ts` | 1,378 | 30+ 메서드 — CRUD, 수동수집, 도메인/폴더, 큐 6종, lifecycle |
| `health-metrics.ts` | 490 | 4축 건강도 집계, REVIEW 자동 전환, 대시보드 데이터, 도메인 커버리지, 미분류 소스 |
| `crawl-worker.ts` | 434 | 배치 처리, RSS/HTML 파서, CrawlError, 지수 백오프 |
| `item-evaluator.ts` | 292 | LLM 기반 3축 품질 평가 (topicRelevance/novelty/quality), BudgetBlockedError 핸들링 |
| `source-classifier.ts` | 272 | LLM 기반 도메인/폴더 분류 추천, 5건 배치, confidence 스코어 |
| `url-parser.ts` | 215 | URL 정규화, HTML 파싱, dedupe 키 생성 |
| `file-extractor.ts` | 145 | 클라이언트사이드 PDF.js 텍스트 추출 |
| `health-score.ts` | 118 | 4축 가중 합산, engagement 계산, composite 스코어 |
| `source-lifecycle.ts` | 113 | 5상태 전환 규칙, 검증 함수, UI 설정 |

#### API 라우트 (19개)

| 카테고리 | 라우트 수 | 주요 엔드포인트 |
|----------|:--------:|---------------|
| CRUD | 4 | sources, domains, folders, radar.tsx |
| 수동 수집 | 3 | manual-collect, upload, send-to-idea |
| Health | 3 | health (GET), health.actions (POST), health.classify (POST) |
| Cron | 3 | radar-collect, radar-health, radar-eval |
| Queue | 1 | queue.status |
| 기타 | 5 | reaction, status, runs, summarize, trigger |

#### UI 컴포넌트 (17개)

| Phase | 컴포넌트 | 설명 |
|:-----:|----------|------|
| 1A | ManualCollectTab, UrlCollectForm, TextCollectForm, SendToIdeaButton | 수동 수집 3경로 + Signal→Idea |
| 1B | FileUploadForm | 파일 업로드 |
| 2 | ChannelManagementTab, ChannelCard, ChannelFormModal, DomainTagSelect, QueueStatusPanel | 채널 관리 + 큐 모니터 |
| 3 | SourceHealthTab, HealthSummaryCards, OperationActions, HealthScoreBadge | Health Dashboard + 운영 액션 |
| 4 | FolderTagSelect, ColorPicker | 폴더 선택 + 색상 팔레트 |

### Check (GAP 분석)

3건의 분석 보고서:

| 문서 | 범위 | Match Rate | 잔여 GAP |
|------|------|:----------:|:--------:|
| [[DX-ANLS-012]] | Phase 2B | 97% | lastRunAt 1건 (Low) |
| [[DX-ANLS-013]] | Phase 3A | 97% | **해소 완료** (unique+index 2건) |
| [[DX-ANLS-014]] | 전체 Phase | 94.9% | 테스트 3건(Low) + API 통합 1건(Medium) |

**잔여 GAP 상세 (DX-ANLS-014 기준)**:

| # | 항목 | 영향 | 상태 |
|---|------|:----:|------|
| G1 | url-parser.test.ts 독립 파일 | Low | manual-collect.test에서 간접 커버 |
| G2 | send-to-idea.test.ts 독립 파일 | Low | manual-collect.test에서 간접 커버 |
| G3 | API 통합 테스트 (radar) | Medium | 전체 API 통합 테스트 백로그 |
| G4 | item-evaluator.test.ts | **해소** | S388에서 17개 테스트 작성 |
| G5-6 | SourceHealthList/Row 인라인 | Low | 의도적 통합 (210줄 적정 규모) |

### Act (버그 수정)

| 세션 | 항목 | 원인 | 해결 |
|:----:|------|------|------|
| S391 | BUG-01: ChannelFormModal 저장 크래시 | Radix Select + Dialog compose-refs 충돌 | 네이티브 `<select>` + 2단계 closing 패턴 |
| S391 | BUG-02: 탭 상태 리셋 | Remix action 후 useState 초기화 | `useSearchParams` URL 기반 탭 상태 |
| S388 | GAP-1: .unique() 누락 | Drizzle 스키마 불일치 | `.unique()` + `evaluatedIdx` 추가 |

---

## 테스트 커버리지

### 유닛 테스트 (10파일, 215개)

| 테스트 파일 | 테스트 수 | Phase |
|------------|:--------:|:-----:|
| radar-service.test.ts | 37 | 2A+2B |
| crawl-queue.test.ts | 30 | 2B |
| source-lifecycle.test.ts | 25 | 2A |
| health-metrics.test.ts | 29 | 3A |
| health-score.test.ts | 22 | 3A |
| item-evaluator.test.ts | 17 | 3C |
| source-classifier.test.ts | 16 | 4+ |
| manual-collect.test.ts | 15 | 1A |
| crawl-worker.test.ts | 14 | 2B |
| domain.test.ts | 10 | 2A |

### 통합/E2E 테스트 (2파일, 41개)

| 테스트 파일 | 테스트 수 | 비고 |
|------------|:--------:|------|
| radar-bd.test.ts | 13 | Radar BD API 통합 |
| radar-f41-e2e.test.ts | 28 | Playwright E2E — 4탭 × 5시나리오 |

### E2E 테스트 시나리오 (S391)

| 탭 | 시나리오 수 | 주요 검증 |
|---|:----------:|----------|
| 피드 | 5 | 실행이력 테이블, 아이템 카드, Badge 상태, "아이디어로 보내기", "대화 시작" |
| 수동 등록 | 5 | URL 수집, 텍스트 입력, 파일 업로드, 결과 표시, 에러 처리 |
| Source Health | 5 | 요약 카드, 소스 목록 정렬, 운영 액션 3종, AI 분류 패널 |
| 채널 관리 | 5 | 채널 추가 모달, 편집, 삭제, 도메인/폴더 태그, 큐 상태 |

---

## 세션 이력

| 세션 | 날짜 | Phase | 작업 요약 | 커밋 |
|:----:|:----:|:-----:|----------|------|
| S356 | 03-10 | Plan | 요구사항 인터뷰 + Plan v0.1~v0.3 (검토 2회) | `66ec65a` |
| S357 | 03-10 | 1A | 수동 수집 (URL/텍스트) + Signal→Idea | `2df2d85` |
| S358 | 03-10 | 1B | 파일 업로드 수동 수집 | `51e37ca` |
| S360 | 03-11 | 2A | 채널 관리 + 도메인 CRUD + Source Lifecycle | `bd57cb1` |
| S361 | 03-11 | 2B | Crawl Queue + Worker + Cron 전환 | `3f476dd` |
| S362 | 03-11 | 3A | Health Score 서비스 + Cron + API | `ee027f4` |
| S366 | 03-12 | 3B | Source Health Dashboard UI + 운영 액션 | `28efe88` |
| S367 | 03-12 | 3A GAP | Drizzle 스키마 GAP 해소 (.unique + index) | `9902fa3` |
| S371 | 03-12 | Check | 전체 GAP 분석 (94.9%) + E2E 통합 테스트 28개 | `84d234a` |
| S385 | 03-12 | 4 | 폴더 고도화 — 채널↔폴더 연결 + 편집 + 색상 + 순서 + 필터 | `abe5021` |
| S387 | 03-12 | 4+ | 운영 액션 일괄 편집 — AI 추천 검토 + 배치 적용 | `fd73e7f` |
| S388 | 03-12 | 3C | AI 아이템 평가 + 도메인 커버리지 경고 | `8ae63e0` |
| S390 | 03-13 | 4+ | AI 소스 분류 추천 (SourceClassifier + ClassificationPanel) | `d29522c` |
| S391 | 03-13 | Act | BUG-01/02 수정 + E2E 테스트 20시나리오 | `649340d` |

---

## 기술적 의사결정

### D1. Radix Select → 네이티브 select (S391)

- **배경**: `@radix-ui/react-select`가 `@radix-ui/react-dialog` 내에서 compose-refs 충돌 → 저장 시 "Maximum update depth exceeded"
- **선택지**: (A) CSS z-index 해결 (B) Portal 분리 (C) 네이티브 select
- **결정**: (C) — Radix Select의 이점(스타일링)보다 안정성 우선. 2개 드롭다운(유형/수집간격)은 옵션이 4~6개로 네이티브로 충분
- **교훈**: Dialog 내부에서 Radix Select 사용 시 unmount 시점 compose-refs 무한 루프 가능. `[→CLAUDE]` 후보

### D2. 큐 기반 수집 vs 인라인 Cron (S361)

- **결정**: DB 기반 큐(`radar_crawl_queue`) + Worker 패턴. Cron은 큐잉만 담당, 실제 처리는 Worker
- **이유**: CF Workers 30초 제한 내에서 100+ 채널 처리 불가. 큐 기반으로 10건씩 배치 처리
- **결과**: 장애 격리(개별 소스 실패가 전체에 영향 안 줌) + 재시도 로직 + 모니터링 가능

### D3. AI 평가 — API vs claude -p (S388)

- **결정**: API 호출 (callLLM + FallbackManager) + 비용 추적 (UsageRecorder)
- **이유**: 비용 추적/한도 관리가 필수. BudgetBlockedError로 예산 초과 시 자동 중단
- **대안**: claude -p 구독 토큰 활용은 DX-REQ-011 Cost 관리와 통합 불가

### D4. useSearchParams 탭 상태 (S391)

- **배경**: Remix action 후 loader 재실행 → useState 리셋 → 탭이 "피드"로 복귀
- **결정**: `useSearchParams` URL 기반 탭 상태 (`?tab=channels`)
- **이유**: Remix revalidation에 안전 + 브라우저 뒤로가기/북마크 호환

### D5. AI 분류 — 온디맨드 vs 자동 (S390)

- **결정**: 온디맨드 버튼 (Source Health > 운영 액션 > AI 분류 추천)
- **이유**: 미분류 채널은 초기 대량 + 이후 간헐적. 자동 실행은 비용 낭비. 사용자가 필요할 때 실행

---

## 리스크 대응 결과

| Plan 리스크 | 발생 여부 | 대응 |
|------------|:--------:|------|
| URL 크롤링 실패율 | 발생 | CrawlError 5종 분류 + 3회 재시도 + 지수 백오프. FAILED→ACTIVE 복구 가능 |
| CF Workers 메모리 (파일) | 미발생 | 클라이언트사이드 PDF.js 텍스트 추출로 회피 (10MB 제한) |
| Health Score 초기 데이터 부족 | 해당 | MIN_ITEMS_FOR_HEALTH=20 임계값으로 미달 시 점수 0 |
| AI 평가 모델 drift | 미발생 | model_version 필드로 추적 체계 구축 완료 |
| 큐 poison message | 미발생 | 3회 재시도 → DEAD + source consecutiveFailures ≥ 5 → FAILED 전환 |
| Radix UI 충돌 | **발생** | BUG-01로 감지 → 네이티브 select 대체 (Plan 미예상 리스크) |

---

## 결론

F41 "아이템 수집 시스템 고도화"는 **13개 세션에 걸쳐 10개 Scope 항목을 전부 구현 완료**했어요.

**정량 성과**:
- 설계 대비 **94.9% Match Rate** (90% 기준 통과)
- Radar 모듈 **6,698 LOC** / **27 소스 파일** / **19 API 라우트** / **276 테스트**
- 마이그레이션 4건 + 신규 테이블 4개 + 확장 테이블 3개
- BUG 2건 발견 + 즉시 수정

**정성 성과**:
- Signal Capture Engine으로서 정보 수집 민주화 (수동 3경로 + 자동 큐)
- 4축 Health Score로 채널 품질 정량화 + 운영 액션 기반 자율 관리
- AI 분류 추천으로 미분류 채널 일괄 정리 UX 제공
- Source Lifecycle 5상태 + 자동 전환으로 장애 채널 자동 격리

**잔여 항목** (P3 이하, 향후 기회):
- API 통합 테스트 확장 (radar 엔드포인트 — 전체 API 테스트 백로그의 일부)
- Phase 1B 사후 설계 문서화 (collectFromFile, FileUploadForm)
- 설계 문서 상태 Draft → Active 갱신

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-13 | Initial — F41 전체 Phase 완료 보고 | Sinclair Seo |
