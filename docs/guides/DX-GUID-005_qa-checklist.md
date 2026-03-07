---
code: DX-GUID-005
title: QA 체크리스트
version: 1.0
status: Active
category: GUID
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
system-version: ">=0.5.0"
---

# Discovery-X QA 체크리스트 (수동 테스트)

> 작성일: 2026-01-31
> 대상 버전: v0.3.0 (P0 전체 구현 완료)
> 테스트 환경: Cloudflare Pages 프로덕션 + 로컬 개발 서버

---

## 목차

1. [사전 준비](#1-사전-준비)
2. [Flow A: Seed Inbox 입력](#2-flow-a-seed-inbox-입력)
3. [Flow B: 실험으로 승격 (OPEN)](#3-flow-b-실험으로-승격-open)
4. [Flow C: 실험 추가 및 완료 기록](#4-flow-c-실험-추가-및-완료-기록)
5. [Flow D: Evidence 기록](#5-flow-d-evidence-기록)
6. [Flow E: Decision 닫기](#6-flow-e-decision-닫기)
7. [EXTENSION_REQUESTED 워크플로우](#7-extension_requested-워크플로우)
8. [Weekly Review 뷰](#8-weekly-review-뷰)
9. [Recall Queue 뷰](#9-recall-queue-뷰)
10. [Metrics 대시보드 + Export](#10-metrics-대시보드--export)
11. [대시보드 (홈)](#11-대시보드-홈)
12. [Discovery 편집](#12-discovery-편집)
13. [Overdue 경고 검증](#13-overdue-경고-검증)
14. [모바일 반응형 테스트 (375px)](#14-모바일-반응형-테스트-375px)
15. [Edge Case 및 Validation](#15-edge-case-및-validation)

---

## 1. 사전 준비

### 테스트 계정/환경
- [ ] 로그인 가능한 사용자 최소 2명 준비 (Owner/Reviewer 테스트용)
- [ ] 로컬: `pnpm dev` 또는 프로덕션 URL 접속 확인
- [ ] DB에 시드 데이터가 있거나, 빈 상태에서 시작

### 브라우저
- [ ] Chrome (최신 버전)
- [ ] Safari (선택)
- [ ] 모바일: Chrome DevTools 모바일 시뮬레이터 (375px width)

---

## 2. Flow A: Seed Inbox 입력

**경로**: `/discoveries/new`

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| A-1 | 제목, 요약, 출처 유형을 입력하고 저장 | status=INBOX로 생성, `/discoveries` 목록에 표시 | |
| A-2 | 제목 미입력 후 제출 | 에러 메시지 표시, 저장 안 됨 | |
| A-3 | 요약 미입력 후 제출 | 에러 메시지 표시, 저장 안 됨 | |
| A-4 | 제목 80자 초과 입력 | Validation 에러 메시지 표시 | |
| A-5 | 요약 400자 초과 입력 | Validation 에러 메시지 표시 | |
| A-6 | 링크 필드에 유효하지 않은 URL 입력 | 에러 메시지 표시 | |
| A-7 | 출처 유형 5종 각각 선택하여 저장 | article, issue, internal_pain, meeting_note, other 모두 정상 저장 | |
| A-8 | 생성된 Discovery 상세 페이지 확인 | INBOX 상태 배지 표시, 승격 버튼 표시 | |

---

## 3. Flow B: 실험으로 승격 (OPEN)

**경로**: `/discoveries/:id/promote`

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| B-1 | INBOX 상태 Discovery에서 "승격" 클릭 | 승격 폼 페이지로 이동 | |
| B-2 | Owner 선택 + 실험 정보 입력 후 제출 | status=OPEN, due_date=생성일+28일 자동 설정 | |
| B-3 | Owner 미선택 후 제출 | 에러: "Owner를 지정해야 합니다" | |
| B-4 | 실험 가설 미입력 후 제출 | 에러 메시지 표시 | |
| B-5 | 실험 최소행동 미입력 후 제출 | 에러 메시지 표시 | |
| B-6 | 실험 기한 미입력 후 제출 | 에러 메시지 표시 | |
| B-7 | 실험 기대근거 미입력 후 제출 | 에러 메시지 표시 | |
| B-8 | Reviewer 선택 (선택사항) 후 제출 | Reviewer가 상세 페이지에 표시 | |
| B-9 | 승격 후 상세 페이지 확인 | OPEN 배지, due_date 표시, 실험 1개 표시 | |
| B-10 | OPEN이 아닌 상태(NEXT 등)에서 승격 시도 | 불가능 (버튼 미표시 또는 에러) | |

---

## 4. Flow C: 실험 추가 및 완료 기록

### 실험 추가
**경로**: `/discoveries/:id/add-experiment`

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| C-1 | OPEN 상태에서 실험 추가 (2번째) | 정상 추가, 상세 페이지에 실험 2개 표시 | |
| C-2 | 실험 2개 있는 상태에서 3번째 추가 시도 | 에러: "최대 2개 실험만 가능합니다" | |
| C-3 | 필수 필드(가설, 최소행동, 기한, 기대근거) 누락 | 각 필드별 에러 메시지 표시 | |

### 실험 완료 기록
**경로**: `/discoveries/:id/complete-experiment`

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| C-4 | 미완료 실험에서 "결과 기록" 클릭 | 완료 폼 페이지로 이동 | |
| C-5 | 결과 요약 입력 후 제출 | completedAt 설정, 상세 페이지에서 완료 상태 시각 구분 | |
| C-6 | 결과 요약 미입력 후 제출 | 에러 메시지 표시 | |
| C-7 | 이미 완료된 실험에 다시 "결과 기록" 시도 | 버튼 미표시 또는 불가 처리 | |

---

## 5. Flow D: Evidence 기록

**경로**: `/discoveries/:id/add-evidence`

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| D-1 | 타입 선택 (DATA/USER/ARTIFACT/REF/ASSUMPTION) | 5종 모두 정상 선택 가능 | |
| D-2 | 강도 선택 (A/B/C/D) | 4종 모두 정상 선택 가능 | |
| D-3 | 내용 입력 + 링크 입력 후 저장 | Evidence 목록에 표시 | |
| D-4 | 내용 미입력 후 제출 | 에러 메시지 표시 | |
| D-5 | 타입 미선택 후 제출 | 에러 메시지 표시 | |
| D-6 | 실험에 연결하여 Evidence 추가 | 해당 실험과 연결된 상태로 표시 | |
| D-7 | ASSUMPTION 타입 Evidence 추가 | "가정" 표기가 시각적으로 구분 | |

---

## 6. Flow E: Decision 닫기

### 6-1. NEXT 결정
**경로**: `/discoveries/:id/decide-next`

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| E-1 | 결정 근거 입력 후 NEXT 제출 | status=NEXT, 결정 일시 기록 | |
| E-2 | A/B급 Evidence 2개 미만일 때 NEXT | 경고 메시지 표시 (저장은 가능) | |
| E-3 | 결정 근거 미입력 후 제출 | 에러 메시지 표시 | |
| E-4 | NEXT 결정 후 상세 페이지 확인 | NEXT 배지, 결정 근거/일시 표시 | |

### 6-2. NOT_NOW 결정
**경로**: `/discoveries/:id/decide-not-now`

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| E-5 | 모든 필수 필드 입력 후 제출 | status=NOT_NOW, 트리거/재검토일 기록 | |
| E-6 | 트리거 유형 미선택 후 제출 | 에러: 트리거 유형 필수 | |
| E-7 | 트리거 조건 미입력 후 제출 | 에러 메시지 표시 | |
| E-8 | 재검토 날짜 미입력 후 제출 | 에러 메시지 표시 | |
| E-9 | 재검토 날짜에 과거 날짜 입력 | 에러: "재검토 날짜는 미래 날짜여야 합니다" | |
| E-10 | 트리거 유형 4종 각각 테스트 | Technology_Maturity, Policy_Regulation, Customer_Behavior, Internal_Capability 모두 정상 | |
| E-11 | NOT_NOW 결정 후 상세 페이지 확인 | NOT_NOW 배지, 트리거 정보, 재검토일 표시 | |

### 6-3. DEAD_END 결정
**경로**: `/discoveries/:id/decide-dead-end`

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| E-12 | 실패 패턴 1개 + 증거 기반 사유 입력 후 제출 | status=DEAD_END, 패턴/사유 기록 | |
| E-13 | 실패 패턴 3개 선택 후 제출 | 정상 저장 (최대 3개) | |
| E-14 | 실패 패턴 미선택 후 제출 | 에러: "최소 1개의 실패 패턴을 선택해야 합니다" | |
| E-15 | 증거 기반 사유 미입력 후 제출 | 에러 메시지 표시 | |
| E-16 | DEAD_END 결정 후 상세 페이지 확인 | DEAD_END 배지, 실패 패턴 태그, 사유 표시 | |

---

## 7. EXTENSION_REQUESTED 워크플로우

**경로**: `/discoveries/:id/request-extension`

### 사전 조건: OPEN 상태 + 실험 2개 등록 완료

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| G-1 | OPEN + 실험 2개일 때 상세 페이지 확인 | "연장 요청" 버튼 표시 | |
| G-2 | 연장 사유 입력 후 제출 | status=EXTENSION_REQUESTED, due_date +14일 연장 | |
| G-3 | 연장 사유 미입력 후 제출 | 에러 메시지 표시 | |
| G-4 | EXTENSION_REQUESTED 상태에서 실험 추가 (3번째) | 정상 추가 가능 (최대 3개로 확장) | |
| G-5 | EXTENSION_REQUESTED에서 4번째 실험 추가 시도 | 에러 메시지 표시 (최대 3개) | |
| G-6 | EXTENSION_REQUESTED에서 NEXT 결정 | 정상 전환 | |
| G-7 | EXTENSION_REQUESTED에서 NOT_NOW 결정 | 정상 전환 (필수 필드 검증 동일) | |
| G-8 | EXTENSION_REQUESTED에서 DEAD_END 결정 | 정상 전환 (필수 필드 검증 동일) | |
| G-9 | OPEN + 실험 1개일 때 연장 요청 버튼 확인 | 버튼 미표시 (실험 2개 필요) | |
| G-10 | 연장 후 due_date 확인 | 기존 due_date에서 정확히 14일 추가 | |

---

## 8. Weekly Review 뷰

**경로**: `/review`

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| H-1 | OPEN 상태 Discovery가 목록에 표시 | OPEN 항목만 표시 | |
| H-2 | 경과일(Age) 순 정렬 확인 | 오래된 항목이 상단에 표시 | |
| H-3 | 각 항목에 Owner, Due Date, 경과일 표시 | 모든 정보가 정상 표시 | |
| H-4 | 경과일 색상 구분 확인 | 오래된 항목일수록 경고 색상 | |
| H-5 | 기한 초과 항목 시각적 구분 | 빨간색 등 경고 표시 | |
| H-6 | EXTENSION_REQUESTED 항목도 표시 | 연장 요청 상태도 리뷰 대상 | |
| H-7 | Discovery 상세 링크 클릭 | 해당 상세 페이지로 이동 | |
| H-8 | OPEN 항목이 없을 때 | 빈 상태 메시지 표시 | |

---

## 9. Recall Queue 뷰

**경로**: `/recall`

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| I-1 | Revisit Date가 도래한 NOT_NOW 항목 표시 | 재검토 대상 목록 표시 | |
| I-2 | Revisit Date가 미래인 항목 확인 | 도래하지 않은 항목은 미표시 또는 구분 | |
| I-3 | 각 항목에 트리거 유형, 재검토일 표시 | 정보 정상 표시 | |
| I-4 | Discovery 상세 링크 클릭 | 해당 상세 페이지로 이동 | |
| I-5 | NOT_NOW 항목이 없을 때 | 빈 상태 메시지 표시 | |

---

## 10. Metrics 대시보드 + Export

**경로**: `/metrics`

### 지표 표시

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| J-1 | 상태별 Discovery 수 표시 | INBOX/OPEN/NEXT/NOT_NOW/DEAD_END 각 건수 | |
| J-2 | Seed -> Experiment 전환율 | 올바른 비율 계산 | |
| J-3 | 28일 내 Decision 종료율 | 올바른 비율 계산 | |
| J-4 | Experiment 완료율 | 올바른 비율 계산 | |
| J-5 | 재호출 이벤트 수 | 정확한 건수 표시 | |
| J-6 | StatusDonut 차트 (상태 분포) | SVG 도넛 차트 정상 렌더링 | |
| J-7 | WeeklyBar 차트 (주간 생성 추이) | SVG 막대 차트 정상 렌더링 | |

### Export

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| J-8 | Discovery CSV Export (`/api/export/discoveries`) | CSV 파일 다운로드, 데이터 정확 | |
| J-9 | Metrics CSV Export (`/api/export/metrics`) | CSV 파일 다운로드, 지표 데이터 포함 | |
| J-10 | 데이터 없을 때 Export | 빈 CSV 또는 헤더만 포함된 파일 | |

---

## 11. 대시보드 (홈)

**경로**: `/`

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| K-1 | 로그인 상태에서 대시보드 접속 | Discovery 요약 카드 표시 | |
| K-2 | 기한 초과 경고 배너 | 기한 초과 Discovery가 있으면 경고 표시 | |
| K-3 | 3일 이내 마감 경고 | 임박 마감 Discovery 경고 표시 | |
| K-4 | 기한 초과/재검토 대기 카드 | 해당 항목 카드 형태로 표시 | |
| K-5 | 빠른 액션 버튼 | "새 Discovery 추가" 등 버튼 작동 | |
| K-6 | 미로그인 상태에서 접속 | 로그인 페이지로 리다이렉트 | |

---

## 12. Discovery 편집

**경로**: `/discoveries/:id/edit`

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| L-1 | INBOX 상태 Discovery 편집 | 제목/요약/링크/출처 수정 가능 | |
| L-2 | OPEN 상태 Discovery 편집 | 제목/요약/링크/출처 수정 가능 | |
| L-3 | NEXT/NOT_NOW/DEAD_END 상태에서 편집 시도 | 편집 버튼 미표시 또는 불가 | |
| L-4 | Owner 변경 (INBOX/OPEN) | Owner 재지정 정상 작동 | |
| L-5 | Reviewer 변경 (상세 페이지) | Reviewer 변경 정상 작동 | |

---

## 13. Overdue 경고 검증

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| M-1 | due_date 초과된 OPEN Discovery 확인 | 목록에서 OVERDUE 배지 표시 | |
| M-2 | 대시보드에서 기한 초과 경고 배너 | 경고 배너 표시 | |
| M-3 | 상세 페이지에서 기한 초과 경고 | 경고 배너 표시 | |
| M-4 | Discovery 목록에서 OVERDUE 필터 | 기한 초과 항목만 필터링 | |
| M-5 | INBOX 7일 경과 경고 | 7일 초과 INBOX 항목에 경고 배지 | |

---

## 14. 모바일 반응형 테스트 (375px)

> Chrome DevTools > Toggle Device Toolbar > iPhone SE (375px) 또는 수동 375px 설정

### 네비게이션

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| N-1 | 햄버거 메뉴 아이콘 표시 | sm 이하에서 메뉴 아이콘 표시, 전체 네비 숨김 | |
| N-2 | 햄버거 메뉴 클릭 시 메뉴 펼침 | 전체 메뉴 항목 표시 | |
| N-3 | Review/Recall 알림 배지 | 모바일에서도 배지 정상 표시 | |

### 주요 페이지

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| N-4 | Discovery 목록 (375px) | 카드/리스트가 한 줄로 표시, 가로 스크롤 없음 | |
| N-5 | Discovery 상세 (375px) | 버튼들이 세로 배치, 읽기 편한 레이아웃 | |
| N-6 | 상세 페이지 액션 버튼 (375px) | 반응형 배치 (가로 오버플로 없음) | |
| N-7 | 폼 페이지들 (375px) | 입력 필드가 전체 너비, 제출 버튼 접근 가능 | |
| N-8 | Weekly Review (375px) | 테이블 대신 카드 레이아웃 | |
| N-9 | Recall Queue (375px) | 테이블 대신 카드 레이아웃 | |
| N-10 | Metrics (375px) | 차트 정상 표시, 가로 스크롤 없음 | |
| N-11 | 대시보드 (375px) | 카드 세로 배치, 읽기 편함 | |

---

## 15. Edge Case 및 Validation

### 상태 전환 규칙

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| P-1 | INBOX에서 바로 NEXT/NOT_NOW/DEAD_END 전환 시도 | 불가 (OPEN 경유 필수) | |
| P-2 | NEXT 상태에서 다시 OPEN으로 되돌리기 시도 | 불가 (역방향 전환 차단) | |
| P-3 | Owner 없는 상태에서 Decision 시도 | 에러 메시지 표시 | |
| P-4 | 같은 Discovery에 동시에 2개 탭에서 Decision | 하나만 성공 또는 둘 다 정합성 유지 | |

### 실험 제한

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| P-5 | OPEN + 실험 0개 상태에서 실험 추가 | 실험 추가 가능 | |
| P-6 | OPEN + 실험 2개에서 연장 없이 3번째 추가 | "최대 2개" 에러 | |
| P-7 | EXTENSION_REQUESTED + 실험 3개에서 4번째 추가 | "최대 3개" 에러 | |

### 필수 필드 강제

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| P-8 | NOT_NOW: 트리거 유형만 입력, 나머지 누락 | 저장 불가, 누락 필드 에러 | |
| P-9 | NOT_NOW: 재검토 날짜에 오늘 날짜 입력 | "미래 날짜여야 합니다" 에러 | |
| P-10 | DEAD_END: 패턴 4개 이상 선택 시도 | "최대 3개" 에러 또는 UI에서 제한 | |
| P-11 | DEAD_END: 사유 200자 초과 | Validation 에러 | |

### 인증

| # | 테스트 항목 | 기대 결과 | Pass/Fail |
|---|-----------|---------|-----------|
| P-12 | 미인증 상태에서 `/discoveries` 접속 | 로그인 페이지로 리다이렉트 | |
| P-13 | 세션 만료 후 액션 시도 | 로그인 페이지로 리다이렉트 | |
| P-14 | 로그아웃 후 뒤로가기 | 보호된 페이지 접근 불가 | |

---

## 전체 워크플로우 통합 테스트

> 아래 시나리오를 처음부터 끝까지 순서대로 수행한다.

### 시나리오 1: 정상 흐름 (INBOX -> OPEN -> NEXT)

1. [ ] 새 Discovery 생성 (INBOX)
2. [ ] 실험 1개 등록 + Owner 지정하여 승격 (OPEN)
3. [ ] 실험 결과 기록 (완료)
4. [ ] Evidence 2개 추가 (A급 + B급)
5. [ ] NEXT 결정
6. [ ] 상세 페이지에서 전체 이력 확인

### 시나리오 2: NOT_NOW 흐름

1. [ ] 새 Discovery 생성 (INBOX)
2. [ ] 승격 (OPEN)
3. [ ] 실험 1개 완료 + Evidence 1개 추가
4. [ ] NOT_NOW 결정 (트리거: 기술 성숙도, 재검토: 30일 후)
5. [ ] Recall Queue에서 해당 항목 확인 (재검토일 도래 시)

### 시나리오 3: DEAD_END 흐름

1. [ ] 새 Discovery 생성 (INBOX)
2. [ ] 승격 (OPEN)
3. [ ] 실험 2개 수행 + 각각 완료 기록
4. [ ] DEAD_END 결정 (패턴 2개 + 사유 입력)
5. [ ] 상세 페이지에서 실패 패턴 태그 확인

### 시나리오 4: EXTENSION_REQUESTED 흐름

1. [ ] 새 Discovery 생성 (INBOX)
2. [ ] 승격 (OPEN)
3. [ ] 실험 2개 등록 + 완료
4. [ ] 연장 요청 (EXTENSION_REQUESTED) -- 사유 입력
5. [ ] due_date +14일 확인
6. [ ] 3번째 실험 추가 + 완료
7. [ ] NEXT 또는 NOT_NOW 또는 DEAD_END로 최종 결정

---

## 비고

- 테스트 수행자: _______________
- 테스트 일시: _______________
- 발견된 이슈: 별도 기록
