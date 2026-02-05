# Discovery-X 전략적 진화 계획서

> 미래 먹거리 Long List 보고서 기반 시스템 개선 계획

## 1. 배경 및 목적

### 1.1 보고서 핵심 인사이트

**미래 먹거리 Matrix 분석 결과**:
- Discovery-X는 **Layer 2(체질 전환 사업)의 기준선** 역할
- Layer 1(단기 수익)은 풍부하나 **Layer 3(정체성 전환)으로의 연결 고리가 약함**
- 전략적 핵심 후보(⭐) 6개 중 Discovery-X 관련 항목이 최상위

**전략적 위치**:
| Layer | 위치 | 역할 |
|-------|------|------|
| L2 | 현재 | 실험 기반 사고 시스템, IP/자산 축적 구조 |
| L3 | 목표 | AI Roll-up Value-up Engine, 정체성 전환 도구 |

### 1.2 개선 목적

1. **L2→L3 연결 강화**: Discovery-X를 단순 탐색 도구에서 전략적 의사결정 엔진으로 확장
2. **자산 축적 구조 강화**: 실험 결과가 재사용 가능한 IP로 누적되는 메커니즘
3. **외부 확장 준비**: Roll-up/Value-up 시나리오에서 활용 가능한 구조

---

## 2. 전략적 개선 영역

### 2.1 Layer 2 기반 강화 (체질 전환)

#### F1. Industry Adapter 프레임워크
**연관 사업**: #7 Industry Adapter 축적 사업 (⭐)

**현재 상태**:
- Discovery는 범용 구조 (산업 구분 없음)
- Method Pack은 범용 실험 방법론

**개선 방향**:
```
Discovery
  └── Industry Context (신규)
        ├── industry_type: 산업 분류
        ├── regulatory_constraints: 규제 조건
        ├── domain_rules: 업종별 판단 규칙
        └── success_patterns: 산업별 성공 패턴
```

**구현 항목**:
- [ ] `industry_adapters` 테이블 추가
- [ ] Discovery에 `industry_id` FK 연결
- [ ] 산업별 Method Pack 확장 (규제/감사 대응)
- [ ] 산업별 Evidence 평가 기준 차별화

---

#### F2. Shadow Mode 운영 검증 통합
**연관 사업**: #11 Shadow Mode 운영 검증 서비스 (🔵)

**현재 상태**:
- Experiment는 가설-행동-결과 기록만 수행
- 실제 운영 대비 검증 구조 없음

**개선 방향**:
```
Experiment
  └── Shadow Mode (신규)
        ├── baseline_decision: 기존 의사결정 기록
        ├── ai_suggestion: AI 제안 결과
        ├── match_rate: 일치도 (%)
        └── deviation_analysis: 이탈 분석
```

**구현 항목**:
- [ ] `experiment_shadow_runs` 테이블 추가
- [ ] AI 판단 vs 실제 판단 비교 UI
- [ ] Match Rate 기반 신뢰도 대시보드
- [ ] Deviation 패턴 자동 분류

---

#### F3. AI 운영 로그 자산화
**연관 사업**: #13 AI 운영 로그 자산화 플랫폼 (🔵)

**현재 상태**:
- `event_log` 테이블로 감사 로그 기록
- Agent 대화는 `messages` 테이블에 저장
- 장기 자산화 구조 미흡

**개선 방향**:
```
Operation Log Asset
  ├── decision_logs: 판단 이력 (압축 저장)
  ├── pattern_extracts: 추출된 패턴
  ├── reusable_rules: 재사용 가능 규칙
  └── knowledge_graph: 지식 그래프 노드
```

**구현 항목**:
- [ ] 로그 압축/아카이브 Cron 작업
- [ ] 패턴 추출 Agent 도구 추가
- [ ] 규칙 자동 생성 기능 (Evidence 기반)
- [ ] 지식 그래프 확장 (Ontology 연결)

---

### 2.2 Layer 3 연결 준비 (정체성 전환)

#### F4. Value-up 시나리오 평가 엔진
**연관 사업**: #1 Discovery-X 기반 AI Roll-up Value-up Engine (⭐)

**현재 상태**:
- Discovery 상태 전환 (11단계)은 내부 실험용
- 외부 기업 평가/전환 구조 없음

**개선 방향**:
```
Value-up Assessment
  ├── target_profile: 대상 기업 프로필
  ├── ai_readiness_score: AI 적용 준비도
  ├── transformation_plan: 전환 계획
  ├── risk_factors: 리스크 요소
  └── value_projection: 가치 상승 예측
```

