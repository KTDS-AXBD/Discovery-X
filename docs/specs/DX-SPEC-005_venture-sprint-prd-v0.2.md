# Discovery-X 통합 기획서(업데이트판): Venture Discovery Sprint (AI Agent 주도 + HITL 게이트 + 도메인/토픽 분석)
- 문서 버전: v0.2 (통합 방식 확정 반영)
- 작성일: 2026-02-03
- 대상: Discovery-X 레포/서비스에 “신사업 발굴(Discovery Sprint)”을 **별도 섹션**으로 추가
- 핵심 결정(반영 완료): **Discovery-X에 합치되**,  
  (a) 라우팅/도메인 로직을 **sub-app처럼 분리**하고,  
  (b) 데이터/워커 경계를 **강하게** 두는 방식으로 설계  
- 전제(민감도): 고객명/예산/조달/경쟁사 등 고민감 정보 유입 가능성 **낮음**  
  → **물리 분리(별도 사이트/별도 DB)** 대신, **논리 분리(스키마/경계/권한/워커 격리)**를 강제

---

## 0) 요약(Executive Summary)
Discovery-X에 **Venture Discovery Sprint**(신사업 발굴 스프린트) 기능을 “별도 섹션”으로 추가한다.  
운영은 **AI Agent가 전 과정을 오토파일럿**으로 진행하고, 인간은 **Gate에서만 의사결정(HITL)** 한다.

또한 발굴 과정에서 생성되는 **도메인/주제 분포, 탐색 깊이(Depth), 투입 노력(Effort), 추가 투자 가치(Next-ROI)** 를 계측·시각화하여 “어느 영역을 더 파야 하는지”를 판단할 수 있는 **Analytics 대시보드**를 제공한다.

---

## 1) 통합 방식 결론: “하나의 제품, 두 개의 경계”
### 1.1 왜 합치는가(통합)
- 동일한 사용자군(내부 운영) + 낮은 민감도 전제 → 운영/배포/SSO/권한 재사용이 효율적
- Discovery-X의 철학(관찰→행동→문서→자산화)과 신사업 발굴(신호→문제→기회→의사결정→산출물)이 정합
- 도메인/토픽 통계는 “조직 학습” 관점에서 기존 Discovery 데이터와 함께 축적될 때 가치가 큼

### 1.2 무엇을 강하게 분리하는가(경계)
- **경계 1: 라우팅/도메인 로직**
  - `/venture/*` 프리픽스 하위에 “sub-app”처럼 독립된 IA/UX
  - 도메인 로직은 `app/features/venture/*` 아래로 분리(서비스/레포지토리/타입/정책)
- **경계 2: 데이터**
  - Venture 전용 테이블 prefix(예: `vd_*`)로 논리 분리
  - 이벤트 로그도 `vd_work_events`로 분리(집계/분석 독립성 확보)
- **경계 3: 워커(Agent/Analytics)**
  - 웹앱과 분리된 **전용 워커(venture-worker)** 가 `vd_task_queue`를 소비
  - 장애/부하가 발생해도 코어 웹 UX에 영향 최소화(격리)
  - MVP는 D1 기반 폴링 큐 → 이후 Cloudflare Queues 등으로 확장 가능

---

## 2) 제품 목표 / 성공 지표
### 2.1 목표(Goals)
1) 스프린트(기본: 5일 부트캠프 템플릿)로 **최종 안건 2~3개**와 산출물을 일관되게 생성
2) AI Agent 주도, 인간은 **Gate 의사결정**에만 개입(개입 최소화)
3) 도메인/토픽별 **탐색 분포와 깊이**, **추가 투자 가치**를 수치로 제공

### 2.2 KPI(대리 지표 포함)
- **HITL 비중**: 전체 작업 이벤트 중 인간 개입 이벤트 비율(목표 설정 가능)
- **Gate 리드타임**: Gate Pending → Approved까지 걸린 시간
- **산출물 품질 대리 지표**:
  - Evidence 링크/요약 수
  - Assumption Map 충족률(핵심 5개 가정)
  - Pre-mortem 충족률(실패 5개 + 완화)
- **Analytics 지표**:
  - 도메인 분포(Industry/Function/Tech)
  - 토픽 클러스터 수/크기/깊이
  - White-space(고잠재·저탐색) 영역 개수

---

## 3) IA/라우팅 설계(“sub-app” 방식)
### 3.1 내비게이션 추가
- 좌측(또는 상단) 내비에 **Venture Discovery** 항목 추가

