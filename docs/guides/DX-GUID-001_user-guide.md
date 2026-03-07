---
code: DX-GUID-001
title: 사용자 가이드
version: 1.0
status: Active
category: GUID
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
system-version: ">=0.5.0"
---

# Discovery-X 사용자 가이드

> 버전: v0.3.0 | 작성일: 2026-01-31
> 대상: AX 신사업팀 운영 실험 참여자 (최대 5명)

---

## 목차

1. [Discovery-X란?](#1-discovery-x란)
2. [핵심 개념](#2-핵심-개념)
3. [상태 전환 규칙](#3-상태-전환-규칙)
4. [기능별 사용법](#4-기능별-사용법)
5. [운영 뷰](#5-운영-뷰)
6. [자주 묻는 질문 (FAQ)](#6-자주-묻는-질문-faq)

---

## 1. Discovery-X란?

### 한 줄 정의

Discovery-X는 AX 신사업을 위해 **관찰을 행동으로 밀어내고**, 행동을 **근거 있는 문서**로 남기며, 그 문서를 다시 조직의 **사고 자산**으로 축적하는 **내부 실험 중심 사고 시스템**이다.

### 왜 필요한가

AX 신사업 발굴 과정에서 반복되는 문제:
- 관찰이 행동으로 안 이어진다 (실험 부재)
- 근거가 축적되지 않는다
- 최종 판단(Next / Not Now / Dead End)이 닫히지 않는다 (결정 회피)

Discovery-X는 이 문제를 해결하기 위해 **관찰 -> 내부 실험 -> 근거 -> 결정**을 강제로 닫게 하는 시스템이다.

### 핵심 원칙

- **정답을 찾지 않는다** -- 대신, 언제까지 무엇을 해보면 되겠는지를 남긴다
- **의도된 인지 부하** -- "쉽게" 만드는 UX가 목표가 아니라, 행동과 결정을 강제하는 구조가 목표
- **Single-Threaded Ownership** -- Discovery당 책임자 1명이 끝까지 닫는다
- **Time-boxed** -- 무한 탐구 금지. 최대 4주 또는 실험 2회 내 결정

---

## 2. 핵심 개념

### 2.1 Discovery (디스커버리)

시스템의 메인 레코드. 하나의 관찰/아이디어/이슈에서 시작하여 최종 결정(Next/Not Now/Dead End)까지의 전체 여정을 담는다.

**구성 요소:**
- **제목** (80자 이내): 관찰 대상을 한 줄로 요약
- **Seed 요약** (400자 이내): 왜 이것을 관찰했는지, 어떤 맥락인지 기술
- **출처 유형**: 기사(article), 이슈(issue), 내부 Pain(internal_pain), 미팅 노트(meeting_note), 기타(other)
- **링크**: 관련 자료 URL (선택)

### 2.2 Experiment (실험)

Discovery에 대한 내부 실험. PoC나 프로젝트가 아니라 **생각을 깨는 최소 행동**이다.

**필수 항목:**
- **가설** (200자): "~하면 ~할 것이다"
- **최소 행동** (200자): 실제로 무엇을 할 것인가
- **기한**: 기본 D+2, 최대 D+7
- **기대 근거** (200자): 이 행동으로 무엇을 확인할 수 있는가

**제한:**
- Discovery당 최대 **2개** (EXTENSION_REQUESTED 시 최대 3개)

### 2.3 Evidence (근거)

실험 결과를 포함한 판단의 근거.

**타입 (5종):**
| 타입 | 설명 | 예시 |
|------|------|------|
| DATA (데이터) | 정량 데이터, 로그, 통계 | A/B 테스트 결과 |
| USER (사용자 피드백) | 인터뷰, 설문, 관찰 | 인터뷰 10명 중 8명이 언급 |
| ARTIFACT (산출물) | 프로토타입, 문서, 코드 | POC 저장소 링크 |
| REF (외부 참조) | 논문, 사례, 벤치마크 | 경쟁사 사례 |
| ASSUMPTION (가정) | 검증되지 않은 추론 | "아마도 효과가 있을 것" |

**강도 (4등급):**
| 등급 | 이름 | 의미 |
|------|------|------|
| A | Hard | 재현 가능한 정량 데이터 |
| B | Direct | 직접 관찰/인터뷰 |
| C | Indirect | 간접 증거, 유사 사례 |
| D | Intuition | 추론, 직관, 가정 |

> NEXT 결정 시 **A/B급 근거 최소 2개**를 권장한다. D급(Intuition) 단독으로는 NEXT 불가.

### 2.4 역할

| 역할 | 책임 |
|------|------|
| **Owner** (필수) | Discovery를 끝까지 닫는 사람. 실험, 근거 기록, 최종 결정 모두 책임 |
| **Reviewer** (권장) | Next(전진)와 연장 승인 등 리소스 커밋이 필요한 결정을 확인/승인 |
| **Curator/Ops** (권장) | Inbox TTL 정리, Not Now 재검토 큐 운영, 지표 집계 |

---

## 3. 상태 전환 규칙

### 3.1 상태 흐름도

```
INBOX ──(승격)──> OPEN ──(결정)──> NEXT
                   |                NOT_NOW
                   |                DEAD_END
                   |
                   └──(실험 2개 완료 후)──> EXTENSION_REQUESTED
                                              |
                                              └──(결정)──> NEXT
                                                           NOT_NOW
                                                           DEAD_END
```

### 3.2 상태별 설명

| 상태 | 의미 | 진입 조건 |
|------|------|----------|
| **INBOX** | Seed 임시 저장. 아직 실험 대상이 아님 | Discovery 생성 시 자동 |
| **OPEN** | 실험 진행 중. 28일 이내 결정 필요 | Owner 지정 + 실험 1개 등록 |
| **NEXT** | 전진 결정. 다음 단계로 이동할 가치 있음 | OPEN/EXTENSION_REQUESTED에서 결정 |
| **NOT_NOW** | 보류. 조건 변경 시 재검토 | 트리거 유형 + 재검토 날짜 필수 |
| **DEAD_END** | 중단. 실패 패턴으로 기록 | 실패 패턴 1~3개 + 사유 필수 |
| **EXTENSION_REQUESTED** | 연장 요청. 추가 실험 필요 | OPEN + 실험 2개 완료 후 |

### 3.3 핵심 규칙

1. **Owner 없이는 OPEN 이상으로 전환 불가**
2. **OPEN 전환 시 due_date 자동 설정** (생성일 + 28일)
3. **실험은 최대 2개** (EXTENSION_REQUESTED 승인 시 최대 3개)
4. **EXTENSION_REQUESTED 시 due_date +14일 연장**
5. **NOT_NOW은 반드시 트리거 유형 + 조건 + 재검토 날짜 기록**
6. **DEAD_END는 반드시 실패 패턴 태그(1~3개) + 증거 기반 사유 기록**

---

## 4. 기능별 사용법

### 4.1 새 Discovery 등록 (Seed Inbox)

**경로**: `/discoveries/new`

1. "새 Discovery" 버튼 클릭
2. 제목, 요약, 출처 유형 입력 (링크는 선택)
3. 저장 -- INBOX 상태로 생성

> INBOX는 임시 저장소이다. 7일 이상 방치되면 경고가 표시된다.

### 4.2 실험으로 승격 (INBOX -> OPEN)

**경로**: `/discoveries/:id/promote`

1. Discovery 상세 페이지에서 "승격" 버튼 클릭
2. **Owner 지정** (필수) -- 누가 이 Discovery를 끝까지 닫을 것인가
3. **Reviewer 지정** (선택) -- Next/연장 승인을 확인할 사람
4. **첫 번째 실험 등록** -- 가설, 최소 행동, 기한, 기대 근거
5. 제출 -- OPEN 상태로 전환, due_date 자동 설정 (+28일)

### 4.3 실험 추가

**경로**: `/discoveries/:id/add-experiment`

- OPEN 상태에서 2번째 실험 추가 가능
- EXTENSION_REQUESTED 상태에서 3번째 실험 추가 가능
- 가설, 최소 행동, 기한, 기대 근거 모두 필수

### 4.4 실험 완료 기록

**경로**: `/discoveries/:id/complete-experiment`

1. 상세 페이지에서 미완료 실험의 "결과 기록" 버튼 클릭
2. 결과 요약 입력 (400자 이내)
3. 제출 -- 완료 일시가 자동 기록됨

### 4.5 근거(Evidence) 추가

**경로**: `/discoveries/:id/add-evidence`

1. 상세 페이지에서 "근거 추가" 버튼 클릭
2. **타입 선택**: DATA / USER / ARTIFACT / REF / ASSUMPTION
3. **강도 선택**: A (Hard) / B (Direct) / C (Indirect) / D (Intuition)
4. 내용 입력 (400자 이내)
5. 링크 입력 (선택)
6. 실험 연결 (선택) -- 어떤 실험에서 나온 근거인지

### 4.6 결정 (Decision)

#### NEXT 결정
**경로**: `/discoveries/:id/decide-next`

- 결정 근거 입력 (400자)
- A/B급 근거 2개 미만이면 경고 메시지 표시 (저장은 가능)

#### NOT_NOW 결정
**경로**: `/discoveries/:id/decide-not-now`

필수 입력:
- **결정 근거** (400자)
- **트리거 유형** (4종 중 선택)
  - 기술 성숙도 (Technology Maturity)
  - 정책/규제 (Policy/Regulation)
  - 고객 행동 (Customer Behavior)
  - 내부 역량 (Internal Capability)
- **트리거 조건** (200자): "무엇이 바뀌면 다시 볼 것인가"
- **재검토 날짜**: 언제 다시 볼 것인가 (미래 날짜만 가능)

#### DEAD_END 결정
**경로**: `/discoveries/:id/decide-dead-end`

필수 입력:
- **결정 근거** (400자)
- **실패 패턴** (1~3개 선택): 전제 가정 붕괴, 수요 부재, 기술적 불가능, 리소스 확보 실패, 규제/정책 장벽, 시장 타이밍 오류, 경쟁 우위 부족, 단위 경제성 붕괴, 스코프 과대, 의존성 실패
- **증거 기반 사유** (200자): 왜 안 됐는지 1줄 요약

### 4.7 연장 요청 (EXTENSION_REQUESTED)

**경로**: `/discoveries/:id/request-extension`

- **조건**: OPEN 상태 + 실험 2개가 등록된 상태
- 연장 사유 입력 (400자)
- 제출 시:
  - 상태가 EXTENSION_REQUESTED로 전환
  - due_date가 14일 연장
  - 3번째 실험 추가 가능

### 4.8 Discovery 편집

**경로**: `/discoveries/:id/edit`

- INBOX 또는 OPEN 상태에서만 편집 가능
- 제목, 요약, 링크, 출처 유형 수정 가능
- Owner/Reviewer 변경도 가능

---

## 5. 운영 뷰

### 5.1 대시보드 (홈)

**경로**: `/`

로그인 후 첫 화면. 다음 정보를 한눈에 확인:
- Discovery 요약 (상태별 건수)
- 기한 초과 경고 (due_date 초과된 OPEN 항목)
- 3일 이내 마감 경고
- 재검토 대기 항목 (Revisit Date 도래한 NOT_NOW)
- 빠른 액션 (새 Discovery 추가 등)

### 5.2 Discovery 목록

**경로**: `/discoveries`

- 전체 Discovery 목록
- **상태별 필터**: INBOX, OPEN, NEXT, NOT_NOW, DEAD_END, OVERDUE
- OVERDUE 필터: 기한 초과된 항목만 표시
- 각 항목에 상태 배지, Owner, 경과일 등 표시

### 5.3 Weekly Review 뷰

**경로**: `/review`

주간 결정 리뷰를 위한 화면. **Weekly Decision Review (30분) 미팅에서 사용**.

표시 내용:
- OPEN 및 EXTENSION_REQUESTED 상태 항목
- 경과일(Age) 순 정렬 (오래된 항목이 상단)
- Owner, Due Date, 경과일 정보
- 기한 초과 항목은 빨간색 경고

사용법:
1. 미팅 시작 시 `/review` 화면을 공유
2. 위에서부터 순서대로 각 Discovery를 검토
3. Owner가 1줄 요약 + 다음 상태 제안
4. 필요시 해당 Discovery 상세 페이지로 이동하여 결정 기록

### 5.4 Recall Queue 뷰

**경로**: `/recall`

재검토 대상 NOT_NOW 항목을 관리하는 화면.

표시 내용:
- Revisit Date가 도래한 NOT_NOW 항목
- 트리거 유형, 재검토 날짜 정보
- 상세 페이지 링크

사용법:
1. 정기적으로 (또는 Monthly Failure Replay 미팅에서) 확인
2. 재검토 대상이 있으면 상세 페이지에서 재결정 (OPEN으로 재활성화 또는 DEAD_END로 종료)

### 5.5 Metrics 대시보드

**경로**: `/metrics`

운영 실험 판단을 위한 최소 지표 화면.

표시 지표:
- **상태 분포**: 도넛 차트 (StatusDonut)
- **주간 생성 추이**: 막대 차트 (WeeklyBar)
- **Seed -> Experiment 전환율**: INBOX에서 OPEN으로 승격된 비율
- **28일 내 Decision 종료율**: 목표 90% 이상
- **Experiment 완료율**: 목표 80% 이상
- **재호출 이벤트 수**: 목표 월 1회 이상

### 5.6 데이터 Export

- **Discovery Export**: `/api/export/discoveries` -- 전체 Discovery 데이터 CSV
- **Metrics Export**: `/api/export/metrics` -- 지표 데이터 CSV

Metrics 페이지에서 Export 버튼으로 다운로드 가능.

---

## 6. 자주 묻는 질문 (FAQ)

### Q1. Discovery를 만들었는데 바로 실험을 시작해야 하나요?

아니요. Discovery는 먼저 **INBOX**에 저장됩니다. 실험할 준비가 되면 "승격"하여 OPEN 상태로 전환하세요. 단, INBOX에 7일 이상 방치하면 경고가 표시됩니다.

### Q2. 실험을 2개 다 했는데 아직 결정을 못 하겠어요.

OPEN 상태에서 실험 2개를 모두 등록한 후에는 "연장 요청" 버튼이 나타납니다. 연장 사유를 입력하면 EXTENSION_REQUESTED 상태가 되고, due_date가 14일 연장되며, 3번째 실험을 추가할 수 있습니다.

### Q3. NOT_NOW와 DEAD_END의 차이는 무엇인가요?

- **NOT_NOW**: "지금은 안 되지만, 조건이 바뀌면 다시 볼 수 있다." 반드시 재검토 트리거와 날짜를 기록해야 합니다. Recall Queue에서 자동으로 재검토 대상으로 올라옵니다.
- **DEAD_END**: "확인 결과 안 된다. 이유를 남기고 종료한다." 실패 패턴을 태깅하여 향후 유사한 시도에서 참고 자산으로 활용합니다.

### Q4. Owner를 변경할 수 있나요?

네. INBOX 또는 OPEN 상태에서 편집 페이지(`/discoveries/:id/edit`)를 통해 Owner를 변경할 수 있습니다. 다만, Owner 공백 상태는 허용되지 않습니다.

### Q5. NEXT로 결정하려면 강한 근거가 꼭 필요한가요?

A/B급 근거 2개는 **권장**사항입니다. 2개 미만이어도 NEXT 결정은 가능하지만, 경고 메시지가 표시됩니다. 근거가 부족한 상태에서의 결정은 신중하게 하세요.

### Q6. 기한이 지나면 어떻게 되나요?

시스템이 자동으로 종료하지는 않습니다. 대신 다음과 같은 경고가 표시됩니다:
- 대시보드에 기한 초과 경고 배너
- Discovery 목록에서 OVERDUE 배지
- 상세 페이지에 경고 배너
- Weekly Review 뷰에서 빨간색 경고

미결 항목은 Weekly Decision Review 미팅에서 강제로 닫아야 합니다.

### Q7. 실패 패턴(Failure Pattern)은 어떤 것들이 있나요?

10가지 패턴이 사전 정의되어 있습니다:

| 패턴 | 설명 |
|------|------|
| 전제 가정 붕괴 | 핵심 가정이 실험 중 거짓으로 판명 |
| 수요 부재 | 고객/사용자가 원하지 않음 확인 |
| 기술적 불가능 | 현재 기술로 구현 불가능 |
| 리소스 확보 실패 | 필수 인력/예산/데이터 확보 불가 |
| 규제/정책 장벽 | 법규, 정책 등으로 진행 불가 |
| 시장 타이밍 오류 | 너무 이르거나 늦어서 기회 상실 |
| 경쟁 우위 부족 | 경쟁사 대비 차별화 불가능 |
| 단위 경제성 붕괴 | 비용/수익 구조 불성립 |
| 스코프 과대 | 28일 내 검증 불가능한 규모 |
| 의존성 실패 | 외부 파트너/시스템이 막힘 |

### Q8. 모바일에서도 사용할 수 있나요?

네. 주요 화면은 모바일 반응형으로 구현되어 있습니다:
- 네비게이션: 햄버거 메뉴로 전환
- Weekly Review / Recall Queue: 테이블 대신 카드 레이아웃
- 상세 페이지: 버튼 반응형 배치
- Metrics: 차트 반응형 지원

### Q9. 데이터를 백업하거나 내보낼 수 있나요?

Metrics 페이지(`/metrics`)에서 CSV Export 기능을 사용하세요:
- Discovery 전체 데이터 Export
- 지표 데이터 Export

### Q10. 운영 미팅은 어떻게 진행하나요?

**2개 미팅만 고정**합니다:

1. **Weekly Decision Review (30분)**
   - `/review` 화면을 공유
   - OPEN 항목을 위에서부터 순서대로 검토
   - Owner가 1줄 요약 + 상태 제안
   - Reviewer가 Next/연장만 확인

2. **Monthly Failure Replay (30분)**
   - `/recall` 화면 + DEAD_END 항목 확인
   - Curator가 Dead End 3개 + Revisit 도래 Not Now를 큐레이션
   - Failure Pattern 정제 + Not Now 재결정

---

## 부록: 트리거 유형 (NOT_NOW 결정 시)

| 트리거 유형 | 설명 | 예시 |
|------------|------|------|
| 기술 성숙도 | 특정 기술이 프로덕션 레디가 되면 | WebGPU 브라우저 지원 80% 도달 |
| 정책/규제 | 법규, 사내 정책이 변경되면 | 개인정보보호법 개정 |
| 고객 행동 | 고객의 행동 패턴이 관찰되면 | 월간 활성 사용자 1000명 돌파 |
| 내부 역량 | 팀 구성, 인프라가 갖춰지면 | ML 엔지니어 채용 완료 |
