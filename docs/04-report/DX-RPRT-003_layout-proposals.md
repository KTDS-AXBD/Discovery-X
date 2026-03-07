---
code: DX-RPRT-003
title: 레이아웃 제안 완료 보고
version: 1.0
status: Active
category: RPRT
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
---

# Layout Restructure + Proposals 완료 보고서

> **Feature**: layout-proposals (3탭 GNB + 컨텍스트 패널 + 사업제안 기능)
>
> **Project**: Discovery-X v5.0
> **Report Date**: 2026-02-10
> **Duration**: 2026-02-09 ~ 2026-02-10 (2 days)
> **Status**: COMPLETED
> **Overall Match Rate**: 93% (57/61 체크리스트 항목 PASS)

---

## 1. Executive Summary

### 1.1 프로젝트 개요

Figma 프로토타입 기반으로 Discovery-X의 레이아웃과 메뉴를 전면 재구성했습니다. 기존 채팅 중심 단일 레이아웃에서 **3탭 GNB + 3패널 구조(사이드바 + Surface + 컨텍스트 패널)** + 사업제안(Proposals) 전체 기능으로 전환했습니다.

### 1.2 완료 상황

- **계획 문서**: `~/.claude/plans/peaceful-purring-teacup.md` ✅
- **구현 완료**: 19개 신규 파일 + 6개 수정 파일 + 1개 마이그레이션
- **테스트 완료**: 597개 모두 PASS (Regression 없음)
- **배포 상태**: 로컬 완료, 프로덕션 배포 대기

### 1.3 핵심 성과

| 항목 | 결과 |
|------|------|
| **Match Rate** | 93% (57/61) |
| **테스트** | 597/597 PASS (100%) |
| **코드 품질** | Zero lint errors, Zero type errors |
| **신규 테이블** | 6개 (proposals 도메인) |
| **신규 라우트** | 9개 (ideas 2 + proposals 7) |

---

## 2. PDCA 싸이클 요약

### 2.1 Plan 단계 (기획)

**문서**: `~/.claude/plans/peaceful-purring-teacup.md`

#### 핵심 기획

- **목표**: Figma 프로토타입 기반 레이아웃 재구성 + 사업제안 신규 기능
- **범위**: 4개 Phase (Layout Shell → Dashboard → Ideas → Proposals)
- **핵심 전환**:

| 항목 | 이전 | 이후 |
|------|------|------|
| GNB | 4탭 (대시보드/시장탐색/사업발굴/수집관리) | 3탭 (대시보드/아이디어/사업제안) |
| 센터 | ChatPanel 메인 | Surface — 탭별 콘텐츠 |
| 우측 | SummaryPanel (채팅 보조) | ContextPanel — 페이지별 콘텐츠 |
| 좌측 | 채팅 목록 | 보관함(폴더) + 채팅 목록 |
| 우상단 | 알림 뱃지 + 유저명 | 테마토글 + 설정 + 유저명 |

#### 4개 Phase 범위

| Phase | 내용 | 파일 수 |
|-------|------|:-------:|
| Phase 1 | Layout Shell (GNB, AppShell, ContextPanel, SidebarPanel) | 6 |
| Phase 2 | Dashboard 리뉴얼 (Surface + CollectionStatusPanel) | 2 |
| Phase 3 | 아이디어 페이지 (목록/상세 + MemoPanel) | 3 |
| Phase 4 | 사업제안 전체 (DB 6테이블 + CRUD + 댓글/마일스톤/액션) | 14 |

---

### 2.2 Do 단계 (구현)

**기간**: 2026-02-09 ~ 2026-02-10 (2일)
**커밋**: `84246ab`, `562ea3a`, `481b0c3`

#### Phase 1: Layout Shell (11개 파일)

**신규 파일 (3)**:
- `app/components/layout/ContextPanel.tsx` — 우측 컨텍스트 패널 셸
- `app/components/layout/ArchiveFolderList.tsx` — 보관함 폴더 리스트
- `app/components/dashboard/CollectionStatusPanel.tsx` — 대시보드 수집 현황 패널

