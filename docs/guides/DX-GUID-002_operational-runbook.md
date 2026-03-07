---
code: DX-GUID-002
title: 운영 런북
version: 1.0
status: Active
category: GUID
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
system-version: ">=6.0"
---

# Discovery-X 운영 런북

## 1. 운영 개요

### 목적
Discovery-X는 AX 신사업 탐색을 위한 내부 실험 중심 사고 시스템입니다. 관찰을 행동으로 전환하고, 행동을 근거 있는 문서로 남기며, 실패를 조직 자산으로 축적합니다.

### 운영 실험 범위
- **기간**: 30-60일 (중간 점검 30일, 최종 평가 60일)
- **참여 인원**: 최대 5명
- **목표 Discovery 수**: 5-10건
- **운영 담당자(Ops/Curator)**: 1명 (주간 리뷰 주관, 모니터링, 데이터 백업)

### 성공 기준
| 지표 | 목표 |
|------|------|
| 닫힌 Discovery (NEXT/NOT_NOW/DEAD_END) | 1건 이상 |
| 28일 내 결정 완료율 | 90% 이상 |
| 실험 완료율 | 80% 이상 |
| 재호출(Recall) 이벤트 | 월 1회 이상 |

---

## 2. 주간 운영 루틴 (Weekly Review)

### 개요
| 항목 | 내용 |
|------|------|
| **시기** | 매주 월요일 (또는 팀 합의 요일) |
| **소요 시간** | 30분 |
| **참석** | 전체 참여자 (5명) + 운영 담당자 |
| **도구** | `/review` 페이지 |

### 진행 절차

#### a. OPEN 항목 점검
1. `/review` 페이지를 열고 OPEN 상태 Discovery를 **오래된 순**으로 확인합니다.
2. 각 Discovery의 남은 일수, 실험 진행 상태, Evidence 수를 확인합니다.

#### b. Owner별 상태 업데이트
- 각 Owner가 담당 Discovery에 대해 **1줄 상태 업데이트**를 공유합니다.
- 예: "사용자 인터뷰 3건 완료, 다음 주 데이터 분석 후 결정 예정"

#### c. Overdue 항목 확인
- 빨간 배지가 표시된 기한 초과 항목을 확인합니다.
- Overdue 항목은 **즉시 결정**(NEXT/NOT_NOW/DEAD_END)을 촉구합니다.
- 사유가 있으면 **연장 요청** 절차를 안내합니다.

#### d. 기한 임박 항목 확인
- 잔여 기간 7일 이내인 항목을 별도로 체크합니다.
- 실험 미완료 상태라면 완료 일정을 확인합니다.

#### e. 정체 항목 조치
- 2주 이상 Evidence 추가가 없는 항목을 식별합니다.
- Owner에게 상태 전환(결정)을 제안합니다.

### 주간 리뷰 회의록 템플릿

```markdown
## Weekly Review — [날짜]

### 참석자
- [ ] 이름1, [ ] 이름2, [ ] 이름3, [ ] 이름4, [ ] 이름5

### OPEN Discovery 현황
| # | Discovery | Owner | 잔여일 | 실험 | Evidence | 상태 메모 |
|---|-----------|-------|--------|------|----------|----------|
| 1 |           |       |        |  /2  |          |          |
| 2 |           |       |        |  /2  |          |          |

### Overdue 항목
-

### 이번 주 결정 예정
-

### 액션 아이템
- [ ]
```

---

## 3. 월간 운영 루틴 (Monthly Failure Replay)

### 개요
| 항목 | 내용 |
|------|------|
| **시기** | 매월 첫째 주 금요일 |
| **소요 시간** | 60분 |
| **참석** | 전체 참여자 + 운영 담당자 |
| **준비물** | DEAD_END Discovery CSV Export |

### 진행 절차

#### a. 데이터 준비
1. `/api/export/discoveries`에서 CSV를 다운로드합니다.
2. DEAD_END 상태인 Discovery만 필터링합니다.

#### b. 실패 패턴 분류
Failure Pattern별로 그룹화합니다:

| 패턴 | 설명 |
|------|------|
| Timing_Too_Early | 시기상조 |
| Market_Size_Below_Threshold | 시장 규모 부족 |
| Tech_Not_Ready | 기술 미성숙 |
| Internal_Capacity_Gap | 내부 역량 부족 |
| Customer_Need_Mismatch | 고객 니즈 불일치 |
| Unit_Economics_Negative | 단위 경제성 부정적 |
| Regulatory_Blocked | 규제 장벽 |
| Existing_Competition_Dominant | 기존 경쟁 우위 |

#### c. 패턴 토론
- 반복되는 패턴이 있는가?
- 사전에 걸러낼 수 있었던 건?
- 팀의 탐색 방향을 수정해야 하는가?

#### d. 실행 항목 도출
- 토론 결과를 바탕으로 팀 운영 방식을 업데이트합니다.
- 예: "Timing_Too_Early가 3건 반복 → Seed 단계에서 시장 타이밍 체크리스트 추가"

### 월간 Failure Replay 회의록 템플릿

