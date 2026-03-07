---
code: DX-SPEC-002
title: Discovery-X 프로토타입 PRD
version: 0.1
status: Active
category: SPEC
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
system-version: ">=1.0"
---

# Discovery‑X v1 Prototype PRD & 개발계획서 (v0.1)

- 문서 목적: **30~60일 운영 실험용 Discovery‑X Prototype**을 실제로 개발/운영하기 위한 요구사항(PRD) + 개발 계획을 한 문서로 고정
- 전제: Prototype은 ‘제품’이 아니라 **운영 실험용 내부 도구**다(소수 정예, 실패 전제, 빠른 학습).
- 기준 문서: Discovery‑X 기획서 v1.4 (Prototype‑first)
- 작성일: 2026-01-29 (KST)

---

## 1. 배경/문제 정의

### 1.1 왜 필요한가
AX 신사업 발굴 과정에서 “관찰/아이디어”는 많지만, 다음이 반복된다.
- 관찰이 행동으로 안 이어지고(실험 부재)
- 근거가 축적되지 않으며
- 최종 판단(Next/Not Now/Dead End)이 안 닫힌다(결정 회피)

Discovery‑X는 **관찰→내부 실험→근거→결정**을 강제로 닫게 하여, 조직이 “더 잘 틀리고 더 빨리 배우는” 루프를 만든다.

### 1.2 Prototype의 한 줄 목표
**“생각만 하다 끝났을 일을, 실제로 하나라도 ‘닫아보는’ 운영 루프를 30~60일 안에 증명한다.”**

---

## 2. 목표/비목표

### 2.1 제품 목표(Goals)
Prototype에서 반드시 달성해야 하는 목표는 4개다.
1. **닫힘(Closure)**: Next/Not Now/Dead End로 상태를 실제로 닫을 수 있어야 한다.
2. **책임(Owner)**: Discovery 단위 단일 Owner가 실험·문서·결정을 끝까지 책임지게 해야 한다.
3. **기한(Time‑box)**: 4주/2회 실험 상한이 시스템 규칙으로 작동해야 한다.
4. **재호출(Recall)**: Not Now/Dead End가 ‘다시 불리는’ 최소 메커니즘(기한 큐/검색/리뷰)을 제공해야 한다.

### 2.2 비목표(Non‑Goals)
Prototype에서 의도적으로 하지 않는다.
- “전사 공식 포털/플랫폼” 구축 ❌
- 완성형 UX(마찰 제거) ❌  
  - 필수 인지부하는 설계의 일부이며, **운영/코칭**으로 흡수한다.
- 외부 고객/CRM/계약/견적 연동 ❌
- 고급 예측/추천 모델 ❌
- 제품 수준 KPI 대시보드 ❌ (단, 운영 실험 판단을 위한 최소 지표는 수집)

---

## 3. 운영 실험 설계(가장 중요)

### 3.1 운영 실험 파라미터(고정)
- **기간**: 30~60일
- **사용자**: 최대 5명(전원 Owner 수행 가능)
- **Discovery 목표**: 5~10건(볼륨이 아니라 “닫힘”)
- **미팅**: 2개만 고정
  - Weekly Decision Review (30분)
  - Monthly Failure Replay (30분)
- **강제 사용**: ❌ (옵트인)
  - 단, 참여자는 규칙(Owner/Time‑box/Decision)을 준수해야 한다.

### 3.2 초기 리스크와 대응(운영 장치)
- **인지부하(귀찮음)**: 정상 → Kickoff + 코칭 2회 + 치트시트로 흡수
- **조직 문화 저항**: 정상 → 소수 정예로만 운영(전사 확산 금지)
- **좋은 Seed 부족(초기 2~3주)**: 정상 → Curator가 “시드 시딩(seed seeding)” 5개 준비(주 1개 공급)

---

## 4. 사용자/역할(권한)

### 4.1 사용자 페르소나
- **Owner(필수)**: Discovery를 끝까지 닫는 사람(실험·근거·결정)
- **Reviewer/Gatekeeper(권장)**: Next(전진)·연장 승인 등 리소스 커밋에 1명 확인/승인
- **Curator/Ops(권장)**: Inbox TTL, Not Now 재검토 큐, Failure Pattern 품질관리, 최소 지표 집계
- **Viewer(옵션)**: 읽기 전용(참고/학습)