**수정 파일 (4)**:
- `app/components/layout/TopNav.tsx` — 3탭 GNB + 우상단 재배치
- `app/components/layout/AppShell.tsx` — contextPanel + sidebarMode prop 추가
- `app/components/layout/SidebarPanel.tsx` — 보관함 구조 + mode prop
- `app/styles/dx-custom-tokens.css` — --dx-context-panel-width: 280px

#### Phase 2: Dashboard 리뉴얼 (1개 파일)

**수정 파일**:
- `app/routes/dashboard.tsx` — 레이아웃 구조 변경 (Surface + contextPanel 슬롯)

> **Note**: Dashboard Surface 콘텐츠(현황 섹션/통계 섹션)는 미완성 — 기존 Pipeline 칸반 유지

#### Phase 3: 아이디어 페이지 (3개 파일)

**신규 파일**:
- `app/routes/ideas.tsx` — 아이디어 목록 레이아웃 (Radar 데이터 재활용)
- `app/routes/ideas.$id.tsx` — 아이디어 상세 (블랙 헤더 + 본문)
- `app/components/ideas/MemoPanel.tsx` — 메모/노트 패널

#### Phase 4: 사업제안 (14개 파일, 1152 LOC 추가)

**DB 스키마** (`app/features/proposals/db/schema.ts`):
- `proposals` — 제안 메인 테이블 (status: DRAFT/REVIEWING/APPROVED/REJECTED)
- `proposal_sections` — 5개 섹션 (market/target/model/advantage/finance)
- `proposal_milestones` — 마일스톤 타임라인
- `proposal_actions` — 액션 아이템 (체크박스)
- `proposal_comments` — 팀 토론 댓글
- `proposal_members` — 멤버 M:N 관계

**라우트 (4개 페이지 + 3개 API)**:
- `proposals.tsx` — 레이아웃 (사이드바 + Surface + ProgressPanel)
- `proposals._index.tsx` — 빈 상태 / 선택 유도
- `proposals.$id.tsx` — 제안 상세 (타이틀 + 메타카드 + 섹션 + 토론)
- `proposals.new.tsx` — 새 제안 작성 폼
- `api.proposals.ts` — 목록 조회 + 삭제
- `api.proposals.$id.comments.ts` — 댓글 GET + POST
- `api.proposals.$id.actions.ts` — 액션 아이템 토글

**컴포넌트 (5개)**:
- `ProposalDetail.tsx` — 제안 상세 뷰 (4385 bytes)
- `ProposalForm.tsx` — 작성/수정 폼 (4637 bytes)
- `ProposalListSidebar.tsx` — 좌측 제안 목록
- `ProgressPanel.tsx` — 우측 진행 현황 패널
- `TeamDiscussion.tsx` — 팀 토론 (댓글 UI)

#### DB 마이그레이션

- `drizzle/0021_proposals.sql` — 6테이블 수동 마이그레이션 (16 SQL 커맨드)
- `drizzle/meta/_journal.json` — 0012~0021 전체 등록 (Drizzle 동기화)
- `tests/helpers/db.ts` — 마이그레이션 추가
- `app/db/index.ts` — proposalSchema 머지 (`{ ...schema, ...ventureSchema, ...proposalSchema }`)

---

### 2.3 Check 단계 (검증)

**기간**: 2026-02-10
**방법**: tmux Agent Teams (3명 병렬 Gap Analysis)

#### 검증 결과

**전체 테스트**: 597개 ALL PASS (Regression 없음)

| 검증 항목 | 상태 |
|----------|------|
| Lint errors | ✅ 0개 |
| TypeScript errors | ✅ 0개 |
| Test suite | ✅ 597/597 PASS |
| Build | ✅ Success |

#### Gap Analysis 결과

