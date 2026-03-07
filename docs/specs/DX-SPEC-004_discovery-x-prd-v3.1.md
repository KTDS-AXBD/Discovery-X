---
code: DX-SPEC-004
title: Discovery-X PRD v3.1
version: 3.1
status: Active
category: SPEC
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
system-version: ">=6.27"
---

# Discovery-X PRD v3.1

> **버전**: v3.1 | **작성일**: 2026-03-05 | **상태**: 초안(Draft)
> **기반 문서**: Discovery-X_PRD_v3_Final.md (세션 178~212 구현 완료본)
> **범위**: 소규모 업데이트 — 온보딩 튜토리얼, 요구사항 관리, AI Agent 품질 고도화

---

## 변경 요약 (v3 → v3.1)

| # | 영역 | 변경 유형 | 우선순위 |
|---|------|-----------|---------|
| F-01 | 앱 내 온보딩 튜토리얼 | 신규 기능 | P0 |
| F-02 | 요구사항 수집/관리 | 신규 기능 | P1 |
| F-03 | AI Agent 응답 품질 고도화 | 기존 기능 개선 | P0 |

---

## 1. 기존 제약 유지 (§2.2 금지 사항 — 변경 없음)

v3.1에서도 아래 금지 사항은 그대로 적용된다.

- 전사 공식 포털/플랫폼 구축 금지
- 완성형 UX 금지 (필수 인지부하는 설계의 일부)
- 외부 고객/CRM 연동 금지
- 고급 예측/추천 모델 금지
- 제품 수준 KPI 대시보드 금지
- 자동 의사결정 금지 (LLM이 Next/Drop 판단)

---

## 2. 신규/변경 요구사항

---

### F-01. 앱 내 온보딩 튜토리얼

#### 2.1 배경 및 목적

Discovery-X는 의도된 인지부하를 설계 원칙으로 삼고 있으나, 처음 접속하는 팀원이 핵심 워크플로우를 파악하지 못해 이탈하거나 기능을 잘못 활용하는 문제가 발생하고 있다. 최초 접속 시 한 번만 실행되는 인터랙티브 온보딩 플로우를 통해 진입 장벽을 낮춘다.

#### 2.2 요구사항

**FR-01-1. 최초 접속 감지 및 트리거**
- 신규 사용자(최초 로그인 또는 `onboarding_completed = false`) 접속 시 자동으로 온보딩 플로우를 실행한다.
- 사용자는 온보딩을 언제든 Skip할 수 있으며, Skip 시 `onboarding_completed = true`로 처리한다.
- 온보딩 완료 후 재실행은 `/profile` 또는 설정 메뉴에서 가능하다.

**FR-01-2. 튜토리얼 콘텐츠 — 3단계 구성**

| 단계 | 제목 | 핵심 내용 |
|------|------|-----------|
| Step 1 | Discovery 파이프라인 | 11단계 흐름 시각화 (DISCOVERY → HANDOFF/HOLD/DROP), 각 단계의 역할과 전환 조건 |
| Step 2 | 아이디어 → 사업제안 전환 | 아이디어 카드 생성 → 가설 수립 → Radar 연동 → 사업제안(Proposal) 승격 경로 |
| Step 3 | 팀 협업 / Topic | Topic 생성, 멤버 초대(owner/editor/viewer), 브리핑 자동 생성, 팀 지식 베이스 활용법 |

**FR-01-3. UI 방식**
- 오버레이 모달 형태로 구현하며, 화면 전체를 가리지 않고 실제 UI 요소를 하이라이트하는 "spotlight" 방식을 권장한다.
- 각 단계는 `다음(Next)` / `이전(Prev)` / `건너뛰기(Skip)` 버튼을 포함한다.
- 진행 상태는 Step indicator (예: 1/3, 2/3, 3/3)로 표시한다.
- 온보딩 완료 시 "시작하기" CTA로 대시보드로 이동한다.

**FR-01-4. 상태 영속성**
- `users` 테이블 또는 별도 `user_preferences` 테이블에 `onboarding_completed (boolean)`, `onboarding_completed_at (timestamp)` 컬럼을 추가한다.
- 온보딩 재실행 횟수는 별도 추적하지 않는다.

#### 2.3 비기능 요구사항
- 온보딩 UI는 기존 AppShell 레이아웃 위에 레이어로 올라가야 하며, 기존 라우팅/렌더링 구조를 깨지 않는다.
- 모바일 대응 불필요 (데스크탑 전용).
- 콘텐츠 텍스트는 하드코딩으로 시작하며, 추후 관리자 편집 가능 구조로 확장 가능하도록 컴포넌트를 분리한다.

#### 2.4 구현 범위 (1~2일 기준)
- `app/components/onboarding/OnboardingModal.tsx` — 3단계 모달 컴포넌트
- `app/components/onboarding/OnboardingStep.tsx` — 개별 스텝 렌더러
- `app/routes/root.tsx` (수정) — 온보딩 상태 로드 + 모달 조건부 렌더링
- `app/routes/api.onboarding.ts` (신규) — `PATCH /api/onboarding` (완료/재시작)
- DB: `users` 테이블 `onboarding_completed` 컬럼 추가 마이그레이션

