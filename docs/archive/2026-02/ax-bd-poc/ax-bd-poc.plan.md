# AX BD팀 PoC 리팩토링 계획서

> **Summary**: 기존 Discovery-X 시스템을 AX BD팀 요구사항 v0.2에 맞게 리팩토링
>
> **Project**: Discovery-X
> **Version**: v4.2
> **Author**: Claude
> **Date**: 2026-02-09
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

AX BD팀 PoC 요구사항(7개 EPIC, 16개 티켓)을 기존 Discovery-X 시스템의 기능을 최대한 재사용하여 구현한다. 신규 개발을 최소화하고 기존 88개 라우트, 46개 DB 테이블, 45개 Agent 도구에서 리팩토링/확장으로 커버한다.

### 1.2 Background

- Discovery-X는 이미 소스 수집(Radar), AI Agent 채팅, Discovery 파이프라인, Venture Sprint을 운영 중
- BD팀 요구사항의 핵심 흐름(소스 수집 → 대화 탐색 → 아이디어 생성 → 템플릿 → 팀 공유)은 기존 기능과 70% 이상 겹침
- 리팩토링 중심 접근으로 PoC 기간을 단축

### 1.3 Related Documents

- Requirements: `docs/AX BD팀 요구사항_v0.2.md`
- PRD: `docs/Discovery-X_Prototype_PRD_v0.1.md`
- SPEC: `SPEC.md`

---

## 2. Scope

### 2.1 In Scope (PoC 1순위: EPIC 1, 2, 3, 4, 6)

- [x] EPIC 1: 시장 소스 수집 & 요약 — Radar 시스템 리팩토링
- [x] EPIC 2: 개인 Workspace 탐색 — 채팅 + Embeddings 확장
- [x] EPIC 3: 아이디어 후보 생성 — Agent 도구 + Discovery 흐름 확장
- [x] EPIC 4: 아이디어 공통 템플릿 — Discovery 필드 매핑
- [x] EPIC 6: 기본 UI 구조 — TopNav + 3-Pane 레이아웃 리팩토링

### 2.2 Out of Scope (PoC 2~3순위)

- EPIC 5: 팀 공유 & 논의 (tenant/tenantMembers 테이블 존재, 2순위)
- EPIC 7: 기술/운영 최소 요건 (agentConfig 존재, 3순위)
- 기존 Venture Sprint 기능 변경 (유지)
- 기존 Dashboard 9개 탭 구조 변경 (유지)

---

## 3. Requirements — 기존 기능 매핑

### 3.1 Functional Requirements

| ID | 요구사항 (BD팀 티켓) | 우선순위 | 기존 기능 | 작업 유형 | 상태 |
|----|---------------------|---------|----------|----------|------|
| **EPIC 1: 시장 소스 수집 & 요약** |||||
| FR-01 | T1-1. 관심 주제 기반 소스 수집 설정 | High | `radarSources` 테이블 + `/radar` UI | **수정** | Pending |
| FR-02 | T1-2. 소스 리스트 저장 및 상태 관리 | High | `radarItems` 테이블 (COLLECTED/SCORED/SEEDED) | **수정** | Pending |
| FR-03 | T1-3. 소스 클릭 시 즉시 요약 생성 | High | `radarItems.summaryKo` + GPT-4o-mini 스코어링 | **확장** | Pending |
| **EPIC 2: 개인 Workspace 탐색** |||||
| FR-04 | T2-1. 소스 기반 대화 시작 | High | `api.chat.ts` + Agent 시스템 | **확장** | Pending |
| FR-05 | T2-2. 연관 소스 추천 | High | Vectorize Embeddings + `api.similar-seeds.ts` | **확장** | Pending |
| FR-06 | T2-3. Workspace 히스토리 관리 | Medium | `conversations` + `messages` 테이블 | **재사용** | Pending |
| **EPIC 3: 아이디어 후보 생성** |||||
| FR-07 | T3-1. 아이디어 후보 자동 생성 | High | Agent `create_discovery` 도구 | **확장** | Pending |
| FR-08 | T3-2. 아이디어 후보 선택 | High | `promote_discovery` + `transition_stage` | **수정** | Pending |
| **EPIC 4: 아이디어 공통 템플릿** |||||
| FR-09 | T4-1. 아이디어 템플릿 자동 채움 | High | Discovery 필드 (hypothesis, evidence, tags) | **확장** | Pending |
| FR-10 | T4-2. 아이디어 템플릿 수동 수정 | Medium | `discoveries.$id.edit.tsx` | **수정** | Pending |
| **EPIC 6: 기본 UI 구조** |||||
| FR-11 | T6-1. 메인 작업 화면 (3-Pane) | High | `_index.tsx` (ChatPanel + ContextPanel) | **수정** | Pending |
| FR-12 | T6-2. 팀 논의 화면 | Low | 없음 (EPIC 5와 함께 2순위) | **신규** | Pending |