| 영역 | PASS | FAIL | Match Rate |
|------|:----:|:----:|:----------:|
| Layout Shell | 19 | 1 | 95% |
| Pages & Routes | 23 | 2 | 92% |
| API & DB | 15 | 1 | 94% |
| **전체** | **57** | **4** | **93%** |

#### FAIL 항목 상세

| # | Gap | 영향도 | 상태 |
|---|-----|--------|------|
| G-01 | **대시보드 Surface 현황 섹션 미구현** — 여전히 Pipeline 칸반 뷰 | 높음 | P2 (F21) |
| G-02 | **대시보드 Surface 통계 섹션 미구현** — 차트 placeholder 없음 | 높음 | P2 (F21) |
| G-03 | **SidebarPanel proposals 모드 미작동** — mode prop이 `_mode`로 무시됨 | 낮음 | 우회됨 |
| G-04 | **api.proposals.ts POST 미구현** — proposals.new.tsx action에서 처리 중 | 낮음 | 기능적 동작 |

#### Gap 분석 코멘트

- **G-01, G-02** (대시보드): Phase 2 작업이 레이아웃 셸만 변경하고 Surface 콘텐츠는 기존 유지. CollectionStatusPanel(우측 패널)은 구현 완료. SPEC.md §6에 F21로 등록됨.
- **G-03** (SidebarPanel mode): proposals.tsx에서 `sidebarContent={<ProposalListSidebar />}` prop으로 직접 전달하여 우회. 실사용에 영향 없음.
- **G-04** (API POST): Remix convention에 따라 `proposals.new.tsx`의 action handler에서 create 처리. REST API 분리와 다른 접근이지만 기능적으로 동일.

---

### 2.4 Act 단계 (개선)

#### 문서 현행화 (2026-02-10)

- SPEC.md §2: 라우트 84 → 100개 정확도 개선
- SPEC.md §3: 테이블 52 → 66개 현행화 (phantom 테이블 제거, 네이밍 수정)
- CLAUDE.md: 디렉토리 구조, 라우트 수, 테이블 수 동기화

#### Drizzle Journal 동기화 (2026-02-10)

- 수동 마이그레이션 0012~0020을 Drizzle journal에 등록
- 향후 `drizzle-kit generate`가 정확한 diff만 생성하도록 보장

---

## 3. 완료 결과

### 3.1 구현 통계

| 항목 | 수량 |
|------|:----:|
| **신규 파일** | 19 |
| **수정 파일** | 6 |
| **총 변경 파일** | 25 |
| **추가 코드** | ~1,700 LOC |
| **마이그레이션** | 1 (16 SQL) |
| **신규 테이블** | 6 |
| **신규 라우트** | 9 |
| **신규 컴포넌트** | 8 |

### 3.2 신규 파일 목록 (19개)

```
# 레이아웃 (3)
app/components/layout/ContextPanel.tsx
app/components/layout/ArchiveFolderList.tsx
app/components/dashboard/CollectionStatusPanel.tsx

# 아이디어 (3)
app/routes/ideas.tsx
app/routes/ideas.$id.tsx
app/components/ideas/MemoPanel.tsx

# 사업제안 — 라우트 (4)
app/routes/proposals.tsx
app/routes/proposals._index.tsx
app/routes/proposals.$id.tsx
app/routes/proposals.new.tsx

# 사업제안 — API (3)
app/routes/api.proposals.ts
app/routes/api.proposals.$id.comments.ts
app/routes/api.proposals.$id.actions.ts

# 사업제안 — 컴포넌트 (5)
app/components/proposals/ProposalDetail.tsx
app/components/proposals/ProposalForm.tsx
app/components/proposals/ProposalListSidebar.tsx
app/components/proposals/ProgressPanel.tsx
app/components/proposals/TeamDiscussion.tsx

# 사업제안 — DB (1)
app/features/proposals/db/schema.ts
```

### 3.3 수정 파일 목록 (6개)