### 3.2 라우트 트리(권장)
- `/venture`
  - `/venture/overview` : 전체 요약(퍼널 + 최근 스프린트)
  - `/venture/sprints` : 스프린트 리스트
  - `/venture/sprints/new` : 스프린트 생성(템플릿 선택)
  - `/venture/sprints/:sprintId`
    - `/inbox` : Signal/Evidence 수집함
    - `/longlist` : 클러스터/카드 뷰
    - `/gate` : Decision Center (HITL)
    - `/deepdive` : Assumption/Pre-mortem/Lean Canvas
    - `/packaging` : 피치/문서 정리 + Export
    - `/analytics` : 해당 스프린트 통계(도메인/토픽/깊이/ROI)
  - `/venture/analytics` : 전체(누적) 통계

> 라우팅 파일 구조(예시, Remix):
- `app/routes/venture._index.tsx`
- `app/routes/venture.overview.tsx`
- `app/routes/venture.sprints._index.tsx`
- `app/routes/venture.sprints.new.tsx`
- `app/routes/venture.sprints.$sprintId._layout.tsx`
- `app/routes/venture.sprints.$sprintId.inbox.tsx` … 등

---

## 4) 도메인 모듈 분리(코드 레벨 “경계”)
### 4.1 디렉토리 구조 제안
- `app/features/venture/`
  - `domain/` : 엔터티/상태머신/정책(Validation, Transition rules)
  - `services/` : 유스케이스(스프린트 생성, Gate 생성, 산출물 생성 요청 등)
  - `repositories/` : DB 접근 레이어(Drizzle/D1)
  - `schemas/` : Zod(또는 동등) 스키마, API 입출력 JSON schema
  - `ui/` : venture 전용 컴포넌트(카드, 클러스터, 결정 카드, 스코어 시트 등)
  - `constants/` : 템플릿/평가 기준/가중치 프리셋
  - `types.ts` : 공용 타입
- `app/features/shared/` : 공통 UI/유틸(기존 코드와 충돌 방지)

### 4.2 “외부에 노출되는 인터페이스” 최소화
- `venture` 모듈의 외부 사용은 `services` 레이어만 호출하도록 제한
- DB 접근은 `repositories`에 캡슐화(직접 쿼리 금지 룰)

---

## 5) 워크플로: 5일 부트캠프 템플릿(시스템화)
> 템플릿은 JSON으로 저장되어 스프린트 생성 시 주입된다.

### 5.1 상태 머신
- `DRAFT` → `RUNNING` → `GATE1_PENDING` → `DEEPDIVE` → `GATE2_PENDING` → `PACKAGING` → `COMPLETED` → `ARCHIVED`

### 5.2 Day-by-day(Agent 오토파일럿 + Gate에서만 HITL)
- **Day 1**: Scope(산업 1~2) 확정 요청(HITL) → Signal/Problem 수집 → Long List v1 생성
- **Day 2**: 카드 정제(누락 필드 탐지/할당) → Gate1 준비(블라인드 점수)
- **Gate 1 (HITL)**: Quick Score 집계/승인 → Shortlist 6~8
- **Day 3**: Deep Dive 자동 생성(Assumption/Pre-mortem/Lean Canvas 초안)
- **Gate 2 (HITL)**: 재평가/토론/재투표 → Final 2~3 확정(+ 보류)
- **Day 5**: Packaging(피치/요약문서) + 리허설(Q&A 레드팀)

---

## 6) HITL: Decision Center 설계(“중요 사항만 결정”)
### 6.1 Decision 타입(필수)
- `SCOPE_SELECT` : 산업 1~2개 확정
- `GATE1_SHORTLIST` : Shortlist(6~8) 승인
- `GATE2_FINAL` : Final(2~3) 승인
- `PUBLISH_APPROVE` : 배포/공유 승인(옵션)

### 6.2 Decision 카드 UI 요구사항
각 Decision은 아래를 **한 화면에서** 제공:
- Agent 추천안(Recommended Option) + 근거 요약
- 대안 옵션 2~3개 + 장단점
- 리스크 플래그(규제/데이터/실행) + 신뢰도(근거 수 기반)
- 투표/점수 입력(블라인드 모드 지원)
- 코멘트 스레드 + “쟁점 3개” 자동 요약

### 6.3 승인 규칙(정책)
- 기본: **블라인드 투표 → 시간박스 토론 → 재투표**
- 최소 승인 조건(예시, 설정 가능):
  - Reviewer 1명 이상 참여
  - 또는 참가자 과반 참여
- 타임아웃/에스컬레이션:
  - 마감 시간이 지나면 Owner에게 알림 + “추천안 자동 채택” 옵션(조직 문화에 맞춰 on/off)

---

