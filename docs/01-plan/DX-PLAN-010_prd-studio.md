---
code: DX-PLAN-010
title: PRD Studio — 인터뷰 기반 PRD 작성 & AI 다중 검토
version: "0.1"
status: Active
category: PLAN
created: 2026-03-12
updated: 2026-03-12
author: Sinclair Seo
---

# PRD Studio — 인터뷰 기반 PRD 작성 & AI 다중 검토

> **Req**: DX-REQ-015 (F44, P1)
> **PRD**: `docs/prd-studio/prd-final.md` (v10)
> **Status**: Phase 2-5 진행 중 (QA 수정)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | CLI 전용 인터뷰 스킬은 비개발자 접근 불가. 아이디어 분석에 체계적 PM 프레임워크 부재. 검토 결과 공유 수단 없음 |
| **Solution** | 웹 PRD Studio: 8섹션 대화형 인터뷰 → GPT-4.1/Gemini 병렬 AI 검토 → 스코어카드 + 피드백 → 편집/재검토/착수 판단 |
| **Function/UX Effect** | 비개발자가 질문에 답하면 PRD 자동 생성 → AI 2개 모델이 동시 검토 → 점수+피드백 즉시 확인 → 수정/재검토 반복 |
| **Core Value** | PM 프레임워크 민주화 — 비개발자도 체계적 PRD 작성 + AI 검토로 품질 보증 + 착수 의사결정 근거 확보 |

---

## 1. Overview

### 1.1 Purpose & Positioning

```
Ideas/Feature Request → PRD Studio (인터뷰→생성→검토→착수) → Implementation
```

PRD Studio는 pm-skills 프레임워크를 웹 UI로 제공하여, CLI 접근이 어려운 비개발자도 체계적 PRD를 작성하고 AI 검토를 받을 수 있게 한다.

### 1.2 Background

**기존 CLI 스킬**:
- `/ax-14-req-interview`: 인터뷰 → PRD → 외부 AI 다중 검토
- phuryn/pm-skills (MIT) 기반 8섹션 PRD 템플릿
- 한계: CLI 전용, 비개발자 접근 불가, 결과 공유/버전 관리 불가

**해결 접근**:
1. 동일 8섹션 인터뷰를 웹 UI로 구현
2. GPT-4.1 + Gemini 2.5 Flash 병렬 검토 (Promise.allSettled)
3. DB 저장으로 이력/버전/공유 가능

### 1.3 Related Documents

- [[DX-REQ-015]] F44: PRD Studio
- `docs/prd-studio/prd-final.md` — PRD v10 (최종)
- `docs/prd-studio/interview-log.md` — Phase 0 인터뷰 로그
- `app/features/prd-studio/` — 구현 코드

---

## 2. Scope

### 2.1 In Scope

- [x] **S1**: DB 스키마 5테이블 (prds, prd_sections, prd_versions, prd_reviews, prd_events)
- [x] **S2**: 인터뷰 UI — 8섹션 프로그레스, 예시 답변, debounce 자동 저장, localStorage fallback
- [x] **S3**: 온보딩 — 최초 접속 3단계 스포트라이트 모달
- [x] **S4**: PRD 생성 — GPT-4.1 기반 8섹션 자동 생성 (25초 타임아웃)
- [x] **S5**: AI 검토 — GPT-4.1 + Gemini 2.5 Flash 병렬 (Promise.allSettled)
- [x] **S6**: 스코어카드 — 8기준 점수 + verdict (READY/CONDITIONAL/NOT_READY)
- [x] **S7**: 피드백 뷰어 — severity별 카드 + 섹션 연결
- [x] **S8**: 편집기 — 섹션별 인라인 편집 + 버전 스냅샷
- [x] **S9**: 목록 — 상태 필터, 삭제, 생성일 표시
- [x] **S10**: 이탈 분석 이벤트 — 6종 클라이언트 트래킹 (S384)
- [x] **S11**: 에러 처리 UX — 재시도 버튼 + budget_blocked 안내 (S384)
- [ ] **S12**: UX 검증 — 비개발자 1명 + UAT 3명+ (Phase 2-5)
- [ ] **S13**: Feature Flag `PRD_STUDIO_ENABLED`

### 2.2 Out of Scope

- 실시간 협업 편집
- 외부 공유 링크
- 모바일 레이아웃
- ~~pm-skills 분석 대체~~ (Phase 3 완료)
- ~~Strategy/GTM 전략 도구~~ (Phase 4 설계 완료)

---

## 3. 데이터 모델

### 3.1 테이블 구조 (5테이블, 마이그레이션 0059)

