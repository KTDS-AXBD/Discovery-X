# EPIC 5 — 사업제안 기능 계획서

> **Summary**: Discovery-X 아이디어를 팀 단위 사업제안서로 발전시키는 협업 기능
>
> **Project**: Discovery-X
> **Version**: v4.2
> **Author**: Claude
> **Date**: 2026-02-10
> **Status**: Implemented (후행 문서화)
> **PDCA Phase**: Plan (Do 완료 후 문서화)

---

## 1. Overview

### 1.1 Purpose

AX BD팀 요구사항 EPIC 5 "팀 공유 & 논의"를 구현한다. 개인이 발굴한 아이디어(Discovery → IDEA_CARD)를 팀 단위 사업제안서로 발전시키고, 구조화된 템플릿(5개 섹션)과 협업 도구(댓글, 마일스톤, 액션)를 제공한다.

### 1.2 Background

- ax-bd-poc(EPIC 1~4, 6)에서 소스 수집 → 아이디어 생성까지 완료
- EPIC 5는 "개인 아이디어를 팀 사업제안으로 발전"하는 다음 단계
- 기존 Discovery 파이프라인의 HANDOFF 단계와 연결되는 기능

### 1.3 Related Documents

- Requirements: `docs/AX BD팀 요구사항_v0.2.md` (EPIC 5)
- Prior Feature: `docs/01-plan/features/ax-bd-poc.plan.md`
- Design: `docs/02-design/features/proposals.design.md` (작성 예정)

---

## 2. Scope

### 2.1 In Scope (PoC 1차)

- [x] **FR-01**: 사업제안서 CRUD (생성/조회/삭제)
- [x] **FR-02**: 5개 섹션 구조 (시장/타겟/모델/우위/재무)
- [x] **FR-03**: 마일스톤 & 액션 아이템 관리
- [x] **FR-04**: 팀 댓글 토론
- [x] **FR-05**: 진행률 추적 (프로그레스 바 + 잔여일)
- [x] **FR-06**: 제안 상태 관리 (DRAFT/REVIEWING/APPROVED/REJECTED)
- [x] **FR-07**: 3열 레이아웃 (사이드바 + 본문 + 진행 패널)
- [x] **FR-08**: 팀 멤버 관리 (DB 스키마)

### 2.2 Out of Scope (PoC 2차)

- 제안 수정(UPDATE) API
- 상태 전환 워크플로우 (DRAFT → REVIEWING → APPROVED/REJECTED)
- 마일스톤/액션 CRUD API (현재 조회만)
- 멤버 관리 CRUD API (스키마만 존재)
- 역할 기반 접근 제어 (소유자/멤버 검증)
- Discovery → 사업제안 자동 연결
- 알림/이메일 연동

---

## 3. Requirements — 구현 현황

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 | 구현 상태 | 비고 |
|----|---------|---------|----------|------|
| **사업제안 관리** |||||
| FR-01 | 사업제안서 생성 (제목/설명/예산/팀규모/시작일) | High | ✅ 구현 | `proposals.new.tsx` |
| FR-02 | 5개 섹션 자동 생성 (시장/타겟/모델/우위/재무) | High | ✅ 구현 | 생성 시 5개 빈 섹션 INSERT |
| FR-03 | 마일스톤 표시 (COMPLETED/ACTIVE/PENDING) | High | ✅ 조회만 | CRUD API 미구현 |
| FR-04 | 액션 아이템 완료 토글 | High | ✅ 구현 | `api.proposals.$id.actions.ts` |
| **팀 협업** |||||
| FR-05 | 댓글 작성 (useFetcher 비동기) | High | ✅ 구현 | `TeamDiscussion` 컴포넌트 |
| FR-06 | 팀 멤버 DB 스키마 | Medium | ⚠️ 스키마만 | CRUD API 없음 |
| **상태 & 진행** |||||
| FR-07 | 4단계 상태 (DRAFT/REVIEWING/APPROVED/REJECTED) | High | ⚠️ 표시만 | 상태 전환 API 없음 |
| FR-08 | 진행률 추적 (완료 액션 / 전체 액션) | High | ✅ 구현 | `ProgressPanel` |
| **레이아웃** |||||
| FR-09 | 3열 레이아웃 (사이드바+본문+진행패널) | High | ✅ 구현 | `proposals.tsx` 레이아웃 |
| FR-10 | 반응형 (모바일 오버레이/데스크탑 고정) | Medium | ✅ 구현 | sm/lg 브레이크포인트 |

### 3.2 구현 통계

| 항목 | 수량 |
|------|:---:|
| DB 테이블 (신규) | 6 |
| 마이그레이션 | 1 (`0021_proposals.sql`) |
| 페이지 라우트 | 4 |
| API 엔드포인트 | 3 |
| UI 컴포넌트 | 5 |
| **총 파일** | **12** |