### 4.2 권한 원칙(RBAC Lite)
- 누구나 Seed(Inbox)는 입력 가능(옵션)
- **Owner만 상태를 ‘닫을’ 수 있음(Decision 기록)**
- Reviewer는 **Next/연장 승인** 권한(또는 승인 코멘트) 보유
- Curator는 TTL/태그/큐 관리 권한 보유

---

## 5. 핵심 객체/데이터 모델(Schema v0)

> Prototype에서는 “테이블 3개 + 이벤트 로그 1개”로 끝낸다.

### 5.1 Entity 1) Discovery (메인 레코드)
- `discovery_id` (UUID)
- `title` (필수, 80자)
- `seed_summary` (필수, 400자)
- `seed_links` (0..N)
- `source_type` (article/issue/internal_pain/meeting_note/other)
- `owner` (필수, 1명)
- `reviewer` (선택, 1명)
- `created_at` / `updated_at`
- `due_date` (필수: created_at + 28일 기본)
- `status` (INBOX | OPEN | NEXT | NOT_NOW | DEAD_END | EXTENSION_REQUESTED)
- `pestel_tags` (0..N)
- `parallel_lenses_notes` (선택: 기술/시장/조직/시간/실패 관점 요약)
- `decision` (status가 NEXT/NOT_NOW/DEAD_END일 때 필수)
  - `decision_state`
  - `decision_rationale` (필수, 400자)
  - `decided_at`
- `not_now_trigger` (status=NOT_NOW일 때 필수)
  - `trigger_type` (Technology Maturity | Policy/Regulation | Customer Behavior | Internal Capability)
  - `trigger_condition` (필수, 200자)
  - `revisit_date` (필수)
- `dead_end_failure_pattern` (status=DEAD_END일 때 필수)
  - `pattern_tags` (필수, 1..3)
  - `evidence_based_reason` (필수, 200자)

**시스템 규칙(Validation)**
- `owner` 없으면 OPEN/NEXT/NOT_NOW/DEAD_END로 전환 불가
- `status`가 OPEN이 되는 순간 `due_date` 자동 설정(28일)
- 28일 경과 시 `status`가 OPEN이면 **Review 큐에 강제 노출**
- NOT_NOW는 `trigger_type + revisit_date` 없으면 저장 불가
- DEAD_END는 `pattern_tags` 없으면 저장 불가

### 5.2 Entity 2) Experiment (최대 2개)
- `experiment_id` (UUID)
- `discovery_id` (FK)
- `hypothesis` (필수, 200자)
- `minimal_action` (필수, 200자)
- `deadline` (필수, 기본 D+2 / 최대 D+7)
- `expected_evidence` (필수, 200자)
- `result_summary` (선택, 400자)
- `completed_at` (선택)

**시스템 규칙**
- Discovery 당 Experiment는 **최대 2개**
- 2개 초과 추가 시 `EXTENSION_REQUESTED`로 전환하고 Reviewer 승인 필요(권장)

### 5.3 Entity 3) Evidence (0..N)
- `evidence_id` (UUID)
- `discovery_id` (FK)
- `experiment_id` (선택 FK)
- `type` (DATA | USER | ARTIFACT | REF | ASSUMPTION)
- `strength` (A Hard | B Direct | C Indirect | D Intuition)
- `content` (요약 400자)
- `link_or_attachment` (0..1)
- `created_at`

**시스템 규칙**
- D(Intuition) 단독으로 NEXT 결정 불가(최소 A/B 2개 필요 – 기획서 기준)

### 5.4 Entity 4) Event Log (감사/지표)
- `event_id`, `timestamp`, `actor`, `discovery_id`
- `event_type` (CREATE_SEED, PROMOTE_OPEN, ADD_EXPERIMENT, COMPLETE_EXPERIMENT, ADD_EVIDENCE, DECIDE_NEXT, DECIDE_NOT_NOW, DECIDE_DEAD_END, REQUEST_EXTENSION, APPROVE_EXTENSION, REVISIT_TRIGGERED …)

