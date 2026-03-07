# Discovery‑X 최종 기획서 (v1.4 – Prototype‑first, 30~60일 운영 실험)

> v1.3의 뾰족함(내부 실험 + 근거 문서 루프)과 3대 실행 리스크 봉인(Owner/Time‑box/Recall)은 유지합니다.
> 
> 이번 v1.4는 객관 검토 의견을 반영해 **Prototype을 ‘제품’이 아니라 ‘운영 실험용 시스템’**으로 명시하고,
> **누가·언제·얼마나 버텨야 하는지(30~60일, 소수 정예, 닫힘 중심)**를 더 선명하게 고정합니다.
>
> (작성일: 2026-01-29, KST)

---

## 0. 업데이트 요약 (What Changed)

### 0.1 이번 업데이트의 핵심 10가지
1. **확신을 줄이고 검증력을 강화** (기존 유지)
2. 외부 환경 프레임을 **PASTEL → PESTEL**로 정규화 (v1.2)
3. **Seed Inbox(임시) + 승격 규칙**으로 “행동 없으면 저장 불가”의 부작용을 제거 (v1.2)
4. 4종 검증 잣대의 **운영형 정의(1줄)** 추가 (v1.2)
5. **Discovery Owner(단일 책임자) 제도** 도입 (v1.3)
6. **Time‑box / Stop rules** 추가: Discovery 최대 4주, Experiment 최대 2회 (v1.3)
7. **실패 자산 재호출(Recall) 규칙** 구체화: Not Now Trigger/Date, Dead End Failure Pattern (v1.3)
8. **Prototype 전제 명시**: “완성 플랫폼”이 아니라 **30~60일간 돌려보고 깨뜨릴 운영 실험**
9. **운영 시작 조건(Go 조건) 고정**: 사용자≤5, Discovery 5~10건, 미팅 2개, 강제 사용 ❌
10. **Prototype 성공 기준의 우선순위 재정렬**: ‘정성’보다 먼저 **“닫힌 Discovery가 실제로 나왔는가”**

👉 결론: **지금 개발 GO(조건부)**. 단, “전사 플랫폼”이 아니라 “운영 실험”으로 시작한다.

---

## 1. Prototype 운영 전제 (이 문서의 가장 중요한 단서)

Discovery‑X v1 Prototype은 **서비스/플랫폼 구축이 아니라**, 아래 전제에서만 유효하다.

- **기간**: 30~60일 운영 실험(종료 시점에 *Go/Pivot/Stop* 결정)
- **사용자**: 최대 5명(모두 Owner 역할 수행 가능자)
- **목표 Discovery 수**: 5~10건(많을수록 ❌, “닫힘”이 목표)
- **운영 미팅**: 2개만 고정
  - Weekly Decision Review (30분)
  - Monthly Failure Replay (30분)
- **강제 사용 ❌**: 쓰기 싫으면 안 써도 됨
  - 단, **쓰는 사람은 끝까지 쓰게 함(Owner/Time‑box/Decision 규칙 준수)**

> 이 전제를 깨고 “완성형 UX/전사 포털”로 시작하면, v1은 실패 확률이 높다.

---

## 2. 토론 프레임 적용 결과 요약

### 2.1 Six Thinking Hats 적용 결과 (20+ Round 통합)

| Hat | 반복 쟁점 | 최종 반영 내용 |
|---|---|---|
| White (사실) | 근거가 애매하다 | 모든 판단은 Evidence 유형 태깅 의무화 |
| Red (직관) | 느낌/흥미는 중요 | 직관은 허용하되, **행동 없으면 ‘Inbox(임시)’에만 저장** |
| Black (위험) | 갈라파고스/과몰입 | 외부·타 관점 강제 삽입 구조 |
| Yellow (기회) | 조직 자산화 가능성 | 실패 로그를 재사용 자산으로 정의 |
| Green (창의) | 너무 틀에 갇힘 | 관점 병렬, 실험 자유도 확보 |
| Blue (관리) | 복잡해질 위험 | v1 뾰족함 1개로 제한 + **Owner/Time‑box로 운영 난이도 제어** |

### 2.2 PESTEL 적용 결과 요약 (외부 환경 내재화)

| 요소 | 주요 리스크 | Discovery‑X 반영 |
|---|---|---|
| Political | 정책/규제 변동 | **시점·환경 태그 필수** |
| Economic | ROI 불확실 | 내부 실험을 비용 0에 가깝게 설계 |
| Social | 조직 저항 | 강제 사용 ❌, 행동하면 이득 구조 |
| Technological | 기술 과대평가 | 유사 실패 사례/Dead End 자동 호출 |
| Environmental | 지속성 | 지식 누적·재사용 구조 |
| Legal | 책임 문제 | 판단 근거·결정 이력 자동 기록 |

