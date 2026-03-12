---
code: DX-DSGN-015
title: PRD Studio — 설계 문서
version: "0.1"
status: Active
category: DSGN
created: 2026-03-12
updated: 2026-03-12
author: Sinclair Seo
---

# PRD Studio — 설계 문서

> **Plan**: [[DX-PLAN-010]]
> **Req**: DX-REQ-015 (F44, P1)
> **Status**: Phase 2-5 QA 진행 중 (소급 작성)

---

## 1. 컴포넌트 아키텍처

### 1.1 라우트 구조

```
prd-studio.tsx                    — 레이아웃 (AppShell + 온보딩)
├── prd-studio._index.tsx         — PRD 목록 (테이블 + 삭제)
├── prd-studio.new.tsx            — 새 PRD 생성 (제목 + ideaId 연결)
└── prd-studio.$id.tsx            — PRD 상세 (인터뷰 + 생성 + 검토 + 편집)
```

### 1.2 UI 컴포넌트 계층

```
prd-studio.tsx (Layout)
├── PrdOnboardingModal            — 3단계 온보딩 스포트라이트 (localStorage 기반)
└── Outlet
    ├── _index.tsx
    │   └── StatusBadge           — 공통 상태 배지 (6종)
    └── $id.tsx
        ├── StatusBadge           — (공통)
        ├── ErrorMessage          — 공통 에러 메시지 + 재시도 + budget_blocked
        ├── PrdContentView        — 섹션별 인라인 편집기
        ├── ReviewResults         — 검토 결과 카드 (onRetry)
        │   ├── ReviewCard        — 모델별 결과 (verdict + scorecard + feedback)
        │   ├── ScoreBar          — 기준별 점수 시각화
        │   ├── FeedbackCard      — severity별 피드백 카드
        │   └── VerdictBadge      — 판정 배지 (READY/CONDITIONAL/NOT_READY)
        └── VersionHistory        — 접이식 버전 이력
```

### 1.3 훅

| 훅 | 위치 | 역할 |
|----|------|------|
| `useEventTracking(prdId)` | `hooks/useEventTracking.ts` | 이벤트 6종 트래킹 (fetch + sendBeacon) |
| `useOnboardingSeen()` | `prd-studio.tsx` (인라인) | localStorage SSR-safe 온보딩 상태 |
| `useIsMounted()` | `prd-studio.tsx` (인라인) | SSR/CSR 판별 (useSyncExternalStore) |

### 1.4 feature 모듈 구조

```
app/features/prd-studio/
├── constants/
│   └── interview-config.ts       — SectionConfig[] 8섹션 정의
├── db/
│   └── schema.ts                 — Drizzle 스키마 + enum (5테이블)
├── hooks/
│   └── useEventTracking.ts       — 이벤트 트래킹 훅
├── service/
│   └── prd-studio.service.ts     — CRUD + 인터뷰 + 검토 + 이벤트
├── types/
│   └── index.ts                  — DB row types + JSON column types
└── ui/
    ├── ErrorMessage.tsx           — 공통 에러 (재시도 + budget_blocked)
    ├── PrdContentView.tsx         — 섹션별 편집기
    ├── PrdOnboardingModal.tsx     — 3단계 온보딩
    ├── ReviewResults.tsx          — 검토 결과 뷰어
    ├── StatusBadge.tsx            — 상태 배지
    └── VersionHistory.tsx         — 버전 이력
```

---

## 2. 데이터 흐름

### 2.1 인터뷰 → PRD 생성 → 검토 플로우

```
[사용자]
  ↓ 제목 입력 + PRD 시작
[prd-studio.new.tsx] → POST /api/prd-studio (create)
  → PRD + 8 빈 섹션 INSERT → redirect /$id
  ↓
[prd-studio.$id.tsx] — 인터뷰 모드
  ↓ textarea 입력 (debounce 1.5s)
  → PUT /api/prd-studio/:id/sections (saveSectionAnswer)
  → localStorage fallback (네트워크 실패 대비)
  → interviewProgress 원자적 서브쿼리 갱신
  ↓ 8/8 완료
  ↓ "PRD 생성하기" 클릭
  → POST /api/prd-studio/:id/generate
  → GPT-4.1 (25s timeout) → 8섹션 generatedContent UPDATE
  → status: DRAFT → GENERATED
  → trackPrdGenerated 이벤트
  ↓
  ↓ "AI 검토" 클릭
  → trackReviewStart 이벤트
  → POST /api/prd-studio/:id/review
  → status: → IN_REVIEW
  → Promise.allSettled([GPT-4.1, Gemini 2.5 Flash])
  → 각 모델: verdict + scorecard(8기준) + feedbackItems → prd_reviews INSERT
  → status: → REVIEWED (성공 1개+)
  → trackReviewComplete 이벤트
  ↓
  ↓ 섹션 편집 (optional)
  → PUT /api/prd-studio/:id/edit → editedContent UPDATE
  ↓
  ↓ 재검토 (optional)
  → 위 검토 플로우 반복 (round++)
```

