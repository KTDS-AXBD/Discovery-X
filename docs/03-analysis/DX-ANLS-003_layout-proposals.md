# Gap Analysis: layout-proposals

> **Feature**: layout-proposals (3탭 GNB + 컨텍스트 패널 + 사업제안)
> **Date**: 2026-02-10
> **Method**: tmux Agent Teams (3 workers 병렬 검증)
> **Overall Match Rate**: 93% (57/61)

---

## 검증 영역별 결과

### 1. Layout Shell (Worker 1) — 95% (19/20)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | TopNav 3탭 (대시보드/아이디어/사업제안) | PASS | 정확히 3탭, 올바른 경로 |
| 2 | TopNav 아이콘 (Home/Lightbulb/FileText) | PASS | SVG 아이콘 매칭 |
| 3 | TopNav 우측 (테마토글+설정+유저명) | PASS | 3개 모두 구현 |
| 4 | TopNav 알림 뱃지 제거 | PASS | 렌더링 없음 |
| 5 | AppShell contextPanel prop | PASS | ReactNode 타입 |
| 6 | AppShell sidebarMode prop | PASS | "chat" \| "proposals" |
| 7 | AppShell 3패널 레이아웃 | PASS | TopNav + Sidebar + main + ContextPanel |
| 8 | AppShell 하위 호환 | PASS | contextPanel 없으면 숨김 |
| 9 | ContextPanel.tsx 존재 | PASS | 신규 파일 |
| 10 | ContextPanel main 우측 배치 | PASS | flex row 내 main 다음 |
| 11 | ContextPanel children prop | PASS | ReactNode |
| 12 | ContextPanel 280px CSS 변수 | PASS | var(--dx-context-panel-width) |
| 13 | ContextPanel lg 이상만 표시 | PASS | hidden lg:block |
| 14 | SidebarPanel mode prop | PASS | "chat" \| "proposals" |
| 15 | SidebarPanel chat 모드 콘텐츠 | PASS | 새 채팅+검색+보관함+채팅 내역 |
| 16 | SidebarPanel proposals 모드 | **FAIL** | mode prop → _mode로 무시, 항상 chat 렌더링 |
| 17 | ArchiveFolderList.tsx 존재 | PASS | 신규 파일 |
| 18 | 보관함 1depth 폴더 | PASS | 3개 기본 폴더 |
| 19 | 폴더명+아이템+추가 버튼 | PASS | 이름, 카운트, "+ 폴더 추가" |
| 20 | CSS 변수 정의 | PASS | --dx-context-panel-width: 280px |

### 2. Pages & Routes (Worker 2) — 92% (23/25)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | 대시보드 좌측 사이드바 | PASS | SidebarPanel 풀 구성 |
| 2 | 대시보드 Surface 현황 섹션 | **FAIL** | 여전히 Pipeline 칸반 뷰 |
| 3 | 대시보드 Surface 통계 섹션 | **FAIL** | 차트 placeholder 없음 |
| 4 | 대시보드 우측 CollectionStatusPanel | PASS | 도넛 차트+카테고리+소스 카드 |
| 5 | CollectionStatusPanel.tsx 존재 | PASS | |
| 6 | ideas.tsx 존재 | PASS | 목록 레이아웃 |
| 7 | ideas.$id.tsx 존재 | PASS | 상세 뷰 |
| 8 | 아이디어 상세 (블랙 헤더+본문) | PASS | bg-#18181B 헤더 |
| 9 | "아이디어로 전환" 버튼 | PASS | 텍스트만 (★ 없음, 경미한 차이) |
| 10 | MemoPanel 렌더링 | PASS | contextPanel로 전달 |
| 11 | MemoPanel.tsx 존재 | PASS | |
| 12 | proposals.tsx 레이아웃 | PASS | sidebarContent prop |
| 13 | proposals._index.tsx | PASS | 빈 상태 UI |
| 14 | proposals.$id.tsx | PASS | 제안 상세 |
| 15 | proposals.new.tsx | PASS | 새 제안 폼 |
| 16 | 제안 상세: 타이틀+뱃지+설명 | PASS | |
| 17 | 제안 상세: 메타 카드 3개 | PASS | 팀/시작일/예산 |
| 18 | 제안 상세: 5 섹션 | PASS | market/target/model/advantage/finance |
| 19 | 제안 상세: 팀 토론 | PASS | 댓글+입력 |
| 20 | ProgressPanel (우측) | PASS | 마일스톤+액션+통계 |
| 21 | ProposalListSidebar | PASS | 버튼+카드 목록 |
| 22 | ProposalDetail.tsx | PASS | |
| 23 | ProposalForm.tsx | PASS | |
| 24 | TeamDiscussion.tsx | PASS | |
| 25 | ProgressPanel.tsx | PASS | |

### 3. API & DB (Worker 3, 직접 분석) — 94% (15/16)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | proposals 테이블 컬럼 | PASS | 전체 매칭 |
| 2 | proposal_sections 테이블 | PASS | |
| 3 | proposal_milestones 테이블 | PASS | |
| 4 | proposal_actions 테이블 | PASS | |
| 5 | proposal_comments 테이블 | PASS | |
| 6 | proposal_members 테이블 (M:N) | PASS | |
| 7 | Foreign keys | PASS | tenants, users, proposals |
| 8 | 인덱스 | PASS | 5개 인덱스 |
| 9 | 0021_proposals.sql 존재 | PASS | 16 SQL 커맨드 |
| 10 | journal.json 0021 등록 | PASS | idx 21 |
| 11 | tests/helpers/db.ts 포함 | PASS | |
| 12 | api.proposals.ts POST | **FAIL** | proposals.new.tsx action에서 처리 |
| 13 | api.proposals.ts tenant 필터링 | PASS | |
| 14 | comments GET + POST | PASS | |
| 15 | actions 토글 | PASS | POST (PATCH 대신, 경미한 차이) |
| 16 | 스키마 머지 패턴 | PASS | |

---

## Gap 요약

| ID | Gap 설명 | 영향도 | 우선순위 | 후속 작업 |
|----|---------|--------|---------|----------|
| G-01 | 대시보드 Surface 현황 섹션 미구현 | 높음 | P1 | F21 |
| G-02 | 대시보드 Surface 통계 섹션 미구현 | 높음 | P1 | F21 |
| G-03 | SidebarPanel proposals 모드 미작동 | 낮음 | P3 | sidebarContent로 우회됨 |
| G-04 | api.proposals.ts POST 미구현 | 낮음 | P3 | proposals.new action에서 처리 |

**판정**: Match Rate 93% ≥ 90% → **COMPLETION 단계 진입 가능**