---

## 3. 시스템 개요 (Refined Overview)

### 3.1 최종 정의
Discovery‑X는  
AX 신사업을 위해 **관찰을 행동으로 밀어내고**, 행동을 **근거 있는 문서**로 남기며,  
그 문서를 다시 조직의 **사고 자산**으로 축적하는 **내부 실험 중심 사고 시스템**이다.

정답을 찾지 않는다.  
대신, **언제까지 무엇을 해보면 되겠는지**를 남긴다.

---

## 4. 시스템 목적 (Debate‑Adjusted)

### 4.1 목적 재정의
- 미래 예측 ❌  
- 아이디어 자동 생성 ❌  

👉 목적은 단 하나

**“조직이 틀릴 수 있는 방식의 품질을 높이는 것”**

---

## 5. 핵심 설계 원칙 (최종)

- **따로 또 같이**  
  - 관점은 병렬, 수렴은 현실에서
- **틀린 게 아니라 다른 것**  
  - 설득 ❌ / 객관화 ⭕
- **관찰은 시작, 행동이 완결**
- **행동 없는 통찰은 ‘자산’이 아니다**  
  - 단, 놓치지 않기 위해 **Inbox(임시) 저장은 허용**  
  - *조직 자산(검색/재사용)으로의 승격은 내부 실험 이후*
- **Single‑Threaded Ownership**  
  - Discovery 단위 **Owner 1명**이 끝까지 책임 (실험·문서·결정)
- **Time‑boxed Discovery**  
  - 깊이를 늘리는 시스템이지 **무한 탐구 시스템이 아니다**  
  - 2회 실험 또는 4주 내 **결정으로 종료**
- **의도된 ‘인지 부하’를 줄이지 않는다**  
  - Discovery‑X는 “쉽게” 만드는 UX가 목표가 아니라, **행동과 결정을 강제하는 구조**가 목표
  - 대신, **운영 가이드/코칭**으로 초기 진입 비용을 낮춘다
- **하나의 뾰족함에 집중한다**  
  - v1은 “내부 실험 + 근거 문서 루프”에만 집중

---

## 6. 시스템 구조 (v1 단순화)

```text
[Seed Inbox (Temporary)]
 └ 기사 / 이슈 / 관찰 / 내부 Pain
 └ Owner: 기본은 등록자(변경 가능), '미지정' 상태로는 승격 불가
 └ TTL 권장: 7일 (미처리 시 자동 리마인드 → 만료)

      ↓ (승격 조건: Internal Experiment 1개 등록)

[Context Expansion]
 └ Why / Now / Context / Similar

      ↓

[Parallel Lenses]
 └ 기술 / 시장 / 조직 / 시간 / 실패(유사 실패/Dead End)

      ↓  (최대 2회)

[Internal Experiment]
 └ 최소 행동 실행 (D+2 기본 / 최대 D+7)

      ↓

[Evidence Documentation]
 └ 근거 중심 문서(표준 포맷)

      ↓ (최대 4주 내 종료)

[State Decision]
 └ Next / Not Now / Dead End
 └ Decision은 Owner가 기록, Next는 Reviewer 1명 확인(권장)
```

### 6.1 Discovery Owner (단일 책임자) — 필수 운영 규칙
**정의**: Discovery 단위로 **Owner 1명**을 지정하며, Owner는 해당 Discovery를 *끝까지* 닫는다.

- **Owner 기본값**: Seed 등록자(변경 가능)
- **Owner의 책임 범위(필수)**  
  1) 최소 1회 내부 실험 수행(또는 명시적 Not Now/Dead End 결정)  
  2) Evidence 문서 업데이트(표준 포맷)  
  3) State Decision(Next/Not Now/Dead End) 기록 및 종료
- **협업은 가능하나, 책임은 분산하지 않는다**  
  - A가 Seed를 넣고 B가 실험을 해도, **Owner는 항상 1명**  
  - 실험/작성자 필드는 별도로 기록하되, *의사결정 책임은 Owner에게 귀속*
- **Owner 변경(승계) 규칙**  
  - 인수인계 1줄(“무엇까지 했고, 다음 결정은 무엇인지”)을 남기고 Owner를 변경  
  - Owner 공백 상태는 허용하지 않는다

### 6.2 Time‑box / Stop rules (버티기 규칙)
- **Discovery 1건 = 최대 4주**  
  - 4주가 되면 반드시 **Next/Not Now/Dead End 중 하나로 종료**
- **Internal Experiment = 최대 2회**  
  - 2회 수행 후에도 결정을 못 하면, *결정이 아니라 “연장 승인 요청”* 상태로 간주  
  - 연장은 **Reviewer(또는 팀장) 1명 승인**이 있어야만 가능(권장)