---

### F-02. 요구사항 수집/관리 기능

#### 2.5 배경 및 목적

팀 운영 중 기능 개선 아이디어나 불편 사항이 산발적으로 발생하지만, 이를 체계적으로 수집하고 처리 상태를 추적하는 채널이 없다. 팀원 누구나 요구사항을 올리고, Owner가 검토·반영 여부를 결정하는 경량 요구사항 관리 기능을 추가한다.

> **범위 주의**: 외부 고객이나 이해관계자가 올리는 구조가 아니라, 내부 팀원 간의 제품 개선 요청 관리이다. §2.2 금지 사항(외부 고객/CRM 연동)에 해당하지 않는다.

#### 2.6 요구사항

**FR-02-1. 요구사항 카드 필드**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `title` | string | ✅ | 요구사항 제목 (최대 100자) |
| `description` | text | ✅ | 상세 설명 (마크다운 지원) |
| `priority` | enum | ✅ | `high / medium / low` |
| `status` | enum | ✅ | 처리 상태 (아래 참조) |
| `submitter_id` | FK | 자동 | 제출한 팀원 ID |
| `created_at` | timestamp | 자동 | |
| `reviewed_at` | timestamp | — | Owner 검토 시점 |
| `reviewer_id` | FK | — | 검토한 Owner ID |
| `linked_discovery_id` | FK | — | 연관 Discovery (선택) |
| `linked_idea_id` | FK | — | 연관 아이디어 (선택) |

**FR-02-2. 처리 상태 (4단계)**

```
OPEN (접수) → IN_REVIEW (검토 중) → ACCEPTED (반영) / REJECTED (보류)
```

- 상태 전환은 Owner 권한 사용자만 가능하다.
- `REJECTED` 시 사유(reason) 입력을 권장하나 필수는 아니다.
- 제출자는 자신의 요구사항 상태 변경 알림을 받는다 (notification_queue 활용).

**FR-02-3. 목록/뷰 UI**
- `/feedback` 또는 `/requests` 라우트에 요구사항 목록을 제공한다.
- 기본 정렬: `created_at DESC`
- 필터: 상태별, 우선순위별
- 카드 뷰: 제목 + 우선순위 배지 + 상태 배지 + 제출자 + 경과일

**FR-02-4. 권한**
- 제출(Create): 모든 로그인 사용자
- 상태 변경(Update status): Owner 역할 보유 사용자
- 삭제: 제출자 본인 또는 Owner (OPEN 상태에서만)

#### 2.7 구현 범위 (1~2일 기준)
- `drizzle/XXXX_feature_requests.sql` — `feature_requests` 테이블 마이그레이션
- `app/db/schema.ts` (수정) — `featureRequests` Drizzle 스키마 추가
- `app/routes/api.requests.ts` (신규) — GET 목록 + POST 생성
- `app/routes/api.requests.$id.ts` (신규) — GET 상세 + PATCH 상태 변경 + DELETE
- `app/routes/requests.tsx` (신규) — 목록 UI (AppShell 내 단일 뷰)
- `app/components/requests/RequestCard.tsx` (신규) — 카드 컴포넌트
- GNB 또는 사이드바에 `/requests` 링크 추가 (기존 탭 구조 최소 변경)

---

### F-03. AI Agent 응답 품질 고도화

#### 2.8 배경 및 목적

현재 AI Agent는 기능적으로 동작하지만, 응답의 신뢰성과 맥락 일관성 측면에서 개선 여지가 있다. 팀원들이 Agent 응답을 의사결정 근거로 활용할 수 있도록 품질을 높인다.

#### 2.9 세부 요구사항

**FR-03-1. Agent 응답에 근거(Evidence) 자동 인용**
- Agent가 Discovery, Evidence, 또는 Proposal 데이터를 참조하여 답변할 때, 해당 항목의 링크/ID를 응답 말미에 자동으로 포함한다.
- 형식: `[참조] Discovery #123 — "가설명"` 형태의 인라인 링크
- 구현 위치: `app/lib/agent/agent-session.ts` — 응답 후처리 레이어에서 참조된 tool_result를 파싱하여 인용 블록 생성
- Agent가 DB 조회 없이 추론만으로 답변한 경우에는 인용 블록을 생성하지 않는다.

**FR-03-2. '모름' 명시 강화**
- SOUL 프롬프트에 다음 규칙을 추가한다: *"확인된 데이터나 명시적 지시가 없는 사항에 대해서는 '확실하지 않습니다' 또는 '데이터가 없어 판단하기 어렵습니다'라고 명시하고 추측성 답변을 제공하지 않는다."*
- Agent가 Discovery 데이터 없이 일반 지식으로 답변할 때는 응답 앞에 `[일반 지식 기반 답변 — Discovery 데이터 미참조]` 레이블을 표시한다.
- 구현 위치: `schemas/templates/SOUL-analyst.md`, `SOUL-manager.md` 업데이트