## 7) AI Agent/Worker: 강한 경계 설계
### 7.1 실행 경계
- 웹앱(Discovery-X): CRUD, UI, HITL, 로그 기록
- 워커(venture-worker): Agent 실행, 분석 스냅샷 생성, 문서 자동 생성
- 통신: D1(DB) + (선택) 내부 API 엔드포인트

### 7.2 venture-worker 역할
- `vd_task_queue`에서 작업을 가져와 실행하고 결과를 DB에 반영
- 작업 실행 중 `vd_work_events`에 진행 로그 기록
- 실패 시 재시도/백오프(정책 기반)

### 7.3 Task Queue (MVP: D1 폴링)
#### 테이블: `vd_task_queue`
- `id`, `sprint_id`, `type`, `payload_json`, `status`(queued/claimed/succeeded/failed),  
  `claimed_by`, `claimed_at`, `attempt`, `next_run_at`, `error_json`

#### Claim 규칙
- `status=queued AND next_run_at <= now()` 를 `LIMIT N`로 가져와 `claimed`로 변경(낙관적 락)
- 재시도: `attempt < maxAttempts` 이면 `failed → queued`로, `next_run_at`을 backoff로 밀기

> 향후 확장: Cloudflare Queues 도입 시 `vd_task_queue`는 감사/추적용으로만 유지 가능

---

## 8) 데이터 경계(논리 분리): `vd_*` 스키마
### 8.1 핵심 테이블(요약)
- `vd_sprints`
- `vd_sprint_scopes`
- `vd_signals`
- `vd_problems`
- `vd_themes` (토픽/클러스터)
- `vd_opportunities` (기회 카드)
- `vd_evidences`
- `vd_assumptions`
- `vd_premortems`
- `vd_artifacts` (Lean Canvas, 요약 1~2p, Pitch Outline 등)
- `vd_decisions`
- `vd_votes`
- `vd_scores`
- `vd_work_events`
- `vd_analytics_snapshots`
- `vd_task_queue`

### 8.2 “낮은 민감도” 전제의 보안 스펙(그래도 지킬 것)
- 테넌시(조직/팀) 분리는 당장 필수는 아니더라도, **스프린트 단위 ACL**은 필수
- 입력 폼에 기밀 경고 + 비식별 가이드(고객명 직접 입력 방지)
- Evidence URL은 기본 허용(내부 운영), 단 **차단/허용 리스트 옵션**은 Settings로 제공

---

## 9) 도메인/토픽 Analytics(요구사항 상세)
### 9.1 목적
- “어느 도메인/주제를 더 깊게 팠나?”
- “어느 영역에 더 투자(추가 에포트)를 쏟을 가치가 있나?”

### 9.2 분류 체계(2겹)
1) **정적 Taxonomy(사전 정의)**
   - Industry(산업), Function(업무), Tech(기술), Value Chain(밸류체인)
   - 스프린트 생성 시 기본값 선택(필수 일부)
2) **동적 Topic Cluster(탐색 결과 기반)**
   - Signal/Problem/Opportunity 텍스트 기반으로 클러스터링
   - MVP: LLM 기반 라벨링 + 간단 유사도(키워드/TF-IDF)  
   - 고도화: 임베딩 + 벡터 검색(옵션)

### 9.3 “깊이(Depth)” 정의(정량화)
Depth는 “카드 수”가 아니라 **근거·검증·리스크 대비·실행 명확성**을 반영한다.

#### Depth Score(0~100) 제안
- **Evidence Depth (0~40)**  
  - Evidence 개수(정규화) + 출처 다양성(도메인 수) + 요약 품질(필드 충족)
- **Assumption Coverage (0~25)**  
  - 핵심 가정 5개 충족률 + 검증 계획(Validation plan) 유무
- **Risk Readiness (0~15)**  
  - Pre-mortem 5개 + 완화책 존재/구체성
- **Execution Clarity (0~20)**  
  - 구매주체/예산 가설/채널/90일 실행 항목의 명확성

> 구현 팁: 각 항목은 “필드 충족 여부”를 0/1로 계산해도 MVP 품질이 나옴(정교화는 이후)

### 9.4 “노력(Effort)” 정의(사람+AI)
노력은 Work Event 기반으로 계산한다.

#### Human Effort Score(예시 가중치)
- Signal 작성 1
- Evidence 추가 2
- Opportunity 카드 수정 3
- Assumption 보완 3
- Lean Canvas 확정 8
- 투표/점수 1
- 코멘트 1

#### Agent Effort
- 생성한 산출물/요약/클러스터링 작업 수(또는 런타임/토큰 비용)