```
prds                    — 메인 PRD 엔티티
├── prd_sections        — 인터뷰 8섹션 [1:N]
├── prd_versions        — 편집 이력 스냅샷 [1:N]
├── prd_reviews         — AI 검토 결과 [1:N per round]
└── prd_events          — 이벤트 추적 [1:N]
```

### 3.2 상태 흐름

```
DRAFT → GENERATED → IN_REVIEW → REVIEWED → FINALIZED
                                    ↑           ↓
                                    ← (재검토) ←
```

- **DRAFT**: 인터뷰 진행 중 (8섹션 답변)
- **GENERATED**: PRD 자동 생성 완료
- **IN_REVIEW**: AI 검토 진행 중 (S384 추가)
- **REVIEWED**: 검토 완료 (verdict + scorecard)
- **FINALIZED**: 착수 확정

### 3.3 핵심 컬럼

| 테이블 | 주요 컬럼 | 비고 |
|--------|----------|------|
| `prds` | id, tenantId, title, status, version, createdBy, interviewProgress, finalRating | 소유자 기반 접근 제어 |
| `prd_sections` | prdId, type(8종), interviewAnswer, generatedContent, editedContent | 답변→생성→편집 3단계 |
| `prd_reviews` | prdId, round, model, verdict, feedbackItems(JSON), scorecard(JSON), latency | 라운드별 다중 모델 |
| `prd_events` | prdId, eventType(8종), actorId, payload(JSON) | 이탈/행동 분석용 |

### 3.4 인터뷰 8섹션 (PrdSectionType)

| # | type | label |
|---|------|-------|
| 1 | summary | 프로젝트 요약 |
| 2 | background | 배경 & 문제 |
| 3 | objectives | 목표 |
| 4 | target_users | 대상 사용자 |
| 5 | requirements | 핵심 요구사항 |
| 6 | solution | 해결 방안 |
| 7 | risks | 리스크 & 제약 |
| 8 | timeline | 일정 & 리소스 |

---

## 4. 아키텍처

### 4.1 API 라우트 (7개)

| 라우트 | 메서드 | 기능 |
|--------|--------|------|
| `/api/prd-studio` | GET/POST/DELETE | PRD 목록, 생성, 삭제 |
| `/api/prd-studio/:id/sections` | GET/PUT | 섹션 조회, 인터뷰 답변 저장 |
| `/api/prd-studio/:id/generate` | POST | GPT-4.1 PRD 생성 |
| `/api/prd-studio/:id/review` | POST | GPT-4.1 + Gemini 병렬 검토 |
| `/api/prd-studio/:id/edit` | PUT | 섹션 편집 |
| `/api/prd-studio/:id/versions` | GET/POST | 버전 스냅샷 |
| `/api/prd-studio/:id/events` | POST | 이벤트 트래킹 |

### 4.2 AI 검토 파이프라인

```
reviewFetcher.submit()
  → IN_REVIEW 상태 전환
  → 사용 가능 모델 필터 (API 키 확인)
  → Promise.allSettled([GPT-4.1, Gemini])
    → 각 모델: 25초 타임아웃 + JSON 파싱
    → 성공: verdict + scorecard + feedbackItems 저장
    → 실패: error 메시지 저장
  → REVIEWED 상태 전환 (성공 1개+)
  → review_complete 이벤트 기록
```

### 4.3 클라이언트 훅 구조

| 훅/컴포넌트 | 역할 |
|-------------|------|
| `useEventTracking(prdId)` | 이벤트 6종 트래킹 (S384) |
| `StatusBadge` | 공통 상태 배지 (S384) |
| `ErrorMessage` | 공통 에러 메시지 + 재시도 (S384) |
| `ReviewResults` | 검토 결과 뷰어 + onRetry (S384) |
| `PrdContentView` | 섹션별 편집기 + 에러 표시 (S384) |
| `PrdOnboardingModal` | 3단계 온보딩 |
| `VersionHistory` | 버전 이력 목록 |

---

## 5. 보안/인증

| 계층 | 구현 |
|------|------|
| 인증 | `requireUser()` — 로그인 필수, PENDING → /pending |
| 테넌트 격리 | `getById(id, tenantId)` — 다른 테넌트 PRD 접근 차단 (S383) |
| 소유자 검증 | `createdBy === ctx.user.id` — 쓰기 작업 소유자만 (S383) |
| 관리자 예외 | `ctx.user.role === 'admin'` — 검토/삭제 관리자 허용 (S383) |
| 상태 검증 | DRAFT만 인터뷰 답변 수정 허용, GENERATED+ 검토 허용 (S384) |
| 타입 검증 | sectionType PrdSectionType enum 대조 (S384) |