---

## 4. Architecture

### 4.1 Feature Module 패턴

```
app/features/proposals/
└── db/schema.ts      # 6개 테이블 정의 (proposalSchema)
```

기존 ax-bd-poc(Core Extension)과 달리, proposals는 **Feature Module 패턴**을 사용한다:
- 독립된 `app/features/proposals/` 디렉토리
- `proposalSchema`를 `app/db/index.ts`에서 스프레드 머지
- 라우트/컴포넌트는 기존 구조(`app/routes/`, `app/components/proposals/`) 활용

### 4.2 Data Model

#### 6개 테이블

| 테이블 | 역할 | 주요 컬럼 | FK |
|--------|------|----------|-----|
| `proposals` | 메인 | title, description, status, teamSize, startDate, budget | tenants, users |
| `proposal_sections` | 섹션 (5종) | type(market/target/model/advantage/finance), content | proposals (cascade) |
| `proposal_milestones` | 마일스톤 | title, status(COMPLETED/ACTIVE/PENDING), startDate, endDate | proposals (cascade) |
| `proposal_actions` | 액션 아이템 | title, assigneeId, completed, dueDate | proposals (cascade), users |
| `proposal_comments` | 댓글 | authorId, content | proposals (cascade), users |
| `proposal_members` | 멤버 (M:N) | userId, joinedAt | proposals (cascade), users |

#### Entity Relationships

```
tenants ──1:N──▶ proposals ──1:N──▶ proposal_sections (5종)
users   ──1:N──▶ proposals ──1:N──▶ proposal_milestones
                 proposals ──1:N──▶ proposal_actions (→ users.assigneeId)
                 proposals ──1:N──▶ proposal_comments (→ users.authorId)
                 proposals ──M:N──▶ users (via proposal_members)
```

#### 설계 특징

- **Cascade 삭제**: 하위 5개 테이블 모두 `onDelete: "cascade"`
- **UUID PK**: `crypto.randomUUID()` 클라이언트 생성
- **날짜 비일관성**: `created_at`/`updated_at`은 integer(unixepoch), `start_date`/`end_date`/`due_date`는 text
- **budget은 text**: 자유 형식 ("1억", "$100K" 등)

### 4.3 API Endpoints

| Method | Path | 기능 | 구현 |
|--------|------|------|------|
| GET | `/api/proposals` | 제안 목록 (tenantId 필터) | ✅ |
| DELETE | `/api/proposals` | 제안 삭제 (cascade) | ✅ |
| GET | `/api/proposals/:id/comments` | 댓글 조회 (authorName JOIN) | ✅ |
| POST | `/api/proposals/:id/comments` | 댓글 작성 | ✅ |
| POST | `/api/proposals/:id/actions` | 액션 완료 토글 | ✅ |

### 4.4 UI 컴포넌트

| 컴포넌트 | 파일 | 역할 |
|----------|------|------|
| `ProposalForm` | `components/proposals/ProposalForm.tsx` | 생성 폼 (5개 섹션 + 메타 필드) |
| `ProposalDetail` | `components/proposals/ProposalDetail.tsx` | 상세 뷰 (상태 배지 + 섹션 카드) |
| `ProposalListSidebar` | `components/proposals/ProposalListSidebar.tsx` | 좌측 목록 (반응형 오버레이) |
| `ProgressPanel` | `components/proposals/ProgressPanel.tsx` | 우측 진행 패널 (마일스톤 + 액션) |
| `TeamDiscussion` | `components/proposals/TeamDiscussion.tsx` | 댓글 토론 (useFetcher 비동기) |

### 4.5 레이아웃

```
┌──────────────┬──────────────────────┬─────────────┐
│ Sidebar      │ Main Content         │ Progress    │
│ (--dx-       │ (flex-1)             │ (--dx-      │
│  sidebar-    │                      │  context-   │
│  width)      │ ProposalDetail       │  panel-     │
│              │ max-w-3xl 중앙        │  width)     │
│ [새 제안서]   │                      │             │
│ 제안 목록     │ TeamDiscussion       │ lg:block    │
│ (활성 하이라이트)│                    │ hidden      │
└──────────────┴──────────────────────┴─────────────┘
```

---

## 5. Known Issues & Gaps

### 5.1 보안/권한

| # | 이슈 | 영향 | 우선순위 |
|---|------|------|---------|
| 1 | 역할 기반 접근 제어 없음 | 모든 인증 사용자 동일 권한 | P1 |
| 2 | 소유자/멤버 검증 없음 | DELETE 시 타인 제안 삭제 가능 | P1 |
| 3 | 테넌트 격리 불완전 | 상세/댓글/액션 API에 tenantId 필터 없음 | P1 |