### 9.5 “추가 투자 가치(Next-ROI)” 추천
추천은 3변수로 계산한다.
- **Potential**: 평가 기준(기술리더십/브랜딩) 점수 기반
- **Confidence**: Evidence/가정 검증/리스크 대비 기반
- **Unknowns**: 미해결 가정/누락 필드 수(구매/예산/데이터 접근 등)

#### 추천 카테고리
- **INVEST**: Potential 높고, Unknowns가 “해결 가능한 형태”이며 Effort 대비 기대가 큼
- **EXPLORE**: Potential 중간, Effort 낮음(아직 얕으니 조금 더 보자)
- **HOLD**: Potential은 있으나 Unknowns가 구조적(막힐 가능성 큼)
- **DROP**: Potential 낮고 Effort 높음(이미 봤고 매력 낮음)

### 9.6 대시보드 요구사항(화면/위젯)
- **Funnel**: Signal → Problem → Opportunity → Shortlist → Final
- **Domain Treemap**: Industry/Function/Tech별 Depth/Effort 합
- **Cluster Table**: 클러스터별 카드 수, 평균 Depth, 평균 Potential, Unknowns
- **Effort vs Potential Scatter**: X=Effort, Y=Potential, Size=Unknowns, Color=추천(Invest/Hold/…)
- **White-space 리스트**: Potential 상위인데 Effort 하위인 영역 Top N
- **Bottleneck**: Decision pending 시간, Task 실패율/재시도율

### 9.7 스냅샷/집계 파이프라인
- `vd_analytics_snapshots`에 스프린트별/전체별 스냅샷 저장
- 트리거:
  - (1) 주요 이벤트(게이트 승인, Final 확정) 시 자동 생성
  - (2) 수동 “Recompute” 버튼
  - (3) (옵션) 일정 주기 크론(일 1회)

---

## 10) UI/UX 상세(화면별 요구사항)
### 10.1 Sprint 생성(`/venture/sprints/new`)
- 템플릿 선택: `Bootcamp-5D` (기본)
- 산업 1~2개 선택 + 구매주체 템플릿 입력(필수)
- 평가 기준 프리셋: `TechLeadership_Branding` (기본)
- 참여자 초대(권한: Contributor/Reviewer)

### 10.2 Inbox(`/venture/sprints/:id/inbox`)
- Signal 입력 폼(출처 링크, 요약, 태그)
- Evidence 업로드/링크(문서/URL)
- Agent가 자동:
  - 중복 후보 경고
  - 태그 추천
  - Problem 문장화 제안

### 10.3 Long List(`/longlist`)
- 클러스터 뷰/카드 뷰 토글
- 카드 누락 필드 뱃지(구매주체/예산/왜지금/우위/리스크)
- “Agent 추천 수정안(diff)” 승인/거절

### 10.4 Gate Center(`/gate`)
- Pending Decision 리스트
- Decision 상세(추천/대안/근거/리스크/투표)
- 블라인드 모드 지원 + 재투표 플로우

### 10.5 Deep Dive(`/deepdive`)
- 후보별 Assumption Map, Pre-mortem, Lean Canvas 편집
- “근거(Evidence) 연결” UI(드래그/선택)

### 10.6 Packaging(`/packaging`)
- Pitch Outline(5~7장) 자동 생성/편집
- Lean Canvas/요약 1~2p Export(MD/PDF 옵션)
- Q&A 레드팀(예상 질문 10개 생성 + 답변 초안)

### 10.7 Analytics(`/analytics`)
- 위젯(9.6) 제공
- “추천(Invest/Hold/Drop/Explore)” 리스트 + 액션 버튼(추가 조사 Task 생성)

---

## 11) API/인터페이스(Worker ↔ Web)
> Remix loader/action 기반으로도 구현 가능하지만, 워커 경계를 강하게 두려면 **JSON 엔드포인트**를 최소 세트로 제공하는 것을 권장.

### 11.1 내부 API(권장 최소 세트)
- `POST /venture/api/tasks/claim`
  - input: `{ workerId, limit }`
  - output: `{ tasks: Task[] }`
- `POST /venture/api/tasks/report`
  - input: `{ taskId, status, resultJson, errorJson? }`
- `POST /venture/api/decisions/propose`
  - input: `{ sprintId, type, optionsJson, recommendedOption, rationaleMd, riskFlags }`
- `POST /venture/api/analytics/recompute`
  - input: `{ sprintId? }`
  - output: `{ snapshotId }`

### 11.2 Task Payload 스키마(예시)
- `VD_TASK_CLUSTER_SIGNALS`
  - `{ sprintId, sourceEntityIds: string[] }`
- `VD_TASK_GENERATE_OPPORTUNITIES`
  - `{ sprintId, problemIds: string[] }`