### 3.2 작업 유형 요약

| 유형 | 건수 | 비율 | 설명 |
|------|------|------|------|
| **재사용** (as-is) | 1 | 8% | 기존 기능 그대로 사용 |
| **수정** (modify) | 5 | 42% | 기존 기능에 필드/상태 추가 |
| **확장** (extend) | 5 | 42% | 기존 기능 위에 새 로직 추가 |
| **신규** (new) | 1 | 8% | 완전 신규 구현 |

---

## 4. 리팩토링 상세 계획

### 4.1 EPIC 1: 시장 소스 수집 & 요약 — Radar 리팩토링

#### FR-01: 관심 주제 기반 소스 수집 설정

**현재 상태**:
- `radarSources` 테이블: id, name, sourceType(RSS/Web/YouTube), url, enabled
- `/radar` UI: 소스 추가 폼 (이름, 유형, URL) + 소스 테이블
- 전역 소스 (사용자 구분 없음)

**리팩토링 내용**:
| 항목 | 현재 | 변경 | 파일 |
|------|------|------|------|
| 사용자별 키워드/태그 | 없음 | `radarSources`에 `userId`, `keywords`(JSON), `tags`(JSON) 컬럼 추가 | `app/db/schema.ts` |
| RSS/URL 입력 | 이름+유형+URL | 키워드 태그 입력 추가 | `app/routes/radar.tsx` |
| 사용자별 분리 | 전역 | userId로 필터링 | `app/routes/api.radar.sources.ts` |

#### FR-02: 소스 리스트 저장 및 상태 관리

**현재 상태**:
- `radarItems` 상태: COLLECTED → SCORED → SEEDED / SKIPPED
- 시간순 정렬 있음

**리팩토링 내용**:
| 항목 | 현재 | 변경 | 파일 |
|------|------|------|------|
| 상태 값 | COLLECTED/SCORED/SEEDED/SKIPPED | New/Viewed/Archived 추가 (사용자 관점 상태) | `app/db/schema.ts` |
| 사용자 상태 | 없음 | `radarItemUserStatus` 조인 테이블 신설 (userId, itemId, status, viewedAt) | `app/db/schema.ts` |
| 정렬 | 시간순 있음 | 그대로 유지 | - |

#### FR-03: 소스 클릭 시 즉시 요약 생성

**현재 상태**:
- `radarItems.summaryKo`: Radar 실행 시 GPT-4o-mini로 생성된 요약 (1줄)
- 핵심 포인트 없음
- 원문 링크(`url`) 있음

**리팩토링 내용**:
| 항목 | 현재 | 변경 | 파일 |
|------|------|------|------|
| 한 줄 요약 | `summaryKo` 존재 | 그대로 사용 | - |
| 핵심 포인트 3~5개 | 없음 | `radarItems.keyPoints`(JSON) 컬럼 추가, Radar 스코어링 시 함께 생성 | `app/db/schema.ts`, `app/routes/api.radar.trigger.ts` |
| 원문 링크 | `url` 존재 | 그대로 사용 | - |
| 클릭 시 즉시 생성 | 배치 생성 | 미생성 시 온디맨드 API 추가 | `app/routes/api.radar.summarize.ts` (신규) |

---

### 4.2 EPIC 2: 개인 Workspace 탐색 — 채팅 확장

#### FR-04: 소스 기반 대화 시작

**현재 상태**:
- Agent 채팅: SSE 스트리밍, 45개 도구, 대화 컨텍스트 유지
- `get_radar_items` 도구로 Radar 아이템 조회 가능
- 소스 → 대화 직접 연결 없음