---

## 6. 핵심 사용자 플로우(UX/Workflow)

> UX의 목적은 “쉬움”이 아니라 **규칙을 어기지 않고 끝까지 닫게 하는 것**이다.

### 6.1 Flow A — Seed Inbox 입력(5분)
1) Seed 제목/요약/링크 입력
2) (기본값) Owner=등록자
3) 상태=INBOX 저장

**수용 기준(AC)**
- 1분 내 입력 가능
- INBOX는 7일 TTL(리마인드 후 만료)

### 6.2 Flow B — 실험으로 승격(OPEN)
1) Owner 지정(필수)
2) Experiment 1개 등록(가설/행동/기한/기대근거)
3) 상태를 OPEN으로 전환

**AC**
- Owner 없이는 OPEN 전환 불가
- OPEN 전환 시 due_date 자동 설정(28일)

### 6.3 Flow C — Evidence 기록
1) Evidence 타입/강도 선택
2) 요약 + 링크/첨부

**AC**
- Evidence type/strength 필수
- ASSUMPTION은 “근거”가 아니라 “가정”으로 표기(시각적으로 구분)

### 6.4 Flow D — Decision 닫기(Next / Not Now / Dead End)
- NEXT: 근거(A/B) 최소 2개 권장 + 반례/리스크 1개 기록
- NOT_NOW: Trigger Type/Condition/Revisit Date 필수
- DEAD_END: Failure Pattern 1~3 + 증거 기반 1줄 이유 필수

**AC**
- NOT_NOW/DEAD_END 필수 필드 누락 시 저장 불가
- 닫힐 때 Decision 경로(실험/근거)가 링크로 따라다님

### 6.5 Flow E — Recall(재호출)
- Revisit Date 도래 → Review 큐 자동 등재
- 새 Seed 입력 시 → 유사 Not Now/Dead End 상위 N개 제안(최소는 검색/태그 기반)
- Monthly Failure Replay에서 Dead End 3개를 패턴으로 정제

**AC**
- “재호출 이벤트”가 월 1회 이상 발생하도록 큐/뷰 제공

### 6.6 Flow F — Weekly Decision Review (30분)
- 화면/뷰: OPEN 상태를 **Age(경과일) 순**으로 정렬
- 각 항목은 “Owner 1줄 요약 + 제안 상태” 입력란 포함
- Reviewer는 Next/연장만 확인(선택)

**AC**
- 30분 안에 미결을 정리할 수 있게 ‘한 화면’ 제공

---

## 7. 화면/기능 요구사항(Prototype 범위)

### 7.1 P0 (Must‑Have)
1. Discovery CRUD ✅
   - INBOX 생성, OPEN 승격, 상태 닫기
2. Owner/Reviewer 지정 및 변경(승계 1줄 기록) ✅
   - Owner 지정 ✅ | Reviewer 지정 UI ✅ | Owner 변경 ✅
3. Experiment 최대 2개 관리 ✅
4. Evidence 기록(타입/강도/링크) ✅
5. NOT_NOW 트리거/재검토 날짜 강제 ✅
6. DEAD_END Failure Pattern 태깅 ✅
7. Review Views ✅ (Weekly Review + Recall Queue)
   - Weekly Review: OPEN 목록(경과일/기한/다음 상태 제안)
   - Recall Queue: Revisit 도래 NOT_NOW 목록
8. 최소 지표 집계/Export ✅
   - Seed→Experiment 전환율, 종료 리드타임, 닫힘 비율, 재호출 이벤트 수

### 7.2 P1 (Nice‑to‑Have, 운영 중 필요하면 추가)
- 임베딩 기반 유사도 추천(유사 Seed/Dead End 자동 추천)
- Teams/Email 알림(리마인드/리비짓)
- 템플릿 자동 초안(1p Brief로 내보내기)

### 7.3 Out of Scope (v1에서 금지)
- 외부 고객 포털
- 고급 대시보드/경영 보고 자동화(제품 수준)
- 자동 의사결정(LLM이 Next/Drop 판단)