```markdown
## Failure Replay — [날짜]

### 참석자
-

### DEAD_END 요약
| # | Discovery | Failure Pattern | 핵심 교훈 |
|---|-----------|-----------------|----------|
| 1 |           |                 |          |

### 반복 패턴 분석
- 가장 빈번한 패턴:
- 사전 방지 가능했던 건:

### 팀 운영 변경 사항
- [ ]

### 다음 달 관찰 포인트
-
```

---

## 4. 일일 모니터링 체크리스트

운영 담당자가 매일 5분 내로 수행하는 점검 항목입니다.

- [ ] **대시보드 확인** (`/`): Overdue 알림 배지 확인
- [ ] **Recall Queue 확인** (`/recall`): Revisit Date 도래 항목 확인, 해당 Owner에게 알림
- [ ] **INBOX 방치 확인**: 7일 이상 INBOX에 머문 Discovery 확인, Owner에게 승격 또는 삭제 촉구
- [ ] **정체 항목 확인**: 최근 7일간 활동(실험/Evidence)이 없는 OPEN Discovery 식별

---

## 5. Recall 재호출 프로세스

### 트리거 조건
- NOT_NOW으로 결정 시 지정한 **Revisit Date**가 도래하면, Recall Queue(`/recall`)에 자동 표시됩니다.

### 재검토 절차
1. **원본 확인**: 해당 Discovery의 상세 페이지에서 당시 NOT_NOW 결정 사유, Trigger Type, 재검토 조건을 확인합니다.
2. **조건 변화 평가**: 트리거 조건이 변했는지 판단합니다.
   - 예: "경쟁사 출시 후 시장 반응 확인" → 경쟁사가 출시했는가?
3. **조치 결정**:
   - **재오픈**: 조건이 변했으면 OPEN으로 재승격하여 새로운 실험을 설계합니다.
   - **재검토일 연장**: 아직 조건이 변하지 않았으면 Revisit Date를 연장합니다.
   - **DEAD_END 전환**: 재검토 결과 더 이상 가치 없다고 판단되면 DEAD_END로 변경합니다.

### 주의사항
- Recall은 자동으로 상태를 변경하지 않습니다. 반드시 사람이 판단해야 합니다.
- Revisit Date를 2회 이상 연장하는 경우, DEAD_END 전환을 적극 검토하세요.

---

## 6. 데이터 백업 및 Export

### Export 엔드포인트

| 용도 | URL | 형식 |
|------|-----|------|
| Discovery 전체 Export | `/api/export/discoveries` | JSON |
| 지표 Export | `/api/export/metrics` | JSON |

### 권장 백업 주기
- **주간**: 매주 Weekly Review 직후 Discovery Export 수행
- **월간**: Failure Replay 직후 전체 Export + Metrics Export 수행

### 백업 절차
1. 브라우저에서 Export URL에 접속하여 JSON 파일을 다운로드합니다.
2. 팀 공유 폴더(또는 지정된 저장소)에 날짜별로 저장합니다.
3. 파일명 규칙: `discovery-export-YYYY-MM-DD.json`, `metrics-export-YYYY-MM-DD.json`

---

## 7. 문제 대응

### Owner 부재 시
- INBOX 또는 OPEN 상태인 Discovery는 Owner를 변경할 수 있습니다.
- 상세 페이지(`/discoveries/:id`)에서 편집을 통해 Owner를 재지정합니다.
- 이미 결정(NEXT/NOT_NOW/DEAD_END)된 Discovery는 Owner 변경이 불가합니다.

### INBOX 방치 (7일 이상)
- 대시보드에서 경고 배지를 확인합니다.
- 해당 Owner에게 직접 연락하여 승격 또는 삭제를 요청합니다.
- 14일 이상 방치 시 운영 담당자가 Weekly Review에서 팀 논의로 처리 방향을 결정합니다.

### 기한 초과 (Overdue)
- 대시보드와 Review 페이지에서 빨간 배지로 표시됩니다.
- Owner에게 **즉시 결정**(NEXT/NOT_NOW/DEAD_END)을 촉구합니다.
- 실험이 2회 미만이고 사유가 있으면 **연장 요청**을 안내합니다.
- 1주일 이상 Overdue 지속 시 Weekly Review에서 팀 차원의 조치를 논의합니다.

### 시스템 접속 불가
- Cloudflare Pages 기반이므로 CDN 상태를 확인합니다.
- 운영 담당자가 `pnpm deploy`로 재배포를 시도합니다.
- 데이터는 Cloudflare D1에 저장되므로 배포와 무관하게 보존됩니다.

---

## 8. 성공 기준 모니터링

### `/metrics` 대시보드 활용

Metrics 페이지에서 다음 지표를 확인할 수 있습니다:

| 지표 | 확인 방법 | 목표 |
|------|----------|------|
| 닫힌 Discovery 수 | 상태별 카운트 | 1건 이상 |
| 28일 결정 완료율 | 기한 내 결정 비율 | 90% 이상 |
| 실험 완료율 | 완료된 실험 / 등록된 실험 | 80% 이상 |
| 월간 Recall 이벤트 | Recall 처리 건수 | 월 1회 이상 |

### 모니터링 주기
- **주간**: Weekly Review 시 대시보드 수치 공유
- **30일 (중간 점검)**: 성공 기준 대비 달성률 점검, 운영 방식 조정
- **60일 (최종 평가)**: 전체 지표 종합 평가, 시스템 지속 여부 결정