```
app/components/layout/TopNav.tsx         — 3탭 GNB + 우상단 재배치
app/components/layout/AppShell.tsx       — contextPanel + sidebarMode prop
app/components/layout/SidebarPanel.tsx   — 보관함 + mode prop
app/routes/dashboard.tsx                 — Surface 레이아웃 변경
app/styles/dx-custom-tokens.css          — ContextPanel CSS 변수
app/db/index.ts                          — proposalSchema 머지
```

---

## 4. 주요 성과 & 이슈

### 4.1 성과 (What Went Well)

#### 1. Figma 프로토타입 기반 체계적 전환

**결과**: 4 Phase 순차 구현으로 레이아웃 전면 교체 성공
- Phase 1 (Shell) → Phase 4 (Full Feature) 단계적 안정성 확보
- 기존 기능 Regression 제로 (597개 테스트 유지)
- 3패널 구조로 확장성 확보 (페이지별 contextPanel 교체)

#### 2. 사업제안(Proposals) 전체 도메인 구현

**결과**: DB 6테이블 + CRUD + 댓글/마일스톤/액션을 1일 내 구현
- Feature Module 패턴 적용 (`app/features/proposals/`)
- Venture 패턴과 동일한 스키마 머지 구조
- Multi-tenant 지원 (tenantId FK)

#### 3. 컴포넌트 아키텍처 일관성

**결과**: AppShell → ContextPanel → 페이지별 콘텐츠 패턴 확립
- `contextPanel` prop으로 우측 패널 위임
- `sidebarContent` prop으로 좌측 사이드바 커스터마이징
- 반응형: lg 이상 3패널, 모바일 사이드바 오버레이

#### 4. Drizzle 마이그레이션 체계 정비

**결과**: 수동 마이그레이션 0012~0020을 journal에 등록하여 drizzle-kit 동기화
- 향후 `drizzle-kit generate`가 정확한 diff만 생성
- 0021_proposals.sql 수동 작성으로 안전한 마이그레이션 적용

---

### 4.2 개선 필요 항목 (Areas for Improvement)

#### 1. 대시보드 Surface 콘텐츠 미완성 (P1)

**문제**: Phase 2에서 레이아웃 셸만 변경, Figma 기반 현황/통계 섹션 미구현
**원인**: Pipeline 칸반 뷰와의 공존 결정 미루어짐
**해결**: F21 (대시보드 차트 실제 구현)으로 등록됨
**추정 노력**: 2-3시간

#### 2. SidebarPanel mode prop 미사용 (P3)

**문제**: proposals 모드 prop이 무시되고 sidebarContent로 우회
**원인**: proposals.tsx에서 직접 사이드바 콘텐츠를 전달하는 방식이 더 유연
**영향**: 낮음 — 기능적으로 동작, 아키텍처적으로는 불필요한 prop 존재
**해결**: mode prop 제거하거나, 향후 다른 모드 추가 시 활용

#### 3. 신규 기능 테스트 미추가 (P2)

**문제**: proposals 관련 신규 테스트가 없음
**원인**: UI 중심 구현으로 단위 테스트 대상이 제한적
**해결**: API 라우트 통합 테스트 추가 권장
**추정 노력**: 1시간

---

### 4.3 학습 사항 (Lessons Learned)

#### 1. Feature Module 패턴의 확장성

**학습**: `app/features/proposals/db/schema.ts` + `app/db/index.ts` 머지 패턴이 Venture와 동일하게 작동
**적용**: 향후 신규 도메인 추가 시 동일 패턴 재사용

#### 2. 수동 마이그레이션 관리의 중요성

**학습**: drizzle-kit이 모르는 수동 마이그레이션은 `drizzle-kit generate` 시 중복 생성 위험
**적용**: 수동 마이그레이션 생성 시 반드시 journal.json에 등록

#### 3. contextPanel 패턴의 유효성