### 2.2 에러 흐름

```
[Generate/Review 에러]
  → API 응답: { error: "...", errorType?: "budget_blocked" }
  → ErrorMessage 컴포넌트 표시 (에러 메시지 + 재시도 버튼)
  → budget_blocked: "관리자에게 문의하세요 (설정 → AI 비용 관리)"

[검토 부분 실패]
  → Promise.allSettled → fulfilled/rejected 분리
  → 성공 모델: verdict + scorecard 저장
  → 실패 모델: error 메시지 저장 + ReviewCard 경고 카드 + onRetry 버튼

[편집 저장 에러]
  → editFetcher.data.error → 섹션 목록 상단 에러 메시지

[인터뷰 페이지 이탈]
  → beforeunload → sendBeacon(interview_abandon 이벤트)
```

### 2.3 온보딩 플로우

```
[최초 접속] → localStorage 'dx-prd-studio-onboarding-v1' 미존재
  → PrdOnboardingModal 표시 (3단계)
  → Step 1: 인터뷰 작성 안내
  → Step 2: AI 검토 안내
  → Step 3: 완료 축하
  → Complete/Skip → localStorage 'true' 설정
  → 이후 접속: 모달 미표시
```

---

## 3. API 설계 상세

### 3.1 라우트 목록

| # | 라우트 | 메서드 | 인증 | 소유자 | 상태 검증 |
|---|--------|--------|------|--------|----------|
| 1 | `/api/prd-studio` | GET | requireUser | - | - |
| 2 | `/api/prd-studio` | POST | requireUser | - | - |
| 3 | `/api/prd-studio` | DELETE | requireUser | createdBy | - |
| 4 | `/api/prd-studio/:id/sections` | GET | requireUser | tenantId | - |
| 5 | `/api/prd-studio/:id/sections` | PUT | requireUser | createdBy | DRAFT only |
| 6 | `/api/prd-studio/:id/generate` | POST | requireUser | createdBy | DRAFT |
| 7 | `/api/prd-studio/:id/review` | POST | requireUser | createdBy+admin | REVIEWABLE |
| 8 | `/api/prd-studio/:id/edit` | PUT | requireUser | createdBy | !DRAFT |
| 9 | `/api/prd-studio/:id/versions` | GET/POST | requireUser | tenantId | - |
| 10 | `/api/prd-studio/:id/events` | POST | requireUser | tenantId | eventType 검증 |

### 3.2 검토 모델 설정

```typescript
const REVIEW_MODELS: ReviewModel[] = [
  { id: "gpt-4.1",       provider: "openai",  model: "gpt-4.1",                        envKey: "OPENAI_API_KEY" },
  { id: "gemini-flash",  provider: "google",  model: "gemini-2.5-flash-preview-05-20",  envKey: "GOOGLE_AI_API_KEY" },
];
```

- 사용 가능 모델: API 키 존재 여부로 동적 필터링
- 타임아웃: 25초 (CF 30초 제한 대비 5초 마진)
- JSON 응답 포맷: `response_format: { type: "json_object" }` (OpenAI) / `responseMimeType: "application/json"` (Gemini)

### 3.3 스코어카드 기준 (8항목, 100점 환산)

| # | 기준 | 배점 |
|---|------|------|
| 1 | 문제 정의 명확성 | 10 |
| 2 | 대상 사용자 구체성 | 10 |
| 3 | 목표/성공기준 측정가능성 | 10 |
| 4 | 요구사항 완성도 | 10 |
| 5 | 해결방안 실현가능성 | 10 |
| 6 | 리스크 분석 충분성 | 10 |
| 7 | 일정 현실성 | 10 |
| 8 | 전체 일관성 | 10 |

**판정**: totalScore = (합계/80) × 100. ≥80 READY, 60~79 CONDITIONAL, <60 NOT_READY.

---

## 4. 서비스 레이어

### 4.1 PrdStudioService 메서드

| 메서드 | 설명 | 특이사항 |
|--------|------|----------|
| `list(tenantId)` | 테넌트별 PRD 목록 | updatedAt desc |
| `getById(id, tenantId?)` | PRD + sections eager load | tenantId 선택적 격리 |
| `create(input)` | PRD + 8 빈 섹션 생성 | 비원자적 9 INSERT (QA S-P1-6) |
| `update(id, input)` | PRD 갱신 | updatedAt 자동 |
| `delete(id, tenantId)` | PRD 삭제 (cascade) | - |
| `saveSectionAnswer(prdId, type, answer)` | 답변 저장 + progress | 원자적 서브쿼리 (S384) |
| `getSections(prdId)` | 섹션 목록 | sortOrder 정렬 |
| `createVersion(prdId, changedBy, note?)` | 스냅샷 저장 | version++ |
| `listVersions(prdId)` | 버전 목록 | version desc |
| `saveReviewResult(input)` | 검토 결과 저장 | round별 다중 모델 |
| `getReviews(prdId)` | 검토 결과 목록 | createdAt desc |
| `logEvent(input)` | 이벤트 기록 | prdId optional |