---

## 8. 기술/구현(Prototype 채택 스택)

### 8.1 채택된 기술 스택 (Adopted)
- Runtime: Cloudflare Pages (Edge)
- Framework: Remix v2 (Vite)
- DB: Cloudflare D1 (SQLite) + Drizzle ORM
- UI: React 19 + Tailwind CSS 3
- Language: TypeScript (strict)
- Package Manager: pnpm

> 선택 근거: Edge-native 무료 인프라, SQLite 단순성이 5명 Prototype에 적합

### 8.2 검토 후 제외된 대안
- **Confluence DB + 얇은 자동화**: 규칙 강제(Validation)가 불가능하여 제외
- **Next.js + FastAPI + Postgres**: 5명 Prototype에 과잉 프로비저닝

---

## 9. 개발 계획(로드맵) — '작게 만들고 바로 운영'

> **구현 현황 (2026-01-31 기준)**
> - Phase 0 (설계 고정): ✅ 완료
> - Phase 1 (P0 구현): ✅ 완료 — CRUD + Review 뷰 + Recall Queue
> - Phase 2 (운영 자동화): 미착수
> - Phase 3 (지표/리포트): ✅ 완료 — Metrics 대시보드 + CSV Export
>
> Phase 1과 3이 Phase 2보다 먼저 구현됨 (운영 실험에 필수인 기능 우선).
>
> **남은 P0 항목 (운영 시작 전 권장)**:
> - EXTENSION_REQUESTED 워크플로우 (상태값+validation 존재, 전환 UI 미구현)
>
> **SPEC.md ↔ PRD Phase 매핑**:
> PRD Phase 0 = SPEC 초기 설정 | PRD Phase 1 = SPEC Phase 1+2 | PRD Phase 2 = SPEC Phase 3 | PRD Phase 3 = SPEC Phase 4

### Phase 0 — 설계 고정(DoD: 스키마/템플릿 확정)
- Discovery/Experiment/Evidence 필드 확정
- 상태 전환 규칙(Validation) 확정
- Failure Pattern 태그 초안(10개 내) 확정
- 치트시트 1장 제작

### Phase 1 — P0 구현(DoD: end‑to‑end 1건이 “닫힘”까지 가능)
- INBOX → OPEN → (Evidence) → Decision(Next/Not Now/Dead End)
- Weekly Review 뷰
- Recall Queue 뷰(Revisit Date)

### Phase 2 — 운영 자동화 최소 추가(DoD: 운영 리듬이 버팀)
- TTL 리마인드(만료 전 알림)
- 28일 due_date 임박 알림
- Revisit Date 도래 자동 등재/알림

### Phase 3 — 지표/리포트(DoD: 30~60일 종료 판단 가능)
- 최소 지표 계산/Export(CSV)
- “닫힘 1건” + “재호출 1회” 여부를 보고서 1장으로 요약

---

## 10. 테스트/품질 기준(Prototype용)

### 10.1 Definition of Done (개발)
- 필수 필드 누락 시 저장이 막힌다(NOT_NOW/DEAD_END)
- Owner 없이는 OPEN/Decision이 불가능하다
- 1건의 Discovery가 10분 내에 OPEN→Decision까지 닫힌다(테스트 시나리오)
- Weekly Review 화면에서 10건을 30분 내 정리할 수 있다

### 10.2 Definition of Success (운영 실험)
- 최소 1건 이상의 “닫힌 Discovery” 발생
- 28일 내 종료율 ≥ 90%(연장 승인 제외)
- 월 1회 이상 재호출 이벤트 발생

---

## 11. 롤아웃(운영) 체크리스트

- [ ] 참여자 5명 확정(전원 Owner 수행 가능)
- [ ] Curator/Ops 1명 지정
- [ ] Reviewer 1명 지정(또는 팀장)
- [ ] Kickoff(60분) 일정 확정
- [ ] Weekly/Monthly 미팅 캘린더 고정
- [ ] Seed seeding 5개 준비(초기 가뭄 대비)
- [ ] 30~60일 종료 Gate 날짜 확정(Go/Pivot/Stop)