**구현 항목**:
- [ ] `valueup_assessments` 테이블 추가
- [ ] AI Readiness 진단 도구 (Agent)
- [ ] Due Diligence 체크리스트 자동화
- [ ] PMI(Post-Merger Integration) 시뮬레이션

---

#### F5. 규제·감사 대응 Agent 고도화
**연관 사업**: #8 규제·감사 대응 OS/Agent 플랫폼 (⭐)

**현재 상태**:
- Agent 도구 45개 (내부 Discovery 관리 중심)
- 규제/감사 특화 도구 없음

**개선 방향**:
```
Compliance Agent Tools
  ├── audit_trail_generator: 감사 추적 생성
  ├── regulatory_checker: 규제 준수 검증
  ├── evidence_packager: 근거 패키지 생성
  └── report_formatter: 보고서 자동 포맷팅
```

**구현 항목**:
- [ ] 감사 대응 전용 Agent 도구 4개 추가
- [ ] 규제 조건 데이터베이스 연동
- [ ] 자동 보고서 생성 (PDF/DOCX)
- [ ] 타임라인 기반 증적 추출

---

#### F6. Multi-Tenant 기반 구조
**연관 사업**: #2 전통 산업 AI-native 전환 운영사 (⭐)

**현재 상태**:
- Single-tenant (KT DS 내부 전용)
- 사용자 역할: admin/gatekeeper/user/pending

**개선 방향**:
```
Multi-Tenant Structure
  ├── tenant_id: 조직 구분
  ├── tenant_settings: 조직별 설정
  ├── data_isolation: 데이터 격리
  └── cross_tenant_analytics: 교차 분석 (옵션)
```

**구현 항목**:
- [ ] `tenants` 테이블 추가
- [ ] 모든 주요 테이블에 `tenant_id` FK
- [ ] 조직별 설정/브랜딩 지원
- [ ] 데이터 격리 정책 적용

---

## 3. 구현 우선순위

### Phase 1: L2 기반 강화 (단기)
| 우선순위 | 기능 | 난이도 | 임팩트 |
|---------|------|-------|--------|
| P0 | F3. AI 운영 로그 자산화 | 중 | 높음 |
| P1 | F1. Industry Adapter (기초) | 중 | 높음 |
| P2 | F5. 감사 대응 Agent 도구 | 중 | 중간 |

### Phase 2: L3 연결 (중기)
| 우선순위 | 기능 | 난이도 | 임팩트 |
|---------|------|-------|--------|
| P0 | F2. Shadow Mode 검증 | 높음 | 높음 |
| P1 | F4. Value-up 평가 엔진 | 높음 | 높음 |

### Phase 3: 확장 기반 (장기)
| 우선순위 | 기능 | 난이도 | 임팩트 |
|---------|------|-------|--------|
| P0 | F6. Multi-Tenant | 높음 | 매우 높음 |

---

## 4. 성공 기준

### 4.1 정량 지표
| 지표 | 현재 | 목표 |
|------|------|------|
| Agent 도구 수 | 45개 | 53개 (+8) |
| 산업별 Adapter | 0개 | 5개 |
| 재사용 가능 규칙 | 수동 | 자동 추출 |
| Multi-Tenant | N/A | 3개 조직 |

### 4.2 정성 지표
- [ ] Discovery-X가 L3 사업(Roll-up/Value-up)의 핵심 도구로 인식
- [ ] 산업별 규제/감사 대응이 자동화된 워크플로우로 정착
- [ ] 실험 결과가 조직 자산으로 축적되는 구조 확립

---

## 5. 리스크 및 대응

| 리스크 | 영향 | 대응 방안 |
|--------|------|----------|
| 범위 확장으로 인한 복잡도 증가 | 높음 | 모듈화/점진적 확장, 기존 구조 유지 |
| Multi-Tenant 전환 시 데이터 마이그레이션 | 중간 | 단일 테넌트 우선 완성 후 확장 |
| 규제 대응 도메인 지식 부족 | 중간 | 외부 전문가/자료 연동 |

---

## 6. 다음 단계

1. **이 계획서 승인** 후 `/pdca design dx-strategic-evolution` 실행
2. Phase 1 기능 상세 설계 문서 작성
3. 스키마 변경 계획 및 마이그레이션 전략 수립

---

## 참고

- 원본 보고서: KT DS 미래 먹거리 Long List 검토 보고서 (CEO 공유용 · Draft)
- 현재 Discovery-X 버전: v4.2 Venture Discovery Sprint + Embeddings
- PDCA 상태: do phase (95% match rate)

---

*Plan 작성일: 2026-02-05*
*PDCA Feature: dx-strategic-evolution*