**리팩토링 내용**:
| 항목 | 현재 | 변경 | 파일 |
|------|------|------|------|
| 소스→대화 연결 | 없음 | Radar 아이템 UI에 "대화 시작" 버튼 추가, 클릭 시 소스 컨텍스트를 initial message로 주입 | `app/routes/radar.tsx`, `app/routes/_index.tsx` |
| 대화 컨텍스트 | 일반 대화 | `conversations` 테이블에 `sourceItemId` 컬럼 추가, 소스 연결 대화 구분 | `app/db/schema.ts` |
| Agent 프롬프트 | 범용 | 소스 컨텍스트 시 "이 소스를 분석하고 사업 기회를 탐색합니다" 프롬프트 추가 | `app/lib/agent/system-prompt.ts` |

#### FR-05: 연관 소스 추천

**현재 상태**:
- Vectorize 인덱스 2개: `dx-discovery-embeddings`, `dx-evidence-embeddings`
- `api.similar-seeds.ts`: Discovery 기반 유사 검색 (score >= 0.7)
- Radar 아이템은 Embeddings 미연동

**리팩토링 내용**:
| 항목 | 현재 | 변경 | 파일 |
|------|------|------|------|
| Radar Embeddings | 없음 | Radar 아이템도 Embedding 동기화 (기존 Cron 확장) | `app/routes/api.cron.embeddings.ts` |
| Vectorize 인덱스 | Discovery/Evidence만 | `dx-radar-embeddings` 인덱스 추가 | `wrangler.toml` |
| 연관 추천 API | Discovery 기반만 | Radar 아이템 기반 유사 검색 API | `app/routes/api.similar-sources.ts` (신규) |
| 추천 UI | 없음 | 소스 상세 뷰에 "연관 소스 3개" 카드 표시 | `app/routes/radar.tsx` |

#### FR-06: Workspace 히스토리 관리

**현재 상태**: `conversations` + `messages` 테이블, ConversationList UI **→ 그대로 재사용**

추가 작업: 소스 연결 대화에 소스 제목 배지 표시 (ConversationList에서)

---

### 4.3 EPIC 3: 아이디어 후보 생성 — Agent 도구 확장

#### FR-07: 아이디어 후보 자동 생성

**현재 상태**:
- `create_discovery` 도구: 1개씩 생성
- Agent가 대화 중 Discovery 생성 가능

**리팩토링 내용**:
| 항목 | 현재 | 변경 | 파일 |
|------|------|------|------|
| 후보 생성 | 1개씩 | `generate_idea_candidates` 도구 신규 (최대 3개 후보, 제목+요약 반환) | `app/lib/agent/tools/discovery-tools.ts` |
| 후보 저장 | 없음 | `discoveries` 테이블에 `candidateGroupId` 컬럼 추가, 같은 그룹의 후보 연결 | `app/db/schema.ts` |
| UI 표시 | 없음 | 채팅 내 후보 카드 3개 표시 (선택 버튼 포함) | `app/components/chat/IdeaCandidateCards.tsx` (신규) |

#### FR-08: 아이디어 후보 선택

**현재 상태**:
- `promote_discovery`: DISCOVERY → IDEA_CARD 승격
- `transition_stage`: 상태 전환

**리팩토링 내용**:
| 항목 | 현재 | 변경 | 파일 |
|------|------|------|------|
| 선택 흐름 | 수동 승격 | 후보 카드에서 "선택" → 자동으로 IDEA_CARD 승격 + 미선택 후보 DROP | `app/lib/agent/tools/discovery-tools.ts` |
| Agent 연동 | 없음 | `select_idea_candidate` 도구 신규 (candidateGroupId로 선택/미선택 처리) | `app/lib/agent/tool-registry.ts` |

---

### 4.4 EPIC 4: 아이디어 공통 템플릿 — Discovery 필드 매핑

#### FR-09: 아이디어 템플릿 자동 채움

**현재 Discovery 필드 → BD팀 템플릿 매핑**:

| BD팀 필수 항목 | Discovery 기존 필드 | 매핑 상태 | 작업 |
|-------------|------------------|----------|------|
| 가설 | `discoveries.hypothesis` (HYPOTHESIS 단계 이후) | **직접 매핑** | 없음 |
| 근거 (링크 포함) | `evidence` 테이블 (type, strength, content, sourceUrl) | **직접 매핑** | 없음 |
| 타겟 | 없음 (ontology "고객 세그먼트" 노드로 간접) | **신규 필드** | `targetSegment` 컬럼 추가 |
| 가치 제안 | 없음 | **신규 필드** | `valueProposition` 컬럼 추가 |

**리팩토링 내용**:
| 항목 | 현재 | 변경 | 파일 |
|------|------|------|------|
| 템플릿 필드 | hypothesis + evidence | `targetSegment`, `valueProposition` 컬럼 추가 | `app/db/schema.ts` |
| 자동 채움 | 없음 | Agent `auto_fill_template` 도구 신규 (소스+대화 컨텍스트에서 4개 필드 자동 생성) | `app/lib/agent/tools/discovery-tools.ts` |
| 템플릿 UI | Discovery 상세 (분산) | IDEA_CARD 상태에 템플릿 뷰 섹션 추가 (4개 필드 한눈에) | `app/routes/discoveries.$id.tsx` |

#### FR-10: 아이디어 템플릿 수동 수정

**현재 상태**: `discoveries.$id.edit.tsx` 편집 폼 존재 **→ 신규 필드만 폼에 추가**

---

### 4.5 EPIC 6: 기본 UI 구조 — 레이아웃 리팩토링

#### FR-11: 메인 작업 화면 (3-Pane)

**현재 상태**:
- TopNav (상단 고정): Dashboard / 시장 탐색 / 사업 발굴 / 수집 관리
- `_index.tsx`: ChatPanel + ContextPanel (2-pane)
- 소스/히스토리 패널 없음

**BD팀 요구 3-Pane**: 좌(소스/히스토리) + 중(대화) + 우(요약/아이디어)

**리팩토링 내용**:
| 항목 | 현재 | 변경 | 파일 |
|------|------|------|------|
| 메인 레이아웃 | 2-pane (Chat + Context) | 3-pane (Source + Chat + Summary) | `app/routes/_index.tsx` |
| 좌측 패널 | ConversationList만 | 소스 목록 + 대화 히스토리 탭 전환 | `app/components/chat/SourcePanel.tsx` (신규) |
| 중앙 패널 | ChatPanel | 그대로 유지 | - |
| 우측 패널 | ContextPanel (도구 결과) | 소스 요약 + 아이디어 후보 + 템플릿 미리보기 | `app/components/chat/SummaryPanel.tsx` (신규) |

#### TopNav 메뉴 리팩토링

**현재 메뉴 → BD팀 관점 재배치**:

| 현재 메뉴 | 경로 | BD팀 용도 | 변경 |
|----------|------|----------|------|
| 대시보드 | `/dashboard` | 파이프라인 현황 | 유지 (라벨: "현황판") |
| 시장 탐색 | `/radar` | **EPIC 1 핵심** | 유지 (소스 설정 페이지) |
| 사업 발굴 | `/discoveries` | **EPIC 3, 4 핵심** | 유지 (라벨: "아이디어") |
| 수집 관리 | `/settings` | **EPIC 7** | 유지 |
| (없음) | `/` | **EPIC 2, 6 핵심** (메인 작업 화면) | 3-Pane Workspace가 메인 |

---

## 5. 구현 우선순위 & 단계

### Phase 1: DB 스키마 확장 (Day 1-2)

| 작업 | 테이블 | 변경 내용 |
|------|--------|----------|
| 1-1 | `radarSources` | `userId`, `keywords`(JSON), `tags`(JSON) 추가 |
| 1-2 | `radarItems` | `keyPoints`(JSON) 추가 |
| 1-3 | 신규 `radarItemUserStatus` | userId, itemId, status(new/viewed/archived), viewedAt |
| 1-4 | `conversations` | `sourceItemId` (nullable FK) 추가 |
| 1-5 | `discoveries` | `targetSegment`, `valueProposition`, `candidateGroupId` 추가 |
| 1-6 | Drizzle 마이그레이션 생성 + 적용 | `pnpm db:generate && pnpm db:migrate` |
| 1-7 | 테스트 헬퍼 업데이트 | `tests/helpers/db.ts`에 마이그레이션 SQL 추가 |

### Phase 2: Radar 리팩토링 (Day 3-5)