- **주간 1회 Decision Review에서 미결을 강제로 닫는다**  
  - “결정 미룸” 자체가 리스크이므로, 미결은 시스템적으로 노출/정리한다

### 6.3 최소 운영 역할(RACI Lite)
- **Discovery Owner (R)**: 실험·문서·Decision까지 책임(단일 책임자)
- **Reviewer / Gatekeeper (A)**: Next(전진)와 Time‑box 연장 같은 **리소스 커밋이 필요한 결정**을 1명 확인/승인
- **Curator / Ops (C)**: Inbox TTL 정리, Not Now 재검토 큐 운영, Failure Pattern 품질 관리, 최소 지표 집계

> 원칙: “누구나 입력할 수 있지만, **Owner만이 닫을 수 있다**.”

---

## 7. 주요 기능 (최종 정제)

### 7.1 Seed & 맥락 확장
- Seed는 아이디어가 아닌 **관찰 출발점**
- *Inbox(임시)*로 먼저 모으고, 내부 실험이 생기면 검증 트랙으로 승격

**시스템 질문**
- 왜 지금?
- 어떤 맥락?
- 무엇이 바뀌나?

### 7.2 병렬 관점 (갈라파고스 방지)
- Agent/동료 관점 자동 삽입
- 합의 금지 / 병렬 유지

### 7.3 비판적 검증 (객관적 잣대 4종) — 운영 정의 포함
- **Evidence Check**: 주요 주장/판단마다 **Evidence 태그**가 붙어 있는가? (없는 문장은 “가정”으로 강등)
- **Time Stress Test**: 이 판단이 **3개월 뒤**에도 유효한가? 무효가 되는 **트리거(조건)**는 무엇인가?
- **Cross‑Context Test**: 다른 조직/시장/규제 조건에서도 성립하는가? (성립 범위를 “조건”으로 명시)
- **Ontology Consistency**: 필수 관계(Seed‑Experiment‑Evidence‑Decision)가 **완결**되었는가? (누락 시 반려)

### 7.4 내부 실험 (v1의 핵심)
반드시 포함:
- 실험 가설
- 최소 행동
- 기한

PoC ❌ / 프로젝트 ❌  
👉 **생각을 깨는 행동 ⭕**

### 7.5 근거 문서 (표준 포맷 고정)
고정 포맷:
- Why now
- Hypothesis
- Action
- Evidence
- Interpretation
- State Decision

👉 결론이 아니라 **판단 경로**를 저장

### 7.6 운영 리듬 (미팅 2개로만 운영)
- **Weekly Decision Review (30분)**  
  - 대상: Open Discovery(미결) 전부  
  - 방식: **Owner가 1줄 요약 + 다음 상태 제안** → **Reviewer가 Next/연장만 확인** → Curator가 상태/기한 반영
- **Monthly Failure Replay (30분)**  
  - Curator가 Dead End 3개 + Revisit 도래 Not Now를 큐레이션  
  - 결과물: Failure Pattern 정제(태그/요약/근거 링크) + Not Now 재결정(Next/Dead End/Not Now 갱신)

### 7.7 온보딩/코칭 (의도된 리스크를 “운영”으로 흡수)
사용자 인지 부하는 v1에서 정상이다. 대신 아래를 **운영 장치**로 둔다.

- **Kickoff 60분(1회)**: 템플릿/규칙/예시 2건을 같이 입력해 “감”을 맞춘다.
- **초기 코칭 2회(각 30분)**: 첫 2주 동안 Owner의 작성물을 같이 리뷰해 품질 바닥을 올린다.
- **1장 치트시트**: Evidence 타입/강도, Not Now 트리거, Failure Pattern 예시만 압축해 배포한다.

---

## 8. 시간·맥락 관리 (PESTEL 내재화 + Recall 규칙)

모든 기록에:
- 시점
- 환경 조건
- 유효성 태그(PESTEL 관점 포함)

“지금은 안 됐지만, **언제 다시 볼 수 있는지**” 명시  
(= Not Now 상태는 *재검토 트리거/날짜*가 없으면 허용되지 않는다)

### 8.1 Not Now는 Trigger Type을 강제한다
Not Now 기록에는 아래를 **필수**로 포함한다.

- **Trigger Type (필수, 1개 이상 선택)**  
  1) 기술 성숙(Technology Maturity)  
  2) 정책/규제 변화(Policy/Regulation)  
  3) 고객 행동/구매 조건 변화(Customer Behavior)  
  4) 내부 역량/자산 변화(Internal Capability)
- **Trigger Condition (1줄)**: “무엇이 바뀌면 다시 본다”  
- **Revisit Date (필수)**: 언제 다시 본다(예: 30/60/90일)

### 8.2 Dead End는 Failure Pattern으로만 살아남는다
Dead End 저장 시 필수:
- **Failure Pattern 태그(1~3개)**
- “왜 안 됐는지” 1줄(증거 기반)