---

## 6. 실행 계획 + 현황

### Phase 0: 사전 검증 — ✅ 완료

CLI pm-skills `/write-prd` 3건 샘플 실행, 비개발자 니즈 인터뷰 완료.

### Phase 1: CLI 적용 — ✅ 완료 (F42, F43)

pm-skills 4개 플러그인 설치 + PRD 템플릿 8섹션 통일. 검토 고도화 (모델 선택 + API 자동 호출 + 스코어카드 채점).

### Phase 2-1: DB 스키마 + AI 병렬 PoC — ✅ 완료

5테이블 스키마 + 마이그레이션 0059 + GPT-4.1/Gemini 병렬 검토 PoC.

### Phase 2-2: 인터뷰 UI + 온보딩 + 중간 저장 — ✅ 완료

8섹션 프로그레스, 예시 답변, debounce 1.5s 자동 저장, localStorage fallback, 온보딩 모달.

### Phase 2-3: 검토 API + 피드백 뷰어 + 스코어카드 — ✅ 완료

Promise.allSettled 병렬 검토, severity별 피드백 카드, 스코어 바 시각화, verdict 배지.

### Phase 2-4: 편집기 + 버전 관리 + 목록 — ✅ 완료

섹션별 인라인 편집, 버전 스냅샷, PRD 목록 테이블.

### Phase 2-5: QA + UX 검증 — 🔧 진행 중

**S383 (P0 수정 9건)**:
- [x] 소유자/테넌트 IDOR 취약점 6건 해소
- [x] Generate/Review 에러 시 성공 메시지 표시 수정
- [x] SSR hydration mismatch (formatDate KST-safe)
- [x] localStorage 정리 대상 ref 버그

**S384 (P1 핵심 10건)**:
- [x] §4.3 이탈 분석 이벤트 6종 (useEventTracking 훅)
- [x] §4.4 에러 처리 UX (ErrorMessage + 재시도 + budget_blocked)
- [x] ReviewResults 재시도 버튼 (onRetry prop)
- [x] PrdContentView 편집 에러 표시
- [x] sections DRAFT 상태 검증
- [x] sections sectionType 유효성 검증
- [x] IN_REVIEW 상태 전환 구현
- [x] saveSectionAnswer 원자적 progress 갱신
- [x] StatusBadge 공통 컴포넌트 분리
- [x] 삭제 버튼 로딩/더블클릭 방지

**잔여 (31건)**:
- [ ] Server P1 6건: AI 응답 키 검증, tokens 추출, batch INSERT, delete 확인, JSON 파싱 에러, 검토 권한
- [ ] Server P2 9건: UNIQUE 제약, Feature Flag, content 길이, 타임아웃 주석
- [ ] Client P1 6건: 온보딩 접근성, revalidation, FAQ, useFetcher 동시성
- [ ] Client P2 10건: 모바일 반응형, confirm 모달, ARIA, 타입 불일치
- [ ] UX 검증: 비개발자 1명 + UAT 3명+ (Phase 2-5 마지막 단계)

### Phase 3: 분석 대체 — ✅ 완료 (S389)

`claude -p` 배치 분석 + prd_analysis_queue + PrdAnalysisCard UI + TDD 37개. 설계: [[DX-DSGN-016]]

### Phase 4: 전략 도구 — 📋 설계 완료

Strategy Canvas 6프레임워크 + GTM 전략 + Proposal AI 합성 연동. 하이브리드 엔진 (claude -p 배치 + 실시간 API fallback). 설계: [[DX-DSGN-017]]

---

## 7. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| AI 30초 타임아웃 | Medium | Medium | 25초 AbortController + Promise.allSettled 부분 성공 |
| AI API 장애 | High | Low | 4단계 fallback + 부분 결과 표시 |
| 비개발자 UX 이탈 | High | Medium | 이탈 이벤트 트래킹 + 온보딩 + 예시 답변 |
| 비원자적 create 9 INSERT | Medium | Low | D1 batch() 적용 예정 (S-P1-6) |
| API 비용 초과 | Low | Low | budget_policies + BudgetBlockedError 안내 |

---

## 8. QA 보고서 위치

| 보고서 | 위치 |
|--------|------|
| Server QA | `.team-tmp/prd-qa-server-report.md` |
| Client QA | `.team-tmp/prd-qa-client-report.md` |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-12 | Initial — Phase 2-1~2-4 완료 + Phase 2-5 QA 진행 현황 반영 (S383 P0 9건 + S384 P1 10건 해소) | Sinclair Seo |