---

## 5. 보안 설계

### 5.1 접근 제어 매트릭스

| 작업 | 미인증 | 다른 테넌트 | 같은 테넌트 타인 | 소유자 | admin |
|------|--------|------------|----------------|--------|-------|
| PRD 목록 | ✗ 401 | ✗ (격리) | ✓ 읽기 | ✓ | ✓ |
| PRD 생성 | ✗ 401 | - | ✓ (본인용) | ✓ | ✓ |
| 인터뷰 저장 | ✗ 401 | ✗ 404 | ✗ 403 | ✓ | ✗ |
| PRD 생성(AI) | ✗ 401 | ✗ 404 | ✗ 403 | ✓ | ✗ |
| AI 검토 | ✗ 401 | ✗ 404 | ✗ 403 | ✓ | ✓ |
| 섹션 편집 | ✗ 401 | ✗ 404 | ✗ 403 | ✓ | ✗ |
| PRD 삭제 | ✗ 401 | ✗ (격리) | ✗ 403 | ✓ | ✓ |

### 5.2 입력 검증

| 검증 | 위치 | 내용 |
|------|------|------|
| sectionType | sections API | PrdSectionType enum 대조 (S384) |
| PRD 상태 | sections API | DRAFT만 인터뷰 답변 허용 (S384) |
| eventType | events API | PrdEventType enum 대조 |
| 제목 길이 | new.tsx action | 200자 제한 |

---

## 6. 이벤트 트래킹 설계

### 6.1 이벤트 8종 (PrdEventType)

| # | eventType | 트리거 | 전송 방식 | payload |
|---|-----------|--------|----------|---------|
| 1 | `interview_start` | 컴포넌트 마운트 | fetch (useEffect, ref 중복방지) | - |
| 2 | `section_complete` | 섹션 저장 성공 | fetch | `{ sectionType, sectionIndex }` |
| 3 | `interview_abandon` | 페이지 이탈 | sendBeacon (beforeunload) | - |
| 4 | `prd_generated` | PRD 생성 완료 | fetch | `{ sectionsGenerated }` |
| 5 | `prd_edited` | 섹션 편집 저장 | fetch (서버 측) | - |
| 6 | `review_start` | 검토 시작 | fetch (서버 + 클라이언트) | - |
| 7 | `review_complete` | 검토 완료 | fetch (서버 + 클라이언트) | `{ round, successCount }` |
| 8 | `prd_finalized` | 착수 확정 | fetch | - |

### 6.2 KPI 측정 쿼리 (PRD §2 Traceability)

```sql
-- 인터뷰 완주율
SELECT COUNT(DISTINCT CASE WHEN eventType='prd_generated' THEN prdId END) * 100.0
     / COUNT(DISTINCT CASE WHEN eventType='interview_start' THEN prdId END)
FROM prd_events;

-- 이탈 지점 분석
SELECT payload->>'$.sectionType', COUNT(*)
FROM prd_events WHERE eventType='section_complete'
GROUP BY payload->>'$.sectionType'
ORDER BY COUNT(*) DESC;

-- 검토 완주율
SELECT COUNT(DISTINCT CASE WHEN eventType='review_complete' THEN prdId END) * 100.0
     / COUNT(DISTINCT CASE WHEN eventType='review_start' THEN prdId END)
FROM prd_events;
```

---

## 7. QA 현황 (Phase 2-5)

### 7.1 해소 완료 (19건)

| 세션 | P0 | P1 | P2 | 합계 |
|------|:--:|:--:|:--:|:----:|
| S383 | 6 | 0 | 3 | 9 |
| S384 | 0 | 8 | 2 | 10 |
| **합계** | **6** | **8** | **5** | **19** |

### 7.2 잔여 (31건)

| 카테고리 | P1 | P2 | 합계 | 핵심 |
|---------|:--:|:--:|:----:|------|
| Server | 6 | 9 | 15 | batch INSERT, tokens 추출, UNIQUE 제약 |
| Client | 6 | 10 | 16 | 온보딩 접근성, revalidation, 모바일 반응형 |

상세: `.team-tmp/prd-qa-server-report.md`, `.team-tmp/prd-qa-client-report.md`

---

## 8. 미구현 사항 + 향후 Phase

### Phase 2-5 잔여 (QA 완료 후)
- UX 검증: 비개발자 1명 플로우 테스트
- UAT: 팀원 3명+ 실제 PRD 1건씩

### Phase 3: 분석 대체 (미착수)
- pm-prompts/ JSON 빌드 파이프라인
- analyzer.ts 6종 카테고리 교체 (시장조사/고객조사/BMC/SWOT/린캔버스/PESTEL)
- 전후 비교 검증

### Phase 4: 전략 도구 (미착수)
- Strategy Canvas 웹 UI
- GTM 웹 UI
- 사업제안 연동

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-12 | Initial — 구현 완료 코드 기반 소급 작성 (Phase 2-1~2-4 + S383 P0 + S384 P1) | Sinclair Seo |