**FR-03-3. 대화 맥락 요약(Memory) 품질 개선**
- `MemoryLifecycle.compact()` 실행 시, `importance_score`가 0.7 이상인 `daily_log` 항목은 단순 요약이 아닌 "결정 사항 중심" 요약을 생성하도록 summarizer 프롬프트를 개선한다.
- 요약 프롬프트 원칙: *"대화에서 내려진 결정, 변경된 방향, 식별된 리스크를 중심으로 3문장 이내로 요약한다."*
- `long_term` 승격 조건: `importance_score >= 0.7` + 결정/액션 키워드 포함 시
- 구현 위치: `app/lib/agent/memory-lifecycle.ts`

**FR-03-4. SOUL 커스터마이징 UI**
- `/profile` 페이지에 "나의 Agent 설정" 섹션을 추가한다.
- 편집 가능 필드:
  - **응답 언어 선호**: 한국어 / 영어 / 자동(기본)
  - **응답 스타일**: 간결형 / 상세형 / 근거 강조형
  - **커스텀 지시사항**: 자유 텍스트 (최대 500자) — 예: "항상 결론을 먼저 말해줘"
- 저장된 설정은 `graphs` 테이블의 USER.md Projection에 병합되어 SoulEngine이 매 세션 로드 시 반영한다.
- 구현 위치: `app/routes/profile.tsx` (수정), `app/lib/agent/soul-engine.ts` (수정)

---

## 3. DB 스키마 변경 요약

| 변경 대상 | 변경 내용 | 관련 기능 |
|-----------|-----------|-----------|
| `users` | `onboarding_completed boolean DEFAULT false`, `onboarding_completed_at timestamp` 컬럼 추가 | F-01 |
| `feature_requests` | 신규 테이블 (7 컬럼 + FK 2개) | F-02 |
| `token_usage_logs` | 변경 없음 | — |
| `graphs` (USER Projection) | SOUL 커스텀 설정 필드 병합 (스키마 변경 없음, Projection 내용 확장) | F-03 |

---

## 4. 라우트 변경 요약

| 라우트 | 변경 유형 | 설명 |
|--------|-----------|------|
| `app/routes/root.tsx` | 수정 | 온보딩 상태 로드 + OnboardingModal 조건부 렌더 |
| `app/routes/api.onboarding.ts` | 신규 | PATCH — 온보딩 완료/재시작 처리 |
| `app/routes/requests.tsx` | 신규 | 요구사항 목록 UI |
| `app/routes/api.requests.ts` | 신규 | GET + POST |
| `app/routes/api.requests.$id.ts` | 신규 | GET + PATCH + DELETE |
| `app/routes/profile.tsx` | 수정 | SOUL 커스터마이징 섹션 추가 |

---

## 5. 구현 순서 (권장, 1~2일 기준)

### Day 1
1. **F-03 Agent 품질 고도화** (코드 변경 집중, UI 최소)
   - SOUL 프롬프트 업데이트 (`SOUL-analyst.md`, `SOUL-manager.md`)
   - `memory-lifecycle.ts` summarizer 프롬프트 개선
   - `agent-session.ts` Evidence 인용 후처리 레이어 추가
   - `profile.tsx` SOUL 커스터마이징 UI

2. **F-02 요구사항 관리 — DB + API** (스키마 + 서버 사이드)
   - 마이그레이션 + Drizzle 스키마
   - API 라우트 3개

### Day 2
3. **F-02 요구사항 관리 — UI**
   - `requests.tsx` 목록 뷰 + `RequestCard.tsx`
   - GNB/사이드바 링크 추가

4. **F-01 온보딩 튜토리얼**
   - DB 마이그레이션 (`users` 컬럼 추가)
   - `OnboardingModal.tsx` + `OnboardingStep.tsx`
   - `root.tsx` 조건부 렌더링 연결
   - `api.onboarding.ts` 완료 처리

---

## 6. 성공 기준 (v3.1)

| 항목 | 기준 |
|------|------|
| 온보딩 완료율 | 신규 사용자 중 Skip 없이 완료 비율 ≥ 70% |
| 요구사항 처리율 | 접수 후 7일 이내 상태 변경(검토 이상) 비율 ≥ 80% |
| Agent 인용 커버리지 | DB 조회 포함 응답 중 인용 블록 생성 비율 ≥ 90% |
| SOUL 커스터마이징 사용률 | 활성 사용자 중 1개 이상 설정 변경 비율 — 측정만 수행 (기준 미설정) |

---

## 7. 제외 범위 (v3.1에서 다루지 않음)

- 외부 이해관계자의 요구사항 제출 채널 (§2.2 금지)
- 요구사항의 자동 Discovery 전환
- 온보딩 콘텐츠 관리자 편집 UI (추후 v3.2+)
- 모바일 온보딩 플로우

---

*Discovery-X PRD v3.1 — AX BD팀 내부용, 2026-03-05*