| 작업 | 파일 | 내용 |
|------|------|------|
| 2-1 | `app/routes/radar.tsx` | 키워드/태그 입력 UI + 사용자별 필터 |
| 2-2 | `app/routes/api.radar.sources.ts` | userId 필터링 로직 |
| 2-3 | `app/routes/api.radar.trigger.ts` | keyPoints 생성 로직 추가 (GPT 프롬프트 확장) |
| 2-4 | `app/routes/api.radar.summarize.ts` | 온디맨드 요약 생성 API (신규) |
| 2-5 | `app/routes/radar.tsx` | 소스 아이템에 상태(New/Viewed/Archived) + 요약 뷰 |

### Phase 3: 채팅 확장 — 소스 연결 (Day 6-8)

| 작업 | 파일 | 내용 |
|------|------|------|
| 3-1 | `app/routes/radar.tsx` | "대화 시작" 버튼 추가 |
| 3-2 | `app/routes/_index.tsx` | sourceItemId 쿼리 파라미터로 소스 컨텍스트 주입 |
| 3-3 | `app/lib/agent/system-prompt.ts` | 소스 컨텍스트 모드 프롬프트 |
| 3-4 | `app/routes/api.cron.embeddings.ts` | Radar 아이템 Embedding 동기화 추가 |
| 3-5 | `app/routes/api.similar-sources.ts` | 연관 소스 추천 API (신규) |
| 3-6 | `app/routes/radar.tsx` | 연관 소스 3개 카드 표시 |

### Phase 4: 아이디어 후보 생성 & 템플릿 (Day 9-11)

| 작업 | 파일 | 내용 |
|------|------|------|
| 4-1 | `app/lib/agent/tools/discovery-tools.ts` | `generate_idea_candidates` 도구 |
| 4-2 | `app/lib/agent/tools/discovery-tools.ts` | `select_idea_candidate` 도구 |
| 4-3 | `app/lib/agent/tools/discovery-tools.ts` | `auto_fill_template` 도구 |
| 4-4 | `app/lib/agent/tool-registry.ts` | 신규 3개 도구 등록 |
| 4-5 | `app/components/chat/IdeaCandidateCards.tsx` | 후보 카드 UI (신규) |
| 4-6 | `app/routes/discoveries.$id.tsx` | IDEA_CARD 상태 템플릿 뷰 섹션 |
| 4-7 | `app/routes/discoveries_.$id.edit.tsx` | targetSegment, valueProposition 폼 필드 |

### Phase 5: 3-Pane 레이아웃 (Day 12-14)

| 작업 | 파일 | 내용 |
|------|------|------|
| 5-1 | `app/components/chat/SourcePanel.tsx` | 좌측 패널 (소스 탭 + 히스토리 탭) (신규) |
| 5-2 | `app/components/chat/SummaryPanel.tsx` | 우측 패널 (요약 + 후보 + 템플릿) (신규) |
| 5-3 | `app/routes/_index.tsx` | 3-Pane 레이아웃 조합 |
| 5-4 | TopNav 라벨 조정 | "사업 발굴" → "아이디어", "대시보드" → "현황판" |

---

## 6. Success Criteria

### 6.1 Definition of Done

- [ ] EPIC 1: Radar에서 사용자별 키워드/태그로 소스 수집, New/Viewed/Archived 상태 관리, 클릭 시 한줄 요약 + 핵심 포인트 3~5개 표시
- [ ] EPIC 2: 소스에서 "대화 시작" → 소스 컨텍스트 유지 대화, 연관 소스 3개 이상 추천, 대화 히스토리 재진입
- [ ] EPIC 3: Agent가 아이디어 후보 최대 3개 생성, 1개 선택 시 IDEA_CARD 승격
- [ ] EPIC 4: 가설/근거/타겟/가치 제안 4개 필드 자동 채움, 수동 편집 가능
- [ ] EPIC 6: 3-Pane 레이아웃 (좌: 소스/히스토리, 중: 대화, 우: 요약/아이디어)

### 6.2 Quality Criteria

- [ ] 기존 테스트 561개 통과 유지
- [ ] 신규 기능 테스트 추가
- [ ] Zero lint errors
- [ ] Build 성공
- [ ] 프로덕션 배포 (dx.minu.best)

---

