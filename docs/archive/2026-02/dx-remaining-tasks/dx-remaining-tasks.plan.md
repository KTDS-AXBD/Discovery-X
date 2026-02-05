# Plan: Discovery-X 잔여 작업 (F6~F10)

> **Feature**: dx-remaining-tasks
> **Created**: 2026-02-04
> **Phase**: Plan
> **Priority**: P2 (운영 실험 피드백 기반 선택적 구현)
> **Source**: SPEC.md §6 미래 작업

---

## 1. Background

Discovery-X v4.6까지 모든 P0/P1 기능이 구현 완료되었고, 프로덕션 배포 및 운영 실험이 진행 중이다 (2026-01-31 시작). SPEC.md §6에 기록된 5개의 P2 미래 작업(F6~F10)에 대한 구현 계획을 수립한다.

**전제 조건**: 운영 실험 피드백에 따라 우선순위가 조정될 수 있으며, 모든 항목은 선택적이다.

---

## 2. Task Summary

| ID | 제목 | 유형 | 예상 수정 파일 | 의존성 |
|----|------|------|:------------:|--------|
| F6 | 응답 요약 헤더 | Agent UX | 2 | 없음 |
| F7 | Experiment 타임라인 간트차트 | UI 컴포넌트 | 2 (1 신규) | 없음 |
| F8 | Discovery 비교 테이블 도구 | Agent 도구 | 3 | 없음 |
| F9 | Discovery 태그 시스템 | DB + Agent 도구 | 5+ | 마이그레이션 |
| F10 | 관련 Discovery 추천 | UI + Vectorize | 3 (1 신규) | Embeddings 인프라 (완료) |

---

## 3. Detailed Plans

### F6: 응답 요약 헤더

**목적**: 500자 이상의 AI 응답에 1-2줄 요약을 상단에 표시하여 빠른 파악 지원

**구현 접근**:
- `app/lib/agent/executor.ts` — 응답 텍스트가 500자 초과 시, 응답 상단에 `> **요약**: ...` 형태의 마크다운 blockquote 자동 삽입
- 요약 생성 방식: Claude API 응답의 첫 번째 문장 추출 (추가 API 호출 없이)
- `app/components/chat/MessageBubble.tsx` — `StructuredMessage`에서 blockquote를 요약 스타일로 렌더링

**수정 파일**:
1. `app/lib/agent/executor.ts` (~15줄 추가) — 응답 후처리에서 요약 삽입
2. `app/components/chat/MessageBubble.tsx` (~15줄 추가) — 요약 blockquote 스타일링

**구현 규칙**:
- 추가 API 호출 금지 (비용/지연 없이 텍스트 처리만)
- 도구 실행 결과가 아닌 자연어 응답에만 적용
- 500자 미만 응답은 그대로 유지

---

### F7: Experiment 타임라인 간트차트

**목적**: Discovery 상세 페이지에서 실험 일정과 진행 상태를 시각적으로 표시

**구현 접근**:
- 새 SVG 차트 컴포넌트: `app/components/charts/ExperimentGantt.tsx`
- 기존 차트 패턴 활용 (WeeklyBar.tsx의 SVG 기반 구현 참고)
- experiments 배열을 입력받아 시간축 기반 가로 막대로 렌더링

**수정 파일**:
1. `app/components/charts/ExperimentGantt.tsx` (신규, ~80줄) — SVG 간트차트
2. `app/routes/discoveries.$id.tsx` (~10줄 추가) — 실험 섹션에 차트 삽입

**DB 활용 필드** (기존, 변경 없음):
- `experiments.createdAt` — 실험 시작일
- `experiments.deadline` — 마감일
- `experiments.updatedAt` — 마지막 활동일
- `experiments.status` — 진행 상태 (색상 코딩)

**구현 규칙**:
- 외부 차트 라이브러리 미사용 (기존 SVG 패턴 유지)
- 반응형: 모바일에서는 세로 타임라인으로 전환
- 다크모드 토큰 사용 (dx-surface-card, dx-border-subtle)

---

### F8: Discovery 비교 테이블 도구

**목적**: Agent 채팅에서 여러 Discovery를 나란히 비교하는 테이블 생성

**구현 접근**:
- Agent 도구로 추가 (46번째 도구)
- 입력: discoveryId 배열 (2~5개)
- 출력: 마크다운 비교 테이블 (title, status, stage, owner, evidence 등)

**수정 파일**:
1. `app/lib/agent/tools/query-tools.ts` (~30줄 추가) — `compareDiscoveries` 함수
2. `app/lib/agent/tool-registry.ts` (~15줄 추가) — 도구 정의
3. `app/lib/agent/executor.ts` (~3줄 추가) — executeTool case 추가

**도구 스키마**:
```
이름: compare_discoveries
설명: "여러 Discovery를 나란히 비교 테이블로 보여줍니다"
입력: { discoveryIds: string[] } (최소 2, 최대 5)
자율도: 1 (읽기 전용)
```

**구현 규칙**:
- 마크다운 테이블 형식 반환 (채팅 UI에서 자동 렌더링)
- 존재하지 않는 ID는 에러 대신 "(not found)" 표시
- 비교 항목: 제목, 상태, 단계, 소유자, 실험 수, 근거 수, 생성일

