# PRD Studio PRD

**버전:** v6 (pm-skills 통합)
**날짜:** 2026-03-12
**작성자:** AX BD팀
**상태:** 🔄 검토 중

---

## 1. 요약

**한 줄 정의:**
Discovery-X 앱 내에서 pm-skills 프레임워크 기반 대화형 인터뷰 → PRD 자동 생성 → AI 다중 검토 → 피드백 반영 → 착수 판단까지 수행하는 웹 UI + CLI 하이브리드 기능.

**배경:**
CLI 전용 인터뷰 스킬의 접근성 한계에 더해, Discovery-X의 아이디어 분석(12종)과 기획 프로세스에 체계적인 PM 프레임워크가 부족하다. [phuryn/pm-skills](https://github.com/phuryn/pm-skills) (MIT, 65스킬/36워크플로우/8플러그인)를 커스터마이즈하여 CLI + 웹 UI 양쪽에 적용한다.

**목표:**
- **CLI**: pm-skills 플러그인 설치 + Discovery-X 맥락 커스터마이즈
- **웹 UI**: pm-skills 프레임워크를 PRD Studio + 아이디어 분석에 내장
- **1차**: 신규 영역 (Strategy/Execution/GTM) 도입
- **2차**: 중복 스킬 (SWOT/BMC/린캔버스 등) pm-skills 버전으로 대체

---

## 2. 문제 정의

**As-Is:**
- CLI 전용 → 비개발자(4명) 접근 불가
- 아이디어 분석 12종이 자체 프롬프트 기반 → 프레임워크 일관성 부족
- Product Strategy, GTM, OKR, Sprint 등 체계적 PM 도구 부재
- 검토 결과가 로컬 파일로만 존재

**To-Be:**
- pm-skills의 검증된 PM 프레임워크(Teresa Torres, Marty Cagan, Alberto Savoia)를 CLI + 웹 양쪽에 제공
- 인터뷰→PRD→검토→피드백→착수 웹 원스톱
- 아이디어 분석 프롬프트를 pm-skills 프레임워크로 점진적 대체
- Strategy Canvas, GTM, OKR 등 신규 도구 추가

---

## 3. pm-skills ↔ Discovery-X 매핑

### 3.1 신규 도입 (Discovery-X에 없는 영역)

| pm-skills 플러그인 | 스킬 수 | 핵심 스킬 | Discovery-X 적용 |
|-------------------|---------|-----------|-------------------|
| **pm-product-strategy** | 12 | product-strategy, value-proposition, pricing-strategy, product-vision | CLI: `/strategy`, `/pricing` / 웹: 사업제안 연동 |
| **pm-execution** | 15 | create-prd, brainstorm-okrs, sprint-plan, retro, pre-mortem, stakeholder-map | CLI: `/write-prd`, `/plan-okrs` / 웹: PRD Studio 핵심 |
| **pm-go-to-market** | 6 | gtm-strategy, beachhead-segment, ideal-customer-profile, growth-loops | CLI: `/plan-launch` / 웹: 사업제안 GTM 섹션 |
| **pm-market-research** | 7 | competitor-analysis, market-sizing, user-personas, customer-journey-map | CLI: `/competitive-analysis` / 웹: 아이디어 분석 보강 |

### 3.2 중복 대체 (2차 — 기존 프롬프트를 pm-skills로 교체)

| 기존 아이디어 분석 | pm-skills 대체 스킬 | 개선점 |
|-------------------|---------------------|--------|
| 시장 조사 | market-sizing + competitor-analysis | TAM/SAM/SOM 체계 + 경쟁사 분석 분리 |
| 고객 조사 | user-personas + customer-journey-map | 페르소나 + 여정 맵 분리 |
| BMC | business-model (9블록 전체) | 더 상세한 가이드 |
| SWOT | swot-analysis (액션 권장 포함) | 단순 매트릭스 → 실행 권고 |
| 린 캔버스 | lean-canvas | 구조화된 9섹션 |
| PESTEL | pestle-analysis | 6관점 체계화 |
| 가치 사슬 | porters-five-forces + value-proposition | 포터 5 Forces + JTBD 가치제안 |

### 3.3 유지 (Discovery-X 고유 — pm-skills에 없는 것)

| 기존 분석 | 유지 이유 |
|-----------|-----------|
| 비판적 사고 | Discovery-X 고유 프레임워크 |
| 사업성 평가 | KT DS 내부 평가 기준 커스텀 |
| 차별화 분석 | 기존 프롬프트가 도메인 특화 |
| 규제/법적 환경 | KT DS 산업별 규제 커스텀 |
| 산업별 사례 | 한국 시장 사례 특화 |

---

## 4. 사용자 여정

### 4.1 CLI 여정 (개발자)
```
claude plugin install pm-product-strategy@pm-skills
→ /strategy "Discovery-X 기획 도구"  (Product Strategy Canvas)
→ /write-prd "PRD Studio 기능"       (8섹션 PRD 생성)
→ /plan-okrs                         (OKR 브레인스토밍)
→ /plan-launch                       (GTM 전략)
```

### 4.2 웹 여정 (비개발자)
```
아이디어 상세 → "PRD 작성" → 온보딩
→ 인터뷰 (pm-skills create-prd 8섹션 + interview-tree 5파트 통합)
→ PRD v1 자동 생성 (pm-skills 8섹션 템플릿)
→ AI 검토 → 피드백 + 스코어카드 → 수정/재검토 → 착수
```

### 4.3 아이디어 분석 여정 (2차)
```
아이디어 상세 → 분석 카테고리 선택
→ "시장 조사" → pm-skills market-sizing 프롬프트 실행
→ "고객 조사" → pm-skills user-personas + journey-map
→ "SWOT" → pm-skills swot-analysis (액션 권고 포함)
```

---

## 5. 기능 범위

### 5.1 Phase 1: CLI 적용 (P0)
| # | 작업 |
|---|------|
| 1 | pm-skills 플러그인 설치 (4개: strategy/execution/gtm/market-research) |
| 2 | Discovery-X 맥락 커스터마이즈 (.claude/CLAUDE.md에 프로젝트 컨텍스트 연동) |
| 3 | ax-14-req-interview와 pm-execution/create-prd 통합 검토 (PRD 템플릿 통일) |

### 5.2 Phase 2: 웹 PRD Studio (P0)
| # | 기능 |
|---|------|
| 1 | 대화형 인터뷰 UI (pm-skills 8섹션 + 기존 5파트 통합) |
| 2 | PRD 자동 생성 (pm-skills create-prd 8섹션 템플릿) |
| 3 | AI 다중 검토 + 피드백 뷰어 + 스코어카드 |
| 4 | PRD 편집/버전 관리 + 목록 |
| 5 | 이탈 이벤트 로깅 |

### 5.3 Phase 3: 아이디어 분석 대체 (P1)
| # | 작업 |
|---|------|
| 1 | market-sizing/competitor-analysis → "시장 조사" 프롬프트 교체 |
| 2 | user-personas/journey-map → "고객 조사" 교체 |
| 3 | swot-analysis → "SWOT" 교체 |
| 4 | business-model/lean-canvas → "BMC/린캔버스" 교체 |
| 5 | pestle-analysis → "PESTEL" 교체 |
| 6 | porters-five-forces + value-proposition → "가치 사슬" 교체 |

### 5.4 Phase 4: 신규 전략 도구 (P1)
| # | 기능 |
|---|------|
| 1 | Product Strategy Canvas 웹 UI (9섹션) |
| 2 | GTM Strategy 웹 UI (beachhead + ICP + growth loops) |
| 3 | 사업제안에 Strategy/GTM 데이터 연동 |

### 5.5 제외
외부 공개 / 실시간 협업 / 모바일 전용 / pm-data-analytics (SQL 생성 — Discovery-X에 불필요) / pm-marketing-growth (마케팅 — 범위 외)

---

## 6. 성공 기준

### 6.1 KPI
| 지표 | 현재 | 목표 | 측정 |
|------|------|------|------|
| 비개발자 PRD 작성 | 0건 | 팀원당 1+/분기 | DB |
| PM 스킬 CLI 사용 | 0 | 주 3+회 | 커맨드 로그 |
| 아이디어 분석 품질 | 정성적 | 구조화 점수 | pm-skills 프레임워크 섹션 완성도 |
| 인터뷰 완주율 | - | 80%+ | abandon 이벤트 |
| 검토 완주율 | 50% | 90%+ | review_complete |

### 6.2 MVP (Phase 1+2)
- [ ] pm-skills 4개 플러그인 CLI 설치 + 커스터마이즈
- [ ] 웹 인터뷰 + PRD 생성 (pm-skills 8섹션)
- [ ] AI 검토 + 스코어카드
- [ ] PRD 편집 → 재검토

---

## 7. 제약 조건

### 7.1 일정

| Phase | 범위 | 기간 |
|-------|------|------|
| 1. CLI 적용 | pm-skills 설치 + 커스터마이즈 + PRD 템플릿 통합 | 2일 |
| 2. 웹 PRD Studio | DB + API + 인터뷰 UI + 검토 + 스코어카드 | 14일 |
| 3. 분석 대체 | 아이디어 분석 6종 프롬프트 교체 + 테스트 | 4일 |
| 4. 전략 도구 | Strategy Canvas + GTM 웹 UI + 제안 연동 | 5일 |
| **합계** | | **25일 (~5주)** |

### 7.2 기술 스택
- CLI: pm-skills 플러그인 (Claude Code `claude plugin install`)
- 웹: Remix + D1 + Edge fetch (기존 패턴) + pm-skills SKILL.md를 프롬프트 소스로 활용
- pm-skills 라이선스: MIT — 수정/재배포 자유

### 7.3 기존 PRD v5 항목 유지
배포/롤백, 기술 리스크, 테스트/QA, 민감 정보, 인력/예산 — v5 §6 그대로 적용

---

## 8. 오픈 이슈

| # | 이슈 | 마감 |
|---|------|------|
| 1 | pm-skills 8섹션 PRD vs 기존 7섹션 PRD 템플릿 통합 방식 | Phase 1 |
| 2 | pm-skills SKILL.md를 웹 API 프롬프트로 변환하는 파이프라인 설계 | Phase 2 |
| 3 | 아이디어 분석 교체 시 기존 분석 결과 마이그레이션 필요 여부 | Phase 3 |
| 4 | DB 스키마 확정 (prds + prd_events) | Phase 2 |

---

## 9. 검토 이력

| 라운드 | 변경사항 | 스코어 |
|--------|---------|--------|
| v1~v5 | 인터뷰 기반 5회 AI 검토 완료 | 92→82→82→62→64 |
| v6 | pm-skills 통합 재설계: CLI 하이브리드 + 아이디어 분석 대체 + 전략 도구 추가 | - |

---

*이 문서는 requirements-interview 스킬에 의해 자동 생성 및 관리됩니다.*