Failure Pattern 예시(권장):
- 예산/오너 부재, 스위칭 코스트 과대, 데이터 접근 불가, 보안/법무 리스크, 운영 책임 불명확, 긴급도 부족, 대체재 우위

### 8.3 실패/보류의 재호출(Recall)은 3가지로 발생한다
1. **검색/유사도 기반 호출**: 새 Seed 입력 시, 유사한 Not Now/Dead End를 상위 N개 제안
2. **기한 기반 호출**: Revisit Date 도래 시, 자동으로 Review 큐로 올라옴
3. **운영 리듬 기반 호출**: Monthly Failure Replay에서 강제로 “재사용 가능한 형태”로 정제

---

## 9. v1 Prototype 범위

### 9.1 반드시 포함
- 내부 실험 + 근거 문서 루프
- 상태 관리(Next/Not Now/Dead End)
- 판단 이력 조회
- **Owner 필드 + Time‑box(4주/2회) 강제**
- **Not Now Trigger Type + Revisit Date 필수**
- **Failure Pattern 태깅 + 재호출 큐(최소 기능)**

### 9.2 의도적 제외
- 고급 예측
- KPI 대시보드(제품 수준)
- 외부 고객 연동

> 단, v1 성공 여부 판단을 위한 **최소 운영 지표**는 수집한다(10장).

### 9.3 Prototype 개발 GO 조건 (운영 실험이 ‘맞게’ 시작되기 위한 조건)
- **사용자 5명 이내**(전원 Owner 수행 가능자)
- **Discovery 5~10건만 목표**(닫힌 Discovery가 목표)
- **운영 미팅 2개만 고정**
- **강제 사용 ❌** (옵션)
- **성공 기준은 단 하나**: “생각만 하다 끝났을 일을, 실제로 하나라도 ‘닫아봤는가’”

---

## 10. v1 성공 기준 (Prototype에서 필요한 ‘거친’ 지표)

### 10.1 성공 기준(최우선, 단 하나)
**이 시스템 덕분에 ‘닫힌 Discovery’(Next/Not Now/Dead End)가 최소 1건 이상 나왔는가?**

> “닫힘”이 없으면 문서/로그는 늘어도 시스템은 작동하지 않는다.

### 10.2 최소 운영 지표(권장)
- **Seed → Experiment 전환율**: Inbox Seed 중 실험으로 승격된 비율
- **Experiment 완료율**: 시작한 실험 중 기한 내 Evidence가 남은 비율
- **Decision 종료율(리드타임)**  
  - 14일 내 종료 비율  
  - 28일(4주) 내 종료 비율
- **Dead End 종료 비율**: “깔끔한 중단”이 실제로 발생하는지
- **재호출 지표**  
  - 30일 내 Not Now 재검토 수행 건수  
  - 30일 후 Failure Pattern 재사용(링크) 건수

### 10.3 v1에서의 합리적 목표치(초기 가이드)
- **28일 내 Decision 종료율 ≥ 90%** (나머지는 ‘연장 승인’으로 예외 관리)
- **Experiment 완료율 ≥ 80%**
- **재호출 이벤트가 월 1회 이상 발생**

### 10.4 30~60일 종료 시 의사결정(Prototype 종료 Gate)
- **GO(확대)**: 닫힘이 안정적으로 발생 + 재호출 1회 이상 + Owner/Time‑box 규칙이 ‘버팀’
- **PIVOT(수정)**: 닫힘은 있으나 인지부하/운영마찰이 과도 → 템플릿/규칙/자동화만 조정
- **STOP(중단)**: 닫힘이 거의 없음(결정 회피) 또는 Owner/Time‑box가 무력화

---

## 11. 기대 효과 (현실 검증 기준)

### 11.1 개인
- 생각이 행동으로 이어짐
- 혼자 갇히지 않음

### 11.2 조직
- AX 신사업 사고의 재현성
- 실패의 자산화(= Dead End/Not Now의 재호출)

### 11.3 장기
- 시간이 쌓일수록 판단 품질 상승

---

## 12. 최종 한 문장

### 12.1 Board Level
Discovery‑X는  
AI로 답을 주는 시스템이 아니라,  
**S0~S2 단계에서 관찰을 내부 실험으로 밀어** 조직이 더 잘 틀리고 더 빨리 배우게 만드는  
AX 신사업용 사고·행동 인프라이다.

### 12.2 Prototype Level(30~60일 운영 실험용)
Discovery‑X v1 Prototype은 **완성 플랫폼이 아니라**,  
소수(≤5명)가 30~60일 동안 **관찰→실험→근거→결정**을 강제로 닫아보며  
“이 시스템이 실제로 조직에서 버티는가”를 검증하는 **운영 실험 도구**다.
