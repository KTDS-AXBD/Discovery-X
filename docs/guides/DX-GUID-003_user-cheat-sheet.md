---
code: DX-GUID-003
title: 사용자 치트시트
version: 1.0
status: Active
category: GUID
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
system-version: ">=0.5.0"
---

# Discovery-X 사용자 치트시트

> 관찰 → 실험 → 근거 → 결정. 더 잘 틀리고, 더 빨리 배우는 시스템.

---

## 1. 핵심 워크플로우

```
INBOX ──promote──▶ OPEN ──decide──▶ NEXT (진행)
                    │                NOT_NOW (보류 → 재호출)
                    │                DEAD_END (종료 → 조직 학습)
                    │
                    └─ 실험 2회 소진 시 ──▶ EXTENSION_REQUESTED (+14일, 3회째 실험)
```

---

## 2. 상태별 가능한 액션

| 상태 | 가능한 액션 |
|------|------------|
| **INBOX** | 편집, OPEN 승격(Owner 지정 + 첫 실험 등록), 삭제 |
| **OPEN** | 실험 추가(최대 2개), 실험 완료 처리, Evidence 추가, 결정(NEXT/NOT_NOW/DEAD_END), 연장 요청 |
| **EXTENSION_REQUESTED** | 3회째 실험 등록, Evidence 추가, 결정(NEXT/NOT_NOW/DEAD_END) |
| **NEXT / NOT_NOW / DEAD_END** | 조회 전용 (NOT_NOW은 재호출 시 재검토) |

---

## 3. 필수 입력 항목

| 전환 | 필수 필드 |
|------|----------|
| **Seed 생성** (INBOX) | 제목, 요약 |
| **OPEN 승격** | Owner 지정, 첫 번째 Experiment (가설 + 최소행동 + 성공기준) |
| **NEXT 결정** | Evidence A/B등급 2개 이상 권장, 결정 사유 |
| **NOT_NOW 결정** | Trigger Type, 재검토 조건, Revisit Date |
| **DEAD_END 결정** | Failure Pattern (8종 택1), 실패 사유 |
| **연장 요청** | 연장 사유 |

---

## 4. Evidence 작성 가이드

### 타입

| 타입 | 설명 | 예시 |
|------|------|------|
| **DATA** | 정량 데이터 | 설문 결과 N=50, 전환율 3.2% |
| **USER** | 사용자 피드백 | 인터뷰 5건, "가격이 문제" 반복 언급 |
| **ARTIFACT** | 산출물/프로토타입 | MVP 화면 3개 제작, 클릭 테스트 완료 |
| **REF** | 외부 참고자료 | 시장 보고서, 경쟁사 분석 자료 |
| **ASSUMPTION** | 가정/추론 | "B2B 시장이 더 클 것" 팀 내부 합의 |

### 강도

| 등급 | 의미 | 예시 |
|------|------|------|
| **A** | Hard data (수치/실증) | 결제 전환율 4.1%, 매출 데이터 |
| **B** | 직접 관찰 | 사용자 인터뷰, 현장 방문 기록 |
| **C** | 간접 근거 | 유사 사례 참고, 2차 자료 분석 |
| **D** | 직감/가정 | 팀 토론 결과, 경험적 판단 |

---

## 5. 시간 규칙

| 규칙 | 내용 |
|------|------|
| Time-box | OPEN 승격 시점부터 **28일(4주)** 이내 결정 |
| 실험 제한 | Discovery당 **최대 2회** |
| 연장 | 2회 실험 후 미결정 시 **+14일**, 3회째 실험 가능 |
| Overdue | 기한 초과 시 대시보드에 **빨간 배지** 표시 |

---

## 6. 주간 점검

### Weekly Review (`/review`)
- OPEN 상태 Discovery를 **오래된 순** 확인
- 각 항목 1줄 상태 업데이트
- Overdue/기한 임박 항목 우선 처리
- 정체된 항목은 결정 촉구

### Recall Queue (`/recall`)
- Revisit Date 도래한 NOT_NOW 항목 확인
- 트리거 조건 변화 여부 재검토
- 재오픈(OPEN) 또는 재검토일 연장

---

## 7. URL 요약

| URL | 용도 |
|-----|------|
| `/` | 대시보드 (요약 + Overdue 알림) |
| `/discoveries` | Discovery 목록 |
| `/discoveries/new` | 새 Seed 등록 |
| `/discoveries/:id` | 상세 보기 (실험/근거/결정) |
| `/review` | Weekly Review |
| `/recall` | Recall Queue (재호출 대기) |
| `/metrics` | 지표 대시보드 |