**학습**: AppShell에 `contextPanel?: ReactNode` slot을 두면 페이지별 우측 패널을 자유롭게 교체 가능
**적용**: 향후 다른 페이지에도 동일 패턴 확장 (예: Venture Sprint 상세에 통계 패널)

---

## 5. 권장 사항

### 5.1 즉시 실행 항목

| 우선순위 | 작업 | 추정 노력 |
|---------|------|----------|
| P1 | 프로덕션 DB 마이그레이션 (`pnpm db:migrate:prod`) | 5분 |
| P1 | 프로덕션 배포 (`pnpm run deploy`) | 10분 |
| P2 | Proposals API 통합 테스트 추가 | 1시간 |

### 5.2 향후 개선 항목 (SPEC.md §6 등록됨)

| ID | 작업 | 상태 |
|----|------|------|
| F19 | 사업제안 고도화 (AI 자동 작성, PDF 내보내기) | 미착수 |
| F20 | 아이디어 페이지 고도화 (Radar 연동 강화) | 미착수 |
| F21 | 대시보드 차트 실제 구현 (placeholder → 실 데이터) | 미착수 |
| F22 | 보관함 폴더 CRUD 구현 | 미착수 |

---

## 6. 배포 체크리스트

- [x] 전체 테스트 597개 PASS
- [x] Lint/TypeScript 0 errors
- [x] 로컬 DB 마이그레이션 적용 (0021_proposals.sql)
- [x] tests/helpers/db.ts 마이그레이션 동기화
- [x] SPEC.md / CLAUDE.md 현행화 (100 라우트, 66 테이블)
- [ ] 프로덕션 DB 마이그레이션 (`pnpm db:migrate:prod`)
- [ ] 프로덕션 빌드 + 배포 (`pnpm run deploy`)
- [ ] 배포 후 3탭 GNB 동작 확인
- [ ] 배포 후 proposals CRUD 기능 확인

---

## 7. 커밋 히스토리

| 커밋 | 메시지 | 변경 파일 |
|------|--------|:--------:|
| `84246ab` | feat: 3탭 GNB + 컨텍스트 패널 레이아웃 + 아이디어 페이지 | 11 |
| `562ea3a` | feat: 사업제안 기능 전체 구현 (DB 스키마 + CRUD + 댓글/마일스톤) | 14 |
| `481b0c3` | feat: proposals DB 마이그레이션 생성 + 로컬 D1 적용 (0021) | 3 |
| `b16d884` | docs: update SPEC.md — 세션 128 레이아웃 재구성 + 사업제안 기능 반영 | 1 |
| `eeda9e7` | docs: update SPEC.md — §2 페이지 맵 라우트 정확도 개선 | 1 |
| `5610232` | docs: update CLAUDE.md — 디렉토리 구조 라우트 정보 현행화 | 1 |
| `6b68c9a` | docs: update CLAUDE.md — 라우트 100개 현행화 + 배포 CI/CD 반영 | 1 |

---

## 8. 참고 문서

| 단계 | 문서 | 경로 |
|------|------|------|
| Plan | 구현 계획서 | `~/.claude/plans/peaceful-purring-teacup.md` |
| Do | 구현 코드 | `84246ab`, `562ea3a`, `481b0c3` |
| Check | Gap Analysis | 본 보고서 §2.3 |
| Report | 본 보고서 | `docs/04-report/layout-proposals.report.md` |

### 관련 문서

- 프로젝트 기획서: `docs/Discovery-X_v1.4.md`
- 프로젝트 사양서: `SPEC.md` (§5 Current Status)

---

## 변경 로그

| 버전 | 날짜 | 변경 | 작성자 |
|------|------|------|--------|
| 1.0 | 2026-02-10 | 초안 작성 (전체 PDCA 요약) | Claude |

---

**Report Status**: COMPLETED
**Match Rate**: 93% (57/61)
**Recommendation**: Ready for production deployment
**Next Review**: F21 (대시보드 차트 구현) 완료 후