---

### F9: Discovery 태그 시스템

**목적**: Discovery에 태그를 추가하여 분류/검색 개선 + Agent 자동 태깅

**구현 접근**:
- **방식 A (JSON 컬럼)**: discoveries 테이블에 `tags TEXT (JSON)` 컬럼 추가
- **방식 B (별도 테이블)**: discovery_tags 조인 테이블 생성
- **선택: 방식 A** — 5명 이하 소규모이므로 JSON 컬럼이 단순하고 충분

**수정 파일**:
1. `app/db/schema.ts` (~3줄 추가) — discoveries 테이블에 tags 필드
2. 마이그레이션 파일 (신규) — ALTER TABLE ADD COLUMN
3. `app/lib/agent/tools/discovery-tools.ts` (~40줄 추가) — `tagDiscovery`, `removeTag` 함수
4. `app/lib/agent/tool-registry.ts` (~25줄 추가) — 도구 2개 정의
5. `app/lib/agent/executor.ts` (~5줄 추가) — executeTool case 추가
6. `tests/helpers/db.ts` — 마이그레이션 SQL 추가 (필수)

**도구 스키마**:
```
이름: tag_discovery / remove_discovery_tag
설명: "Discovery에 태그를 추가/제거합니다"
입력: { discoveryId: string, tags: string[] }
자율도: 2 (수정 작업)
```

**Agent 자동 태깅**:
- Discovery 생성/업데이트 시 Agent가 자동으로 태그 제안
- system-prompt.ts에 태깅 지침 추가 (~5줄)

**구현 규칙**:
- 태그 형식: 소문자, 공백 → 하이픈, 최대 20자
- Discovery당 태그 최대 10개
- 기존 쿼리 호환: tags 필드 없는 레코드는 빈 배열로 처리

---

### F10: 관련 Discovery 추천

**목적**: Discovery 상세 페이지에서 유사한 Discovery를 자동 추천

**구현 접근**:
- 기존 Embeddings 인프라 활용 (`findSimilarDiscoveries` in embedding-service.ts)
- `api.similar-seeds.ts`의 Vectorize → FTS5 폴백 패턴 재사용
- 상세 페이지 loader에서 유사 Discovery 3~5건 조회

**수정 파일**:
1. `app/routes/discoveries.$id.tsx` (~25줄 추가) — loader에서 추천 조회 + UI 표시
2. `app/components/discovery/RelatedDiscoveries.tsx` (신규, ~50줄) — 추천 카드 컴포넌트
3. `app/lib/agent/tools/query-tools.ts` (~25줄 추가) — `getRelatedDiscoveries` 도구

**구현 규칙**:
- 추천 조회 실패 시 빈 배열 반환 (에러 표시 없음)
- 동일 Discovery 제외 (`excludeId` 파라미터)
- 유사도 점수 0.7 이상만 표시
- Vectorize 미응답 시 FTS5 폴백 (기존 패턴)

---

## 4. Implementation Order (권장)

```
F6 (응답 요약)  ─── 독립적, 가장 간단
  ↓
F8 (비교 도구)  ─── Agent 도구 패턴 학습
  ↓
F10 (추천)     ─── 기존 Embeddings 활용
  ↓
F7 (간트차트)   ─── UI 컴포넌트, 독립적
  ↓
F9 (태그)      ─── DB 마이그레이션 필요, 가장 복잡
```

**이유**:
- F6: 기존 코드 최소 변경, 즉각적인 UX 효과
- F8: DB 변경 없이 Agent 도구만 추가
- F10: 기존 인프라(Vectorize) 그대로 활용
- F7: 신규 컴포넌트이지만 DB 변경 없음
- F9: DB 마이그레이션 + 테스트 동기화 필요 → 가장 마지막

---

## 5. Risks & Constraints

| 리스크 | 영향 | 대응 |
|--------|------|------|
| F6 요약 품질 불안정 | Low | 첫 문장 추출 방식 (LLM 추가 호출 없이) |
| F7 SVG 렌더링 복잡도 | Low | 기존 WeeklyBar 패턴 재사용 |
| F9 마이그레이션 실패 | Medium | `tests/helpers/db.ts` 동기화 필수 |
| F10 Vectorize 지연 | Low | FTS5 폴백 이미 구현 |
| 운영 실험 중 DB 변경 | Medium | F9만 해당, 프로덕션 마이그레이션 주의 |

---

## 6. Validation

각 항목 완료 후:
1. `pnpm typecheck` — TypeScript 에러 0
2. `pnpm lint` — ESLint 에러 0
3. `pnpm test` — 561+ 테스트 통과
4. `pnpm build` — 빌드 성공
5. F9 한정: `pnpm db:migrate` + `tests/helpers/db.ts` 동기화

---

## 7. Success Criteria

- [ ] F6: 500자+ 응답에 요약 blockquote 자동 삽입
- [ ] F7: Discovery 상세에서 실험 간트차트 표시
- [ ] F8: Agent 채팅에서 `compare_discoveries` 도구 사용 가능
- [ ] F9: Discovery에 태그 추가/제거/조회 가능 (Agent + UI)
- [ ] F10: Discovery 상세에서 관련 Discovery 3~5건 자동 표시
