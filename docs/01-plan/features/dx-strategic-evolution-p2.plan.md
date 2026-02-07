# Discovery-X 전략적 진화 Phase 2 계획서

> Phase 1 (F3+F1+F5) 완료 기반, Layer 3 연결 준비

## 1. 배경

### 1.1 Phase 1 완료 현황

Phase 1 PDCA 완료 (Match Rate 96.3%):
- F3. AI 운영 로그 자산화 — decision_logs, extracted_patterns, reusable_rules
- F1. Industry Adapter 프레임워크 — 5개 산업, 규칙 엔진
- F5. 규제/감사 대응 Agent — 4개 compliance 도구

### 1.2 현재 시스템 규모

| 지표 | 값 |
|------|-----|
| DB 테이블 | 36 (core) + 16 (venture) = 52 |
| Agent 도구 | 55 (10개 파일) |
| Cron 작업 | 7 |
| 테스트 | 561 |

### 1.3 Phase 2 목적

**L2→L3 연결 강화**: Discovery-X를 내부 실험 도구에서 **외부 확장 가능한 전략 엔진**으로 전환

- F2: AI 판단의 신뢰도를 운영 데이터로 검증 (내부 품질)
- F4: 외부 기업/사업 평가 역량 확보 (외부 확장)

---

## 2. F2. Shadow Mode 운영 검증 통합

### 2.1 목표

기존 의사결정과 AI 제안을 **병행 비교**하여 AI 신뢰도를 객관적으로 측정

### 2.2 현재 상태

- Experiment: 가설-행동-결과 기록 (2개/Discovery)
- Decision: 수동 Gate 심사 (approve/reject)
- Agent 판단 로그: decision_logs 테이블 (Phase 1에서 추가)
- Venture 모듈: vdDecisions (PENDING/APPROVED) — 추천 vs 실제 기록 있음

### 2.3 개선 방향

```
Shadow Mode 워크플로우:
  1. 실제 의사결정 발생 (baseline)
  2. AI가 동일 컨텍스트로 독립 판단 (shadow)
  3. 두 결과 비교 (match_rate 계산)
  4. 이탈 분석 → 개선 피드백 루프
```

### 2.4 구현 항목

#### 데이터 모델

- [ ] `shadow_runs` 테이블
  - id, discovery_id FK, experiment_id FK (optional)
  - trigger_type: 'gate_decision' | 'stage_transition' | 'evidence_evaluation' | 'method_selection'
  - baseline_decision: JSON (실제 판단)
  - ai_suggestion: JSON (AI 제안)
  - match_result: 'match' | 'partial' | 'mismatch'
  - match_score: 0~100
  - deviation_analysis: JSON (이탈 원인 분석)
  - context_snapshot: JSON (판단 시점 상태)
  - created_at, reviewed_at, reviewed_by FK

- [ ] `shadow_configs` 테이블
  - id, discovery_id FK (optional, null=글로벌)
  - trigger_types: JSON (활성화할 트리거 목록)
  - enabled: boolean
  - auto_analyze: boolean (자동 이탈 분석)
  - created_at

#### Agent 도구 (3개)

- [ ] `run_shadow_comparison` — 특정 의사결정에 대해 AI 대안 생성 + 비교
- [ ] `get_shadow_stats` — Shadow Mode 통계 (일치율, 이탈 유형별 분석)
- [ ] `analyze_shadow_deviation` — 특정 이탈 케이스 심층 분석

#### UI

- [ ] Dashboard "Shadow Mode" 탭 추가
  - 전체 일치율 트렌드 (주간/월간)
  - 이탈 유형별 분포 차트
  - 최근 Shadow Run 목록
- [ ] Discovery 상세 내 "Shadow 검증" 섹션
  - 해당 Discovery의 Shadow Run 이력
  - AI vs 실제 판단 비교 뷰

#### Cron

- [ ] `api.cron.shadow-analyze.ts` — 일간 Shadow Run 분석 (미분석 건 처리)

---

## 3. F4. Value-up 시나리오 평가 엔진

### 3.1 목표

외부 기업/사업에 대한 **AI 기반 가치 평가** 및 **전환 시나리오** 생성

### 3.2 현재 상태

- Venture 모듈: 기회 평가 (potential/confidence/depth/effort 4축 스코어링)
- vdAssumptions: 가정 검증 (criticality 1~5)
- vdPremortems: 실패 시나리오 (probability/impact)
- 산업 어댑터: 5개 산업별 규제/규칙 (Phase 1)

### 3.3 개선 방향

```
Value-up Assessment Flow:
  1. 대상 프로필 입력 (기업/사업)
  2. AI Readiness 자동 진단
  3. 산업별 규제 대응 평가 (F1 어댑터 연동)
  4. 전환 시나리오 생성 (as-is → to-be)
  5. 가치 상승 예측 + 리스크 분석
  6. Due Diligence 체크리스트 생성
```

### 3.4 구현 항목

#### 데이터 모델

- [ ] `valueup_assessments` 테이블
  - id, discovery_id FK
  - target_name, target_industry (industry_adapter_id FK)
  - target_profile: JSON (규모, 매출, 직원 수, 기술 스택 등)
  - assessment_type: 'acquisition' | 'partnership' | 'investment' | 'transformation'
  - status: 'draft' | 'in_progress' | 'completed' | 'archived'
  - created_at, completed_at, created_by FK

