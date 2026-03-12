---
name: dx-write-prd
description: |
  Discovery-X PRD 작성 — pm-skills create-prd 기반 8섹션 PRD 생성.
  아이디어나 문제 설명을 입력받아 대화형 인터뷰 → 구조화된 PRD 문서 생성.
  AX BD팀 내부 신사업 발굴 컨텍스트에 최적화.
  사용: /dx-write-prd <기능 또는 문제 설명>
---

# /dx-write-prd — Discovery-X PRD 작성

pm-skills create-prd 템플릿 기반으로 AX BD팀 맥락에 맞는 PRD를 생성한다.

## 사용법

```
/dx-write-prd 소스 구독 자동 요약 기능
/dx-write-prd 아이디어 유사도 중복 검사
/dx-write-prd [아이디어 분석 결과 파일 경로]
```

## 워크플로우

### Step 1: 입력 이해

다음 형태의 입력을 수용:
- 기능명 ("소스 구독 자동 요약")
- 문제 설명 ("수집 아이템이 많아서 핵심 파악에 시간이 오래 걸린다")
- 아이디어 ID 또는 분석 데이터 참조
- 기존 문서 업로드

### Step 2: 컨텍스트 수집 (대화형)

AskUserQuestion 도구를 사용하여 순서대로 질문:

1. **문제**: 어떤 문제를 해결하나요? 누가 겪는 문제인가요? 얼마나 심각한가요?
2. **대상 사용자**: AX BD팀 내 누가 사용하나요? (전원 5명 / 특정 역할만)
3. **성공 기준**: 어떻게 성공을 측정할 수 있나요? 구체적 수치가 있나요?
4. **제약사항**: 기술 제약(D1/Cloudflare/30초 타임아웃), 일정, 의존성이 있나요?
5. **기존 시도**: 이전에 시도한 적 있나요? 시장에 비슷한 게 있나요?
6. **범위**: 전체 구현 vs 단계적 접근?

문서나 분석 데이터가 제공되면 거기서 추출 가능한 내용은 추출하고, 빈 부분만 질문한다.

### Step 3: PRD 생성

수집된 컨텍스트를 기반으로 **8섹션 PRD**를 한국어 마크다운으로 생성:

```markdown
# PRD: [기능명]

**작성자**: [사용자]
**작성일**: [오늘]
**상태**: Draft
**관련 아이디어**: [있으면 링크]
**DX-REQ**: [있으면 코드]

---

## 1. 요약 (Executive Summary)
[2-3문장: 무엇을, 누구를 위해, 왜 지금]

## 2. 배경 및 맥락 (Background & Context)
[문제 공간, 기존 상황, 시장 맥락, 트리거]

## 3. 목표 및 성공 지표 (Objectives & Success Metrics)

**목표** (성공의 정의):
1. [구체적, 측정 가능한 목표]

**비목표** (명시적 범위 밖):
1. [하지 않는 것과 그 이유]

**성공 지표**:
| 지표 | 현재 | 목표 | 측정 방법 |
|------|------|------|-----------|

## 4. 대상 사용자 (Target Users & Segments)
[누구를 위한 것인지, 사용자 프로필, 규모]
- AX BD팀 컨텍스트: 최대 5명, 역할별 구분

## 5. 사용자 스토리 및 요구사항 (User Stories & Requirements)

**P0 — 필수**:
| # | 사용자 스토리 | 인수 기준 |
|---|-------------|----------|

**P1 — 권장**:
| # | 사용자 스토리 | 인수 기준 |
|---|-------------|----------|

**P2 — 향후**:
| # | 사용자 스토리 | 인수 기준 |
|---|-------------|----------|

## 6. 솔루션 개요 (Solution Overview)
[접근 방식, 핵심 설계 결정]
- 기술 스택: Remix v2 + Cloudflare Pages + D1 + Drizzle ORM
- AI: Claude API + Fallback 체인 (anthropic→deepseek→openai→google→workers-ai)

## 7. 리스크 및 오픈 이슈 (Risks & Open Questions)
| 항목 | 유형 | 담당 | 마감 |
|------|------|------|------|

## 8. 일정 및 단계 (Timeline & Phasing)
[마일스톤, 의존성, 단계별 계획]
- Cloudflare Pages 30초 타임아웃 고려
- 단일 브랜치(master) 직접 push 전략
```

### Step 4: 검토 및 반복

생성 후 제안:
- "**범위를 좁힐까요?** P1 중 P2로 내릴 항목이 있는지 검토할게요."
- "**사전 분석(Pre-mortem)**을 실행할까요? `/pm-execution:pre-mortem` 스킬 활용"
- "**사용자 스토리 분해**가 필요하면 `/pm-execution:write-stories`를 사용할 수 있어요."
- "**경쟁 분석**이 필요하면 `/pm-market-research:competitive-analysis`를 추가할 수 있어요."

PRD를 `docs/prd-studio/` 또는 사용자 지정 경로에 마크다운 파일로 저장한다.

## Discovery-X 맥락 규칙

1. **한국어 기본**: 전체 PRD를 한국어로 작성
2. **기술 스택 고정**: Remix v2 + Cloudflare Pages + D1 + Drizzle ORM + Tailwind CSS 4 + @axis-ds
3. **사용자 규모**: 최대 5명 (AX BD팀 내부)
4. **금지 사항 참조**: PRD §2.2 — 전사 공식 포털 금지, 완성형 UX 금지, 외부 고객/CRM 연동 금지
5. **운영 제약**: 30-60일 운영 실험, Discovery 5-10건 절대 변경 금지
6. **성공 지표 구체화**: "개선" 금지 → "50% → 80%", "10분 → 2분" 등 수치 필수
7. **DX-REQ 연동**: SPEC.md F항목 + DX-REQ 코드가 있으면 PRD에 명시

## 연관 pm-skills 스킬

PRD 생성 후 추가 분석이 필요하면 다음 스킬을 제안:

| 스킬 | 플러그인 | 용도 |
|------|---------|------|
| `/pm-execution:pre-mortem` | pm-execution | 위험 분석 (Tigers/Elephants/Paper Tigers) |
| `/pm-execution:write-stories` | pm-execution | 사용자 스토리 분해 |
| `/pm-product-strategy:swot-analysis` | pm-product-strategy | SWOT 분석 |
| `/pm-product-strategy:lean-canvas` | pm-product-strategy | 린 캔버스 |
| `/pm-market-research:competitive-analysis` | pm-market-research | 경쟁사 분석 |
| `/pm-market-research:market-sizing` | pm-market-research | TAM/SAM/SOM |
| `/pm-go-to-market:plan-launch` | pm-go-to-market | GTM 전략 |
| `/pm-product-discovery:discover` | pm-product-discovery | 기회 발견 |
