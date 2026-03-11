# PRD Studio PRD

**버전:** v8 (pm-skills 통합, 일정 리스크 해소)
**날짜:** 2026-03-12
**작성자:** AX BD팀
**상태:** 🔄 검토 중

---

## 1. 요약

**한 줄 정의:**
Discovery-X 앱 내에서 pm-skills 프레임워크 기반 대화형 인터뷰 → PRD 자동 생성 → AI 다중 검토 → 피드백 반영 → 착수 판단까지 수행하는 웹 UI + CLI 하이브리드 기능.

**배경:**
CLI 전용 인터뷰 스킬의 접근성 한계 + 아이디어 분석에 체계적 PM 프레임워크 부재. [phuryn/pm-skills](https://github.com/phuryn/pm-skills) (MIT, 65스킬/8플러그인)를 커스터마이즈하여 CLI + 웹 양쪽에 적용.

**목표:** CLI pm-skills 도입 + 웹 PRD Studio + 아이디어 분석 대체 + 전략 도구 추가.

---

## 2. 문제 → 해결 → 측정 (Traceability)

| # | 문제 | 해결 | KPI |
|---|------|------|-----|
| P1 | CLI 전용 → 비개발자 접근 불가 | 웹 PRD Studio | 비개발자 PRD 팀원당 1+/분기 |
| P2 | 아이디어 분석 프레임워크 불일관 | pm-skills로 점진적 대체 | 분석 섹션 완성도 |
| P3 | Strategy/GTM/OKR 도구 부재 | pm-skills 4개 플러그인 | CLI 사용 주 3+회 |
| P4 | 검토 결과 로컬 파일 | DB + 웹 뷰어 | 검토 완주율 90%+ |

---

## 3. pm-skills 통합 아키텍처

### 3.1 SKILL.md → 웹 프롬프트 변환 파이프라인

pm-skills의 각 SKILL.md는 표준 구조를 가짐:
```
---
name: {skill-name}
description: "..."
---
# Title
## Instructions (시스템 프롬프트)
## Input Requirements (사용자에게 수집할 정보)
## Template (출력 포맷)
## Output Process (단계별 진행)
```

**변환 방식:**
1. SKILL.md를 빌드 시 파싱 → `pm-prompts/` 디렉토리에 JSON으로 변환
   ```json
   {
     "name": "market-sizing",
     "systemPrompt": "## Instructions 섹션 내용",
     "inputFields": ["Product description", "Target market", ...],
     "outputTemplate": "## Template 섹션 내용",
     "category": "market-research"
   }
   ```
2. 웹 API에서 JSON을 로드 → AI API 호출 시 system/user prompt로 조합
3. **기존 아이디어 분석 교체**: `analyzer.ts`의 카테고리별 프롬프트를 pm-prompts JSON으로 교체

**이점:** SKILL.md 원본을 수정하면 CLI(직접 참조)와 웹(JSON 변환) 모두 반영.

### 3.2 매핑 (신규 + 대체 + 유지)

**신규 도입:**
| 플러그인 | 핵심 스킬 | 적용 |
|---------|-----------|------|
| pm-product-strategy | product-strategy, value-proposition, pricing | CLI + 사업제안 |
| pm-execution | create-prd, okrs, sprint, retro, pre-mortem | CLI + PRD Studio |
| pm-go-to-market | gtm-strategy, beachhead, ICP, growth-loops | CLI + 사업제안 |
| pm-market-research | competitor-analysis, market-sizing, user-personas | CLI + 아이디어 |

**대체 (2차):** 시장조사 → market-sizing, 고객조사 → user-personas, BMC → business-model, SWOT → swot-analysis, 린캔버스 → lean-canvas, PESTEL → pestle-analysis

**유지 (Discovery-X 고유):** 비판적 사고, 사업성 평가, 차별화, 규제, 산업별 사례

---

## 4. 사용자 여정

### 4.1 웹 PRD Studio (비개발자)
```
아이디어 상세/"새 PRD" → 온보딩(최초 3단계 스포트라이트)
→ 인터뷰 (pm-skills create-prd 8섹션, 예시 접힘, 진행률, 중간 저장)
→ PRD v1 자동 생성 → 편집
→ "AI 검토" (전송 고지) → 모델별 진행 뱃지
→ 피드백 뷰어 + 스코어카드 → 수정/재검토/착수
```

### 4.2 비개발자 UX
- 온보딩 3단계 / 예시 답변 접힘 / 8섹션 프로그레스 바 / 중간 저장(DB) / FAQ / @axis-ds WCAG AA

### 4.3 이탈 분석 이벤트
`interview_start` → `section_complete(1~8)` → `abandon/prd_generated` → `review_start/complete` → `prd_finalized`

---

## 5. 기능 범위 + 독립 배포 단위

### Phase 1: CLI 적용 (독립 배포 가능 ✅) — 2일
| # | 작업 | 산출물 |
|---|------|--------|
| 1 | pm-skills 4개 플러그인 설치 | 동작 확인 |
| 2 | Discovery-X 맥락 커스터마이즈 | CLAUDE.md 연동 |
| 3 | PRD 템플릿 8섹션 통일 | `ax-14-req-interview` 템플릿 교체 |

> Phase 1 완료 시 CLI에서 `/strategy`, `/write-prd` 등 즉시 사용 가능. **웹과 독립.**

### Phase 2: 웹 PRD Studio 기반 (독립 배포 가능 ✅) — 16일
| 단계 | 범위 | 기간 | 실적 근거 |
|------|------|------|-----------|
| 2-1 | DB 스키마 + AI 병렬 PoC | 3일 | F40 cost 스키마 12테이블 = 2세션 |
| 2-2 | 인터뷰 UI + 온보딩 + 중간 저장 | 5일 | F29 요구사항 UI(카드뷰+필터+DnD) = 4세션 |
| 2-3 | 검토 API + 피드백 뷰어 + 스코어카드 | 4일 | F35 슬라이드 Agent API+UI = 6세션(디자인 반복 포함) |
| 2-4 | PRD 편집기 + 버전 관리 + 목록 | 2일 | 기존 마크다운 렌더링 + DB CRUD 패턴 |
| 2-5 | UX 검증(비개발자 1명) + UAT(3명+) + 버그 수정 | 2일 | F38 데모 시나리오 = 1세션 |

> Phase 2 완료 시 Feature Flag `PRD_STUDIO_ENABLED=true`로 배포. Phase 3/4와 독립.

### Phase 3: 아이디어 분석 대체 (독립 배포 가능 ✅) — 4일
| # | 작업 |
|---|------|
| 1 | pm-prompts/ JSON 변환 파이프라인 구축 |
| 2 | analyzer.ts 프롬프트 6종 교체 (market-sizing, user-personas, swot, bmc, lean-canvas, pestle) |
| 3 | 교체 전후 분석 결과 비교 테스트 |

> Phase 3은 기존 아이디어 분석 페이지의 프롬프트만 교체. UI 변경 없음.

### Phase 4: 전략 도구 (독립 배포 가능 ✅) — 5일
Strategy Canvas + GTM 웹 UI + 사업제안 연동

**합계: 27일 (~5.5주)**

### 1인 개발 일정 리스크 해소

| 우려 | 대응 |
|------|------|
| 27일이 과다 | **각 Phase가 독립 배포 가능** — Phase 1(2일)만으로도 가치 전달, Phase 2까지면 MVP 완성. Phase 3/4는 별도 F항목으로 분리 가능 |
| 1인이 전체 담당 | 테스트는 **기존 패턴 재사용** (Vitest+D1 mock, 기존 153개 테스트 파일 구조). 새 테스트 코드 비율 < 30% |
| 일정 초과 시 | Phase 2까지 MVP로 배포 → Phase 3/4는 다음 마일스톤으로 이월. **기능 축소 없이 시기만 조정** |
| 예상외 기술 이슈 | Phase 2-1에서 AI 병렬 PoC로 사전 검증. 기존 `api.ideas.$id.analyze.ts` SSE 패턴 100% 재사용 — 신규 인프라 0 |

### 제외
외부 공개 / 실시간 협업 / 모바일 전용 / pm-data-analytics / pm-marketing-growth

---

## 6. 성공 기준

### 6.1 KPI
| 지표 | 현재 | 목표 | 측정 | 문제 |
|------|------|------|------|------|
| 비개발자 PRD | 0건 | 팀원당 1+/분기 | DB | P1 |
| CLI PM 스킬 | 0 | 주 3+회 | 로그 | P3 |
| 완주율 | - | 80%+ | abandon | P1 |
| 검토 완주율 | 50% | 90%+ | review_complete | P4 |
| 만족도 | - | 긍정 70%+ | 평점 | P1 |

### 6.2 MVP (Phase 1+2)
- [ ] CLI pm-skills 4개 플러그인 동작
- [ ] 웹 인터뷰 8섹션 + 중간 저장 + 온보딩
- [ ] PRD 생성 + 편집 (pm-skills 8섹션)
- [ ] AI 검토 + 스코어카드 + 이탈 로깅

### 6.3 실패 + 개선 루프
| 조건 | 개선 | 중단 |
|------|------|------|
| 3개월 비개발자 미사용 | 1:1 인터뷰→UX 개선 | 개선 후 1개월 미사용 |
| API $30+/월 | mini 다운그레이드 | 다운그레이드 후 초과 |
| 완주율 50% 미만 | 이탈 분석→UX 개선 | 2회 개선 후 미달 |

---

## 7. 제약

### 7.1 기술 리스크 + 장애 대응
| 리스크 | 대응 | Fallback |
|--------|------|----------|
| AI 30초 타임아웃 | `Promise.allSettled` + 25초 | 부분 성공 |
| AI API 장애 | 4단계 fallback | radar-worker 패턴 |
| SSE 끊김 | 폴링 30초 | status API |
| 비용 초과 | 80% 알림 | budget_policies |

### 7.2 테스트/QA
| 단계 | 내용 | 시점 |
|------|------|------|
| 단위 | 인터뷰 상태머신, PRD 생성, 스코어카드 | Phase 2 |
| PoC | CLI vs 웹 동일 PRD 비교 | Phase 2-1 |
| UX | 비개발자 1명 | Phase 2-5 |
| UAT | 팀원 3명+ | Phase 2-5 |
| 프롬프트 | pm-skills 교체 전후 비교 | Phase 3 |

### 7.3 배포: Feature Flag / 프리뷰 / 즉시 비활성화
### 7.4 보안: 전송 고지 / 작성 지침 / 서버사이드 전용 / cascade 삭제
### 7.5 인력: 1명 — Escalation: BD팀 리더 / API: 월 $30 미만

---

## 8. 오픈 이슈

| # | 이슈 | 마감 |
|---|------|------|
| 1 | pm-skills 8섹션 vs 기존 7섹션 템플릿 통합 | Phase 1 |
| 2 | DB 스키마 확정 | Phase 2-1 |
| 3 | 기존 분석 결과 마이그레이션 필요 여부 | Phase 3 |

---

## 9. 검토 이력

| 라운드 | 변경사항 | 스코어 |
|--------|---------|--------|
| v1~v5 | 기본 PRD Studio 5회 AI 검토 | 92→82→82→62→64 |
| v6 | pm-skills 통합 재설계 | 82 |
| v7 | Traceability, QA, UX, 온보딩 복원 | 62 |
| v8 | **일정 리스크 해소**: 실적 근거 산정 + 독립 배포 단위 + 축소 전략 + SKILL.md 변환 파이프라인 설계 | - |