- [ ] `valueup_scores` 테이블
  - id, assessment_id FK
  - dimension: 'ai_readiness' | 'market_position' | 'tech_maturity' | 'culture_fit' | 'financial_health' | 'regulatory_compliance'
  - score: 0~100
  - evidence_summary: TEXT
  - auto_scored: boolean
  - scored_at

- [ ] `valueup_scenarios` 테이블
  - id, assessment_id FK
  - scenario_type: 'optimistic' | 'base' | 'pessimistic'
  - transformation_plan: JSON (단계별 계획)
  - value_projection: JSON (시점별 가치 예측)
  - risk_factors: JSON
  - key_assumptions: JSON
  - created_at

- [ ] `valueup_checklists` 테이블
  - id, assessment_id FK
  - checklist_type: 'due_diligence' | 'pmi' | 'regulatory' | 'technical'
  - items: JSON (체크 항목 배열)
  - progress: 0~100
  - created_at, updated_at

#### Agent 도구 (4개)

- [ ] `create_valueup_assessment` — 대상 프로필 기반 평가 시작
- [ ] `run_ai_readiness_diagnosis` — 6차원 자동 진단 (AI readiness, market, tech, culture, finance, regulatory)
- [ ] `generate_valueup_scenario` — 3가지 시나리오 생성 (optimistic/base/pessimistic)
- [ ] `generate_due_diligence_checklist` — 산업별 DD 체크리스트 자동 생성

#### UI

- [ ] `/valueup` 라우트 — Value-up 평가 목록
- [ ] `/valueup/:id` 라우트 — 평가 상세 (스코어 레이더 차트 + 시나리오)
- [ ] `/valueup/:id/checklist` 라우트 — DD 체크리스트 뷰
- [ ] Discovery 상세 내 "Value-up 연결" 섹션

#### 연동

- [ ] Industry Adapter (F1)와 연동 — 산업별 규제 평가 자동 반영
- [ ] Decision Logs (F3)와 연동 — 평가 판단 기록 자동 저장
- [ ] Compliance Tools (F5)와 연동 — 규제 준수 자동 검증

---

## 4. 구현 우선순위

| 우선순위 | 기능 | 난이도 | 근거 |
|---------|------|--------|------|
| P0 | F2. Shadow Mode | 중 | AI 신뢰도 검증은 F4 확장의 전제 조건 |
| P1 | F4. Value-up 엔진 | 높음 | L3 연결의 핵심, F1/F3/F5 활용 |

### 4.1 구현 순서

```
Phase 2-A: 스키마 마이그레이션
  ├── F2: shadow_runs, shadow_configs (2 테이블)
  └── F4: valueup_assessments, valueup_scores, valueup_scenarios, valueup_checklists (4 테이블)

Phase 2-B: Agent 도구 (7개)
  ├── F2: shadow-tools.ts (3 도구)
  └── F4: valueup-tools.ts (4 도구)

Phase 2-C: Cron (1개)
  └── api.cron.shadow-analyze.ts

Phase 2-D: UI
  ├── F2: Dashboard Shadow 탭, Discovery Shadow 섹션
  └── F4: /valueup 라우트 3개, Discovery 연결 섹션
```

---

## 5. 성공 기준

### 5.1 정량 지표

| 지표 | Before | Target |
|------|--------|--------|
| DB 테이블 | 36 | 42 (+6) |
| Agent 도구 | 55 | 62 (+7) |
| 도구 파일 | 10 | 12 (+2) |
| Cron 작업 | 7 | 8 (+1) |
| 라우트 | ~78 | ~82 (+4) |

### 5.2 정성 지표

- [ ] Shadow Mode로 AI 판단 일치율 측정 가능
- [ ] Value-up 평가서 1건 이상 생성 가능
- [ ] 산업 어댑터 연동으로 규제 평가 자동화 확인

---

## 6. 리스크 및 대응

| 리스크 | 영향 | 대응 방안 |
|--------|------|----------|
| Shadow Mode 컨텍스트 재현 어려움 | 높음 | context_snapshot으로 판단 시점 상태 저장 |
| Value-up 평가의 도메인 지식 부족 | 중간 | 산업 어댑터(F1) + 외부 프레임워크 참조 |
| 테이블 수 증가로 인한 복잡도 | 중간 | 모듈화 유지, 명확한 FK 관계 |

---

## 7. 의존성

### Phase 1 산출물 활용

| Phase 1 산출물 | Phase 2 활용처 |
|---------------|---------------|
| industry_adapters | F4 대상 산업 분류 |
| industry_rules | F4 규제 평가 자동화 |
| decision_logs | F2 Shadow 비교 기준 |
| compliance-tools | F4 규제 준수 검증 |
| extracted_patterns | F2 이탈 패턴 분류 참조 |

---

## 8. 다음 단계

1. 이 계획서 승인 후 `/pdca design dx-strategic-evolution-p2` 실행
2. Phase 2 기능 상세 설계 문서 작성
3. Phase 1 archive 처리 (`/pdca archive dx-strategic-evolution --summary`)

---

*Plan 작성일: 2026-02-06*
*PDCA Feature: dx-strategic-evolution-p2*
*전제: Phase 1 (F3+F1+F5) 완료, Match Rate 96.3%*