### 5.2 기능 부족

| # | 이슈 | 영향 | 우선순위 |
|---|------|------|---------|
| 4 | 제안 수정(UPDATE) 미구현 | 생성 후 편집 불가 | P1 |
| 5 | 상태 전환 API 없음 | DRAFT → REVIEWING 등 워크플로우 없음 | P1 |
| 6 | 마일스톤 CRUD 미구현 | 조회만 가능 | P2 |
| 7 | 액션 CRUD 미구현 | 완료 토글만 가능 | P2 |
| 8 | 멤버 관리 CRUD 없음 | 스키마만 존재 | P2 |
| 9 | proposal_members PK 부재 | 중복 멤버 삽입 가능 | P2 |

### 5.3 데이터 흐름

| # | 이슈 | 영향 | 우선순위 |
|---|------|------|---------|
| 10 | 상세 페이지 5개 쿼리 순차 실행 | Promise.all 미사용, 성능 | P3 |
| 11 | actions API에서 proposalId 미검증 | 타 제안의 액션 토글 가능 | P2 |
| 12 | `toLocaleDateString("ko-KR")` 사용 | SSR/CSR hydration mismatch 가능 | P3 |

### 5.4 UI 개선

| # | 이슈 | 영향 | 우선순위 |
|---|------|------|---------|
| 13 | 상태/섹션 상수 중복 정의 | ProposalDetail + ProposalListSidebar + ProposalForm | P3 |
| 14 | ProgressPanel 체크박스 readOnly | 액션 토글 UI 미연결 | P2 |
| 15 | 마일스톤 완료 아이콘 `bg-green-500` 하드코딩 | Axis 토큰 미사용 | P3 |

---

## 6. Success Criteria

### 6.1 PoC 1차 (완료)

- [x] 사업제안서 생성/조회/삭제
- [x] 5개 섹션 자동 생성
- [x] 댓글 CRUD
- [x] 액션 완료 토글
- [x] 진행률 표시
- [x] 3열 반응형 레이아웃
- [x] 다크모드 지원

### 6.2 PoC 2차 (예정)

- [ ] 제안 수정(UPDATE) + 섹션 편집
- [ ] 상태 전환 워크플로우
- [ ] 테넌트 격리 + 소유자 검증
- [ ] 마일스톤/액션 CRUD API
- [ ] 멤버 초대/관리
- [ ] 기존 테스트 통과 유지 + 신규 테스트 추가

---

## 7. File Inventory

### 신규 파일 (12개)

| 파일 | 역할 |
|------|------|
| `app/features/proposals/db/schema.ts` | 6개 테이블 Drizzle 스키마 |
| `app/routes/proposals.tsx` | 레이아웃 라우트 (사이드바 + Outlet) |
| `app/routes/proposals._index.tsx` | 목록 인덱스 (빈 상태 안내) |
| `app/routes/proposals.new.tsx` | 신규 생성 (Action + ProposalForm) |
| `app/routes/proposals.$id.tsx` | 상세 (Loader + ProposalDetail + ProgressPanel) |
| `app/routes/api.proposals.ts` | CRUD API (GET/DELETE) |
| `app/routes/api.proposals.$id.comments.ts` | 댓글 API (GET/POST) |
| `app/routes/api.proposals.$id.actions.ts` | 액션 토글 API (POST) |
| `app/components/proposals/ProposalForm.tsx` | 생성 폼 컴포넌트 |
| `app/components/proposals/ProposalDetail.tsx` | 상세 뷰 컴포넌트 |
| `app/components/proposals/ProposalListSidebar.tsx` | 사이드바 컴포넌트 |
| `app/components/proposals/ProgressPanel.tsx` | 진행 패널 컴포넌트 |
| `app/components/proposals/TeamDiscussion.tsx` | 댓글 토론 컴포넌트 |

### 수정 파일 (3개)

| 파일 | 변경 내용 |
|------|----------|
| `app/db/index.ts` | `proposalSchema` 스프레드 머지 |
| `drizzle/0021_proposals.sql` | 마이그레이션 (6개 테이블 생성) |
| `tests/helpers/db.ts` | 마이그레이션 SQL 등록 |

---

## 8. Next Steps

1. [x] Plan 문서 작성 (이 문서)
2. [ ] Design 문서 작성 (`/pdca design proposals`)
3. [ ] PoC 2차: P1 이슈 해결 (수정 API + 상태 전환 + 보안)
4. [ ] Gap 분석 (`/pdca analyze proposals`)
5. [ ] 완료 보고서 (`/pdca report proposals`)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-02-10 | 구현 후행 문서화 — 3 worker 병렬 분석 결과 통합 | Claude |