- `VD_TASK_PREPARE_GATE1`
  - `{ sprintId }`
- `VD_TASK_DEEPDIVE_PACK`
  - `{ sprintId, opportunityIds: string[] }`
- `VD_TASK_PREPARE_GATE2`
  - `{ sprintId }`
- `VD_TASK_BUILD_PACKAGING`
  - `{ sprintId, finalOpportunityIds: string[] }`
- `VD_TASK_ANALYTICS_SNAPSHOT`
  - `{ sprintId? }`

---

## 12) LLM 출력 품질/안전장치(운영 현실성)
### 12.1 JSON 스키마 강제
- 카드/결정/클러스터/요약은 **schema-first**로 생성
- 스키마 미준수 시 자동 재시도(최대 N회) + 실패 로그

### 12.2 근거 추적 가능성
- 모든 Agent 생성물은:
  - `created_by_agent=true`
  - `prompt_version`
  - `evidence_refs[]` (가능하면)
  - `confidence_score`(근거 수 기반)
를 기록

### 12.3 금지 입력 가이드(민감도 낮아도)
- 입력 폼에 “고객 실명/예산/조달 상세/경쟁사 실명”은 가급적 피하도록 안내
- 들어오면 Agent가 자동으로 “범주화/비식별” 제안(자동 치환은 옵션)

---

## 13) 구현 단계(티켓화 가능한 수준)
### Phase 1 (MVP: 스프린트 운영 + Gate + 기본 통계)
1) `/venture/*` 라우팅 + 기본 UI shell
2) `vd_*` 핵심 테이블 + 마이그레이션(스프린트/카드/결정/이벤트/태스크)
3) Decision Center(블라인드 투표/집계/재투표)
4) venture-worker 기본 골격 + `vd_task_queue` 폴링 실행
5) Analytics v0: 퍼널 + 도메인 태그 분포 + 이벤트 기반 Effort

### Phase 2 (Depth/ROI 추천 + Deep Dive 자동화 강화)
1) Depth Score 계산 + 누락 필드 탐지 강화
2) Potential/Confidence/Unknowns 기반 추천(Invest/Hold/Drop/Explore)
3) Deep Dive 산출물(Assumption/Pre-mortem/Lean Canvas) 자동 생성/편집 UX

### Phase 3 (클러스터링 고도화 + 벡터/유사도 검색 옵션)
1) 임베딩 기반 클러스터링/유사도 탐색(옵션)
2) Evidence 검색/추천(RAG) + 품질 점수
3) 조직 자산화(종료 시 아카이브/템플릿화)

---

## 14) 오픈 이슈(결정 필요하지만 HITL 최소화 원칙을 해치지 않는 것)
- LLM Provider 선택/키 관리(조직 정책)
- “자동 채택(Timeout)” 정책 on/off
- 도메인 Taxonomy 초기 버전(Industry/Function/Tech 목록) — 운영 중 점진 확장
- 블라인드 투표 익명성 수준(완전 익명 vs 관리자에게만 공개)

---

## 15) 부록 A — 평가 기준 프리셋(Tech Leadership / Branding 중심)
> 스프린트 생성 시 기본으로 로드

- 기술 리더십/차별화 (20)
- 전략 적합성 (15)
- 브랜딩/대외 메시지 임팩트 (10)
- 플랫폼화/재사용성 (15)
- Pain 본질성 (15)
- 접근성/레퍼런스 현실성 (10)
- 옵션 가치(중장기) (10)
- 리스크(규제/데이터/실행) (5)

Kill Criteria(자동 플래그):
- 구매주체/예산 가설이 끝까지 비어 있음
- “우리가 이길 이유”가 근거 없이 주장뿐임
- 데이터 접근 불가/규제 장벽이 구조적임

---

## 16) 부록 B — Work Event 표준(Analytics의 기반)
모든 중요한 행동은 이벤트로 기록한다.
- actor_type: `user | agent`
- entity_type: `sprint | signal | problem | theme | opportunity | decision | artifact | evidence`
- action_type 예시:
  - `create`, `update`, `comment`, `vote`, `score`, `approve`, `reject`,
  - `task_enqueued`, `task_claimed`, `task_succeeded`, `task_failed`,
  - `analytics_computed`

---

## 17) 산출물(문서) 위치 제안
- `docs/Venture_Discovery_Sprint_PRD_v0.2.md` (본 문서)
- `docs/Venture_Discovery_Sprint_User_Guide_1p.md` (운영용 1페이지)
- `docs/Venture_Discovery_Sprint_Runbook.md` (운영 런북: Gate 운영/장애 대응)

---