## 7. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| DB 스키마 변경으로 기존 데이터 깨짐 | High | Low | 마이그레이션은 ADD COLUMN만 사용 (breaking change 없음) |
| Radar 사용자별 분리 시 기존 전역 소스 고아 | Medium | Medium | 마이그레이션 시 기존 소스에 admin userId 할당 |
| 3-Pane 레이아웃이 모바일에서 깨짐 | Medium | High | 모바일은 탭 전환 방식으로 대응 (responsive) |
| Agent 도구 3개 추가로 tool_use 선택 정확도 저하 | Low | Low | 도구 설명 명확화 + 자율도 레벨로 제어 |
| Vectorize 인덱스 추가 비용 | Low | Low | 기존 인덱스와 동일 규격 (1536 cosine) |

---

## 8. Architecture Considerations

### 8.1 Project Level Selection

| Level | Characteristics | Selected |
|-------|-----------------|:--------:|
| **Dynamic** | Feature-based modules, services layer | **O** |

기존 Discovery-X가 Dynamic 레벨이므로 동일하게 유지.

### 8.2 Key Architectural Decisions

| Decision | 현재 선택 | 유지 여부 | 비고 |
|----------|----------|----------|------|
| Framework | Remix v2 (Vite) | 유지 | - |
| State Management | URL + Loader/Action | 유지 | - |
| AI Chat | Claude API (tool_use, SSE) | 유지 | 도구 3개 추가 |
| AI Scoring | GPT-4o-mini | 유지 | keyPoints 생성 추가 |
| Embeddings | OpenAI + Vectorize | 유지 | Radar 인덱스 추가 |
| Styling | Tailwind 4 + @axis-ds | 유지 | - |
| Testing | Vitest + Playwright | 유지 | - |

---

## 9. 변경 대상 파일 요약

### 수정 파일 (14개)

| 파일 | 변경 내용 |
|------|----------|
| `app/db/schema.ts` | 컬럼 추가 (5개 테이블) + 신규 테이블 1개 |
| `app/db/seed.ts` | 신규 필드 기본값 (필요 시) |
| `app/routes/radar.tsx` | 키워드/태그 UI, 상태 관리, 대화 시작 버튼, 연관 소스 |
| `app/routes/api.radar.sources.ts` | userId 필터링 |
| `app/routes/api.radar.trigger.ts` | keyPoints 생성 프롬프트 |
| `app/routes/_index.tsx` | 3-Pane 레이아웃, sourceItemId 주입 |
| `app/routes/api.cron.embeddings.ts` | Radar 아이템 Embedding |
| `app/routes/discoveries.$id.tsx` | 템플릿 뷰 섹션 |
| `app/routes/discoveries_.$id.edit.tsx` | 신규 필드 폼 |
| `app/lib/agent/tools/discovery-tools.ts` | 도구 3개 추가 |
| `app/lib/agent/tool-registry.ts` | 도구 등록 |
| `app/lib/agent/system-prompt.ts` | 소스 컨텍스트 프롬프트 |
| `app/components/layout/TopNav.tsx` | 메뉴 라벨 조정 |
| `tests/helpers/db.ts` | 마이그레이션 SQL |

### 신규 파일 (4개)

| 파일 | 역할 |
|------|------|
| `app/routes/api.radar.summarize.ts` | 온디맨드 요약 생성 API |
| `app/routes/api.similar-sources.ts` | 연관 소스 추천 API |
| `app/components/chat/SourcePanel.tsx` | 3-Pane 좌측 패널 |
| `app/components/chat/SummaryPanel.tsx` | 3-Pane 우측 패널 |
| `app/components/chat/IdeaCandidateCards.tsx` | 아이디어 후보 카드 UI |

### 설정 파일 (1개)

| 파일 | 변경 내용 |
|------|----------|
| `wrangler.toml` | `VECTORIZE_RADAR` 바인딩 추가 |

---

## 10. Next Steps

1. [ ] 이 Plan 문서 리뷰 및 승인
2. [ ] Design 문서 작성 (`/pdca design ax-bd-poc`)
3. [ ] Phase 1: DB 스키마 확장 착수
4. [ ] Phase 2~5: 순차 구현

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-09 | Initial draft — 기존 기능 매핑 기반 리팩토링 계획 | Claude |
