# Ideas Page — Wireframe 기반 테스트 시나리오

> 기준 와이어프레임: `docs/archive/wireframes-v5/Discovery-X Wireframe_02_아이디어.png`
> 대상 구현: v6.2+ (3-Panel 아키텍처)
> 작성일: 2026-02-23

## 1. 아이디어 랜딩 (`/ideas`)

### 1.1 IdeaCardGrid

| # | 시나리오 | 테스트 파일 |
|---|----------|------------|
| 1 | 내/팀 아이디어 분리 (ownerId) | `idea-card-grid-logic.test.ts` |
| 2 | 상태 뱃지 (초안/검토/완료) | `idea-card-grid-logic.test.ts` |
| 3 | 7단계 프로그레스 dot | `idea-card-grid-logic.test.ts` |
| 4 | analysisData null 처리 | `idea-card-grid-logic.test.ts` |
| 5 | 새 아이디어 생성 버튼 | E2E |
| 6 | 카드 클릭 이동 | E2E |

### 1.2 SourceBrowser

| # | 시나리오 | 테스트 파일 |
|---|----------|------------|
| 7 | 소스 목록 표시 | `source-browser-logic.test.ts` |
| 8 | 타입 필터 | `source-browser-logic.test.ts` |
| 9 | 검색어 필터 | `source-browser-logic.test.ts` |
| 10 | 타입별 카운트 pill | `source-browser-logic.test.ts` |
| 11 | 소스 선택 요약 카드 | `source-browser-logic.test.ts` |
| 12 | text:// URL 감지 | `source-browser-logic.test.ts` |
| 13 | 제목 fallback | `source-browser-logic.test.ts` |
| 14 | 의미 없는 제목 감지 | `source-browser-logic.test.ts` |
| 15 | 메모 표시 조건 | `source-browser-logic.test.ts` |

## 2. 아이디어 상세 (`/ideas/$id`)

### 2.1 EditableTitle

| # | 시나리오 | 테스트 파일 |
|---|----------|------------|
| 16 | 편집 모드 전환 | `editable-title-logic.test.ts` |
| 17 | Enter 저장 | `editable-title-logic.test.ts` |
| 18 | Escape 취소 | `editable-title-logic.test.ts` |
| 19 | 빈 제목 차단 | `editable-title-logic.test.ts` |
| 20 | 100자 제한 | `editable-title-logic.test.ts` |
| 21 | API 실패 rollback | `editable-title-logic.test.ts` |

### 2.2 SuggestTitleButton

| # | 시나리오 | 테스트 파일 |
|---|----------|------------|
| 22 | 추천 요청 POST | `suggest-title-logic.test.ts` |
| 23 | 응답 파싱 | `suggest-title-logic.test.ts` |
| 24 | 중복 클릭 방지 | `suggest-title-logic.test.ts` |
| 25 | 에러 silent fail | `suggest-title-logic.test.ts` |
| 26 | 로딩 상태 흐름 | `suggest-title-logic.test.ts` |

### 2.3 MethodologyCards

| # | 시나리오 | 테스트 파일 |
|---|----------|------------|
| 27 | 6개 카테고리 카드 | `methodology-collapse-logic.test.ts` |
| 28 | 접기/펼치기 토글 | `methodology-collapse-logic.test.ts` |
| 29 | 분석 시작/재시작 | `methodology-collapse-logic.test.ts` |

### 2.4 아이디어 삭제

| # | 시나리오 | 테스트 파일 |
|---|----------|------------|
| 30 | 삭제 요청 | `delete-idea-logic.test.ts` |
| 31 | 삭제 후 리다이렉트 | `delete-idea-logic.test.ts` |

### 2.5 ProposalCreationModal

| # | 시나리오 | 테스트 파일 |
|---|----------|------------|
| 32 | 완료 카테고리 추출 | `proposal-mapping-logic.test.ts` |
| 33 | 탭-카테고리 매핑 | `proposal-mapping-logic.test.ts` |
| 34 | 탭별 콘텐츠 빌드 | `proposal-mapping-logic.test.ts` |
| 35 | 미완료 → null | `proposal-mapping-logic.test.ts` |
| 36 | 구분자 연결 | `proposal-mapping-logic.test.ts` |

### 2.6 SourceInputPanel

| # | 시나리오 | 테스트 파일 |
|---|----------|------------|
| 37 | 24시간 필터 | `source-input-panel-logic.test.ts` |
| 38 | 페이지네이션 | `source-input-panel-logic.test.ts` |
| 39 | 입력 파싱 | `source-input-panel-logic.test.ts` |

## 3. IdeaPageHeader

| # | 시나리오 | 테스트 파일 |
|---|----------|------------|
| 40 | 4개 탭 네비게이션 | E2E |
| 41 | 테마 토글 | E2E |
| 42 | 사업 제안하기 버튼 | E2E |

## 4. 커버리지 요약

| 그룹 | 시나리오 | 단위 테스트 |
|------|---------|-----------|
| IdeaCardGrid | 6 | 35 |
| SourceBrowser | 9 | 57 |
| EditableTitle | 6 | 17 |
| SuggestTitle | 5 | 14 |
| MethodologyCards | 3 | 11 |
| 삭제 | 2 | 6 |
| ProposalCreation | 5 | 22 |
| SourceInputPanel | 3 | 32 |
| SourceFilterBar | - | 15 |
| **합계** | **42** | **209** |

## 5. 와이어프레임 vs 구현 차이

| 와이어프레임 (v5) | 실제 구현 (v6.2+) |
|---|---|
| AppShell + contextPanel | 3-Panel 독립 레이아웃 |
| FilterBar 상단 필터 | SourceFilterBar pill |
| SimilarSources 패널 | 미사용 (dead code) |
| 6단계 프로그레스 | 7단계 (proposalCreated 추가) |
