---
code: DX-DSGN-020
title: "PRD Studio Ambiguity Score — 인터뷰 품질 게이트 설계"
version: "0.1"
status: Draft
category: DSGN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# PRD Studio Ambiguity Score — 인터뷰 품질 게이트 설계

> **Plan**: [[DX-PLAN-013]]
> **Req**: DX-REQ-020 (F50, P3, v0.8.0)
> **Parent Feature**: F44 PRD Studio ([[DX-DSGN-015]])
> **Status**: Draft

---

## 1. 컴포넌트 아키텍처

### 1.1 기존 라우트 내 확장

Ambiguity Score는 독립 라우트 없이 기존 `prd-studio.$id.tsx` 라우트 내부에 통합해요. 새 API 라우트 1개만 추가해요.

```
app/routes/
├── prd-studio.$id.tsx               — [기존] 인터뷰 UI (AmbiguityGauge 삽입 지점)
├── api.prd-studio.$id.generate.ts   — [수정] 게이트 체크 추가
└── api.prd-studio.$id.ambiguity.ts  — [신규] 평가 요청 API
```

### 1.2 feature 모듈 확장

```
app/features/prd-studio/
├── constants/
│   └── interview-config.ts          — [기존] SectionConfig[] 8섹션
├── db/
│   └── schema.ts                    — [수정] PrdEventType 3종 추가
├── hooks/
│   ├── useEventTracking.ts          — [수정] ambiguity 이벤트 3종 추가
│   └── useAmbiguityScore.ts         — [신규] 점수 fetch + 캐싱 + 재평가
├── lib/
│   └── ambiguity-scorer.ts          — [신규] 핵심 모듈 (차원 매핑 + LLM 평가 + 가중 합산)
├── service/
│   ├── prd-studio.service.ts        — [수정] ambiguity 점수 저장/조회 메서드 추가
│   └── strategy-realtime.service.ts — [기존] 변경 없음
├── types/
│   └── index.ts                     — [수정] Ambiguity 관련 타입 추가
└── ui/
    ├── AmbiguityGauge.tsx            — [신규] 프로그레스 바 + % 표시
    ├── DimensionCard.tsx             — [신규] 차원별 점수 카드
    └── GateBlocker.tsx               — [신규] 게이트 미달 안내 모달
```

### 1.3 컴포넌트 계층

```
prd-studio.$id.tsx
├── AmbiguityGauge                   — 게이지 바 (가중 명확성 %)
│   └── DimensionCard × 3~4         — 차원별 점수 + rationale + weakPoints
├── GateBlocker (conditional)        — 게이트 미달 시 모달
│   └── SuggestionCard × N          — 보충 질문 제안 (기존 섹션으로 스크롤)
├── PrdContentView                   — [기존]
├── ReviewResults                    — [기존]
└── VersionHistory                   — [기존]
```

---

## 2. AmbiguityScorer 서비스

### 2.1 모듈 위치

```
app/features/prd-studio/lib/ambiguity-scorer.ts
```

서비스 레이어(`PrdStudioService`)가 아닌 `lib/`에 위치해요. 이유:
- LLM 호출 로직은 `StrategyRealtimeService`처럼 별도 모듈로 분리하는 기존 패턴 준수
- DB 의존 없이 순수 입력(섹션 답변) → 출력(점수) 함수로 구성
- 서비스에서 호출하되, scorer 자체는 독립 테스트 가능

### 2.2 핵심 클래스 설계

```typescript
// app/features/prd-studio/lib/ambiguity-scorer.ts

import { callLLM } from "~/lib/ai";
import type { FallbackContext } from "~/lib/ai";
import type {
  DimensionType,
  DimensionScore,
  AmbiguityResult,
  AmbiguityConfig,
  ProjectType,
} from "../types";

/** 섹션 답변 입력 */
interface SectionInput {
  type: string;         // PrdSectionType
  answer: string;       // interviewAnswer
}

export class AmbiguityScorer {
  private config: AmbiguityConfig;

  constructor(config?: Partial<AmbiguityConfig>) {
    this.config = {
      gateThreshold: 0.2,
      warnThreshold: 0.4,
      temperature: 0.1,
      maxTokens: 600,
      model: "gpt-4.1",
      ...config,
    };
  }

  /**
   * 전체 평가 — 4차원 동시 LLM 호출 1회.
   * Greenfield/Brownfield 자동 판별 → 가중 합산 → AmbiguityResult 반환.
   */
  async evaluate(
    apiKey: string,
    sections: SectionInput[],
    aiCtx?: FallbackContext,
  ): Promise<AmbiguityResult> {
    const projectType = this.detectProjectType(sections);
    const prompt = this.buildPrompt(sections, projectType);
    const systemPrompt = this.buildSystemPrompt();

    const response = await callLLM(apiKey, {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    }, aiCtx);

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("");

    const dimensions = this.parseResponse(text, projectType);
    const clarityScore = this.computeWeightedScore(dimensions, projectType);
    const ambiguityScore = 1 - clarityScore;

    return {
      ambiguityScore,
      clarityPercent: Math.round(clarityScore * 100),
      projectType,
      dimensions,
      gateStatus: this.getGateStatus(ambiguityScore),
      evaluatedAt: Math.floor(Date.now() / 1000),
      model: this.config.model,
    };
  }

  /**
   * 부분 재평가 — 변경된 섹션이 매핑된 차원만 재계산.
   * 기존 DimensionScore[]를 받아 해당 차원만 교체 후 재합산.
   */
  async evaluatePartial(
    apiKey: string,
    sections: SectionInput[],
    changedSectionType: string,
    existingDimensions: DimensionScore[],
    aiCtx?: FallbackContext,
  ): Promise<AmbiguityResult> {
    const projectType = this.detectProjectType(sections);
    const affectedDimensions = this.getAffectedDimensions(changedSectionType);

    // 영향받는 차원의 섹션만 추출하여 해당 차원만 재평가
    const partialPrompt = this.buildPartialPrompt(
      sections, affectedDimensions, projectType,
    );
    const systemPrompt = this.buildSystemPrompt();

    const response = await callLLM(apiKey, {
      model: this.config.model,
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: partialPrompt }],
    }, aiCtx);

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("");

    const updatedPartial = this.parsePartialResponse(text);

    // 기존 dimensions에서 영향받는 차원만 교체
    const mergedDimensions = existingDimensions.map((d) => {
      const updated = updatedPartial.find((u) => u.dimension === d.dimension);
      return updated ?? d;
    });

    const clarityScore = this.computeWeightedScore(mergedDimensions, projectType);
    const ambiguityScore = 1 - clarityScore;

    return {
      ambiguityScore,
      clarityPercent: Math.round(clarityScore * 100),
      projectType,
      dimensions: mergedDimensions,
      gateStatus: this.getGateStatus(ambiguityScore),
      evaluatedAt: Math.floor(Date.now() / 1000),
      model: this.config.model,
    };
  }

  // ── Greenfield/Brownfield 판별 ────────────────────────────

  detectProjectType(sections: SectionInput[]): ProjectType {
    const background = sections.find((s) => s.type === "background");
    if (!background?.answer) return "greenfield";

    const brownfieldKeywords = [
      "기존", "레거시", "현재 시스템", "마이그레이션", "개선",
      "리팩토링", "업그레이드", "전환", "교체", "existing",
      "legacy", "migration", "refactor",
    ];

    const matchCount = brownfieldKeywords.filter((kw) =>
      background.answer.includes(kw),
    ).length;

    return matchCount >= 2 ? "brownfield" : "greenfield";
  }

  // ── 가중 합산 ──────────────────────────────────────────────

  private computeWeightedScore(
    dimensions: DimensionScore[],
    projectType: ProjectType,
  ): number {
    const weights = DIMENSION_WEIGHTS[projectType];
    let totalWeight = 0;
    let weightedSum = 0;

    for (const dim of dimensions) {
      const w = weights[dim.dimension] ?? 0;
      if (w > 0) {
        weightedSum += dim.score * w;
        totalWeight += w;
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  // ── 게이트 상태 ────────────────────────────────────────────

  private getGateStatus(
    ambiguityScore: number,
  ): "pass" | "warn" | "block" {
    if (ambiguityScore <= this.config.gateThreshold) return "pass";
    if (ambiguityScore <= this.config.warnThreshold) return "warn";
    return "block";
  }

  // ── 섹션→차원 매핑 ────────────────────────────────────────

  private getAffectedDimensions(sectionType: string): DimensionType[] {
    const mapping = SECTION_TO_DIMENSION_MAP[sectionType];
    return mapping ?? [];
  }

  // ── 프롬프트 빌더 (§4 참조) ────────────────────────────────

  private buildSystemPrompt(): string { /* §4 참조 */ }
  private buildPrompt(sections: SectionInput[], type: ProjectType): string { /* §4 참조 */ }
  private buildPartialPrompt(
    sections: SectionInput[],
    dims: DimensionType[],
    type: ProjectType,
  ): string { /* §4 참조 */ }

  // ── 응답 파서 ──────────────────────────────────────────────

  private parseResponse(text: string, type: ProjectType): DimensionScore[] { /* JSON 파싱 */ }
  private parsePartialResponse(text: string): DimensionScore[] { /* JSON 파싱 */ }
}
```

### 2.3 가중치 상수

```typescript
// app/features/prd-studio/lib/ambiguity-scorer.ts (상단)

const DIMENSION_WEIGHTS: Record<ProjectType, Record<DimensionType, number>> = {
  greenfield: {
    goal: 0.40,
    constraint: 0.30,
    success: 0.30,
    context: 0,        // Greenfield: Context 미사용
  },
  brownfield: {
    goal: 0.35,
    constraint: 0.25,
    success: 0.25,
    context: 0.15,
  },
};
```

---

## 3. 차원 매핑 설계

### 3.1 인터뷰 8섹션 → 4차원 매핑 테이블

| 차원 (Dimension) | 매핑 섹션 (PrdSectionType) | 평가 기준 |
|---|---|---|
| **Goal** (목표 명확성) | `summary` + `objectives` | 핵심 문제/목표가 구체적인가, 측정 가능한 성공 기준이 있는가 |
| **Constraint** (제약 명확성) | `risks` + `requirements` | 기술적·자원적·시간적 제약이 명시됐는가, 우선순위(P0/P1)가 분류됐는가 |
| **Success** (성공 기준 명확성) | `objectives` + `target_users` | 성공 지표가 정량화됐는가, 대상 사용자가 특정됐는가 |
| **Context** (맥락 명확성) | `background` + `solution` + `timeline` | 기존 시스템/상황 설명이 충분한가, 기술 선택 근거가 있는가, 일정이 현실적인가 |

### 3.2 역매핑 (섹션 변경 → 영향 차원)

```typescript
// 섹션 하나가 변경되면 어떤 차원을 재평가해야 하는가

const SECTION_TO_DIMENSION_MAP: Record<string, DimensionType[]> = {
  summary:      ["goal"],
  background:   ["context"],
  objectives:   ["goal", "success"],
  target_users: ["success"],
  requirements: ["constraint"],
  solution:     ["context"],
  risks:        ["constraint"],
  timeline:     ["context"],
};
```

이 역매핑 덕분에 부분 재평가 시 `objectives` 변경 → `goal` + `success` 두 차원만 재평가하여 LLM 호출 비용을 절약해요.

### 3.3 차원별 섹션 답변 수집 헬퍼

```typescript
/** 차원에 매핑된 섹션 답변을 모아서 하나의 텍스트로 반환 */
const DIMENSION_TO_SECTIONS: Record<DimensionType, string[]> = {
  goal:       ["summary", "objectives"],
  constraint: ["risks", "requirements"],
  success:    ["objectives", "target_users"],
  context:    ["background", "solution", "timeline"],
};

function collectSectionTexts(
  dimension: DimensionType,
  sections: SectionInput[],
): string {
  const types = DIMENSION_TO_SECTIONS[dimension];
  return types
    .map((type) => {
      const sec = sections.find((s) => s.type === type);
      return sec?.answer ? `[${type}]\n${sec.answer}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}
```

---

## 4. LLM 평가 프롬프트

### 4.1 시스템 프롬프트

```typescript
private buildSystemPrompt(): string {
  return `당신은 PRD(Product Requirements Document) 인터뷰 답변의 명확성을 평가하는 전문가예요.

## 역할
사용자가 작성한 인터뷰 답변을 4개 차원(Goal, Constraint, Success, Context)으로 평가하고,
각 차원의 명확성 점수(0.0~1.0)를 산출해요.

## 평가 루브릭
| 점수 범위 | 수준 | 판단 기준 |
|----------|------|----------|
| 0.0~0.2 | 매우 모호 | 한 줄 이하, 추상적 표현만 ("좋은 시스템을 만든다" 수준) |
| 0.2~0.4 | 모호 | 방향성은 있으나 구체적 수치/사례/대상 없음 |
| 0.4~0.6 | 보통 | 일부 구체적 내용 포함, 빈 구간(누락된 관점)이 존재 |
| 0.6~0.8 | 명확 | 대부분 구체적, 수치화된 기준 일부 포함, 소수 보충 필요 |
| 0.8~1.0 | 매우 명확 | 구체적이고 측정 가능한 기준 포함, 빈 구간 없음 |

## 응답 형식
반드시 JSON만 출력하세요. 설명 텍스트 없이 JSON 객체만 반환하세요.`;
}
```

### 4.2 전체 평가 프롬프트

```typescript
private buildPrompt(sections: SectionInput[], projectType: ProjectType): string {
  const dimensionTypes: DimensionType[] = projectType === "greenfield"
    ? ["goal", "constraint", "success"]
    : ["goal", "constraint", "success", "context"];

  const sectionBlocks = dimensionTypes.map((dim) => {
    const text = collectSectionTexts(dim, sections);
    const label = DIMENSION_LABELS[dim];
    return `## ${label} 차원\n관련 답변:\n${text || "(답변 없음)"}`;
  }).join("\n\n---\n\n");

  return `다음 PRD 인터뷰 답변을 차원별로 명확성 평가해주세요.

프로젝트 유형: ${projectType === "greenfield" ? "Greenfield (신규)" : "Brownfield (기존 시스템 개선)"}

${sectionBlocks}

다음 JSON 형식으로 응답하세요:
{
  "dimensions": {
${dimensionTypes.map((dim) => `    "${dim}": {
      "score": 0.0,
      "rationale": "평가 근거 1~2문장",
      "weakPoints": ["부족한 점 1", "부족한 점 2"],
      "suggestedQuestions": ["보충 질문 1", "보충 질문 2"]
    }`).join(",\n")}
  }
}`;
}
```

### 4.3 부분 재평가 프롬프트

```typescript
private buildPartialPrompt(
  sections: SectionInput[],
  dims: DimensionType[],
  projectType: ProjectType,
): string {
  const sectionBlocks = dims.map((dim) => {
    const text = collectSectionTexts(dim, sections);
    const label = DIMENSION_LABELS[dim];
    return `## ${label} 차원\n관련 답변:\n${text || "(답변 없음)"}`;
  }).join("\n\n---\n\n");

  return `다음 PRD 인터뷰 답변을 차원별로 명확성 평가해주세요.
프로젝트 유형: ${projectType === "greenfield" ? "Greenfield" : "Brownfield"}

${sectionBlocks}

다음 JSON 형식으로 응답하세요:
{
  "dimensions": {
${dims.map((dim) => `    "${dim}": {
      "score": 0.0,
      "rationale": "평가 근거",
      "weakPoints": [],
      "suggestedQuestions": []
    }`).join(",\n")}
  }
}`;
}
```

### 4.4 차원별 평가 세부 루브릭

| 차원 | 0.8+ (매우 명확) 기준 | 0.4 미만 (모호) 기준 |
|------|---------------------|---------------------|
| **Goal** | 핵심 문제 + 목표 3개 이상 + 각 목표에 수치 기준 | "좋은 제품 만들기" 수준, 목표 열거 없음 |
| **Constraint** | P0/P1 분류 + 기술·비용·일정 제약 각각 명시 | "리스크 있음" 수준, 구체적 제약 없음 |
| **Success** | 정량 KPI 2개+ + 대상 사용자 역할/규모 특정 | "사용자가 좋아하면" 수준, 수치 없음 |
| **Context** | 기존 시스템 설명 + 기술 선택 근거 + 마일스톤 일정 | "현재 문제 있음" 수준, 맥락 부재 |

### 4.5 LLM 호출 파라미터

| 파라미터 | 값 | 근거 |
|---------|---|------|
| model | `gpt-4.1` | 기존 PRD 생성과 동일 모델, JSON 출력 안정성 |
| temperature | `0.1` | 평가 일관성 최대화 (같은 답변 → 같은 점수) |
| max_tokens | `600` (전체) / `400` (부분) | JSON 응답만 (4차원 × ~150자) |
| response_format | 미사용 | `callLLM` 경유 시 Anthropic 포맷. JSON 파싱은 수동 |

### 4.6 LLM JSON 출력 스키마

```json
{
  "dimensions": {
    "goal": {
      "score": 0.85,
      "rationale": "목표가 3개로 명확히 정의되어 있고, 각각 수치 기준(28일, 90%, 80%)이 포함됨",
      "weakPoints": ["성공 상태 정의가 추상적"],
      "suggestedQuestions": ["'팀이 더 잘 틀리고 더 빨리 배우는 루프'를 수치로 어떻게 측정하나요?"]
    },
    "constraint": {
      "score": 0.70,
      "rationale": "기술·비용 제약은 구체적이나 일정 제약 우선순위 미분류",
      "weakPoints": ["P0/P1 우선순위 분류 없음", "인력 제약의 영향 범위 미기술"],
      "suggestedQuestions": ["요구사항 중 P0(필수)와 P1(권장)을 구분해주세요"]
    },
    "success": { "score": 0.80, "rationale": "...", "weakPoints": [], "suggestedQuestions": [] },
    "context": null
  }
}
```

---

## 5. UI 컴포넌트 설계

### 5.1 AmbiguityGauge.tsx

인터뷰 영역 상단에 위치하는 명확성 게이지 컴포넌트.

```typescript
// app/features/prd-studio/ui/AmbiguityGauge.tsx

import type { AmbiguityResult, DimensionScore } from "../types";
import { DimensionCard } from "./DimensionCard";

interface AmbiguityGaugeProps {
  result: AmbiguityResult | null;
  isEvaluating: boolean;
  onRefresh: () => void;
}

export function AmbiguityGauge({ result, isEvaluating, onRefresh }: AmbiguityGaugeProps) {
  if (!result) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-500">인터뷰 명확성 점수</span>
          <button
            onClick={onRefresh}
            disabled={isEvaluating}
            className="text-xs text-blue-600 hover:underline disabled:text-neutral-400"
          >
            {isEvaluating ? "평가 중..." : "점수 확인하기"}
          </button>
        </div>
      </div>
    );
  }

  const { clarityPercent, gateStatus, dimensions } = result;
  const barColor = gateStatus === "pass" ? "bg-green-500"
    : gateStatus === "warn" ? "bg-yellow-500"
    : "bg-red-500";

  // 가장 낮은 차원 찾기 (보충 안내용)
  const lowestDim = [...dimensions]
    .filter((d) => d.score !== null)
    .sort((a, b) => a.score - b.score)[0];

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3">
      {/* 헤더: 제목 + 새로고침 */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-700">
          📊 인터뷰 명확성
        </span>
        <button
          onClick={onRefresh}
          disabled={isEvaluating}
          className="text-xs text-blue-600 hover:underline disabled:text-neutral-400"
        >
          {isEvaluating ? "재평가 중..." : "새로고침"}
        </button>
      </div>

      {/* 프로그레스 바 */}
      <div className="space-y-1">
        <div className="h-3 w-full rounded-full bg-neutral-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${clarityPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-neutral-500">모호</span>
          <span className="font-semibold">{clarityPercent}%</span>
          <span className="text-neutral-500">명확</span>
        </div>
      </div>

      {/* 차원별 카드 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {dimensions.map((dim) => (
          <DimensionCard key={dim.dimension} dimension={dim} />
        ))}
      </div>

      {/* 안내 메시지 */}
      {lowestDim && lowestDim.score < 0.6 && (
        <div className="rounded bg-amber-50 p-2 text-xs text-amber-800">
          ⚠️ <strong>{DIMENSION_LABELS[lowestDim.dimension]}</strong> 차원 보충 권장
          {lowestDim.weakPoints[0] && `: ${lowestDim.weakPoints[0]}`}
        </div>
      )}
    </div>
  );
}

const DIMENSION_LABELS: Record<string, string> = {
  goal: "목표",
  constraint: "제약",
  success: "성공기준",
  context: "맥락",
};
```

### 5.2 DimensionCard.tsx

각 차원의 점수를 카드로 표시하는 컴포넌트.

```typescript
// app/features/prd-studio/ui/DimensionCard.tsx

import type { DimensionScore } from "../types";

interface DimensionCardProps {
  dimension: DimensionScore;
}

const LABELS: Record<string, string> = {
  goal: "목표",
  constraint: "제약",
  success: "성공기준",
  context: "맥락",
};

export function DimensionCard({ dimension }: DimensionCardProps) {
  const { dimension: type, score } = dimension;
  const label = LABELS[type] ?? type;

  // Context가 null이면 N/A 표시 (Greenfield)
  if (score === null) {
    return (
      <div className="rounded border border-neutral-100 bg-neutral-50 p-2 text-center">
        <div className="text-xs text-neutral-400">{label}</div>
        <div className="text-sm text-neutral-300">—</div>
      </div>
    );
  }

  const statusColor = score >= 0.8 ? "text-green-600"
    : score >= 0.6 ? "text-yellow-600"
    : "text-red-600";

  const statusIcon = score >= 0.8 ? "🟢"
    : score >= 0.6 ? "🟡"
    : "🔴";

  return (
    <div
      className="rounded border border-neutral-200 bg-white p-2 text-center
                 hover:border-blue-200 transition-colors cursor-default"
      title={dimension.rationale ?? undefined}
    >
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-sm font-semibold ${statusColor}`}>
        {score.toFixed(1)} {statusIcon}
      </div>
    </div>
  );
}
```

### 5.3 GateBlocker.tsx

게이트 미달 시 모달로 표시되는 안내 + 추가 질문 제안 컴포넌트.

```typescript
// app/features/prd-studio/ui/GateBlocker.tsx

import type { AmbiguityResult, DimensionScore } from "../types";

interface GateBlockerProps {
  result: AmbiguityResult;
  onClose: () => void;
  onGoToSection: (sectionType: string) => void;
  onForceGenerate?: () => void;  // 0.2~0.4 경고 구간에서만 표시
}

export function GateBlocker({
  result,
  onClose,
  onGoToSection,
  onForceGenerate,
}: GateBlockerProps) {
  const isBlock = result.gateStatus === "block";
  const weakDimensions = result.dimensions
    .filter((d) => d.score !== null && d.score < 0.6)
    .sort((a, b) => a.score - b.score);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-neutral-800">
          {isBlock
            ? "🔴 답변을 보충하면 더 좋은 PRD를 만들 수 있어요"
            : "🟡 일부 차원이 부족해요"}
        </h3>

        <p className="mt-2 text-sm text-neutral-600">
          명확성 {result.clarityPercent}% — {isBlock
            ? "60% 이상이면 PRD 생성이 가능해요."
            : "생성은 가능하지만 보충을 권장해요."}
        </p>

        {/* 부족 차원별 보충 질문 카드 */}
        <div className="mt-4 space-y-3">
          {weakDimensions.map((dim) => (
            <SuggestionCard
              key={dim.dimension}
              dimension={dim}
              onGoToSection={onGoToSection}
            />
          ))}
        </div>

        {/* 액션 버튼 */}
        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-sm font-medium
                       text-blue-600 hover:bg-blue-50"
          >
            보충하기
          </button>
          {!isBlock && onForceGenerate && (
            <button
              onClick={onForceGenerate}
              className="rounded px-4 py-2 text-sm font-medium
                         text-neutral-500 hover:bg-neutral-100"
            >
              그래도 생성하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 차원별 보충 질문 카드 */
function SuggestionCard({
  dimension,
  onGoToSection,
}: {
  dimension: DimensionScore;
  onGoToSection: (sectionType: string) => void;
}) {
  const LABELS: Record<string, string> = {
    goal: "목표", constraint: "제약", success: "성공기준", context: "맥락",
  };

  // 차원 → 대표 섹션 (답변하기 클릭 시 스크롤 대상)
  const PRIMARY_SECTION: Record<string, string> = {
    goal: "objectives",
    constraint: "requirements",
    success: "target_users",
    context: "background",
  };

  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
        💡 {LABELS[dimension.dimension]} 차원 ({(dimension.score * 10).toFixed(0)}/10)
      </div>
      {dimension.suggestedQuestions.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-700">
          {dimension.suggestedQuestions.slice(0, 2).map((q, i) => (
            <li key={i}>Q{i + 1}: {q}</li>
          ))}
        </ul>
      )}
      <button
        onClick={() => onGoToSection(PRIMARY_SECTION[dimension.dimension])}
        className="mt-2 text-xs text-blue-600 hover:underline"
      >
        이 질문에 답변하기 →
      </button>
    </div>
  );
}
```

---

## 6. PRD 생성 게이트 로직

### 6.1 게이트 체크 흐름

```
사용자: "PRD 생성하기" 버튼 클릭
  → (클라이언트) 최신 AmbiguityResult 확인
  → ambiguityScore 없음? → 전체 평가 먼저 실행
  → gateStatus === "block" (> 0.4)?
    → GateBlocker 모달 표시 (PRD 생성 불가)
    → [보충하기] → 모달 닫기 + 해당 섹션 스크롤
  → gateStatus === "warn" (0.2~0.4)?
    → GateBlocker 모달 표시 (경고 + "그래도 생성하기" 버튼)
    → [보충하기] → 모달 닫기
    → [그래도 생성하기] → 기존 generate API 호출 + gate_warned 이벤트
  → gateStatus === "pass" (≤ 0.2)?
    → 기존 generate API 호출 + gate_passed 이벤트
```

### 6.2 기존 generate 라우트 수정

`api.prd-studio.$id.generate.ts`에는 **서버 측 게이트를 추가하지 않아요**. 이유:

1. 게이트는 UX 가이드 목적이므로 클라이언트에서 처리 (강제 차단 아님)
2. "그래도 생성하기" 경로를 허용하려면 서버에서 차단하면 안 됨
3. 서버는 ambiguity_score를 저장하는 역할만 담당

대신 `prd-studio.$id.tsx`의 "PRD 생성하기" 버튼 핸들러에서 게이트를 체크해요:

```typescript
// prd-studio.$id.tsx — generate 버튼 핸들러 (수정 부분만)

const [showGateBlocker, setShowGateBlocker] = useState(false);

const handleGenerate = useCallback(async () => {
  // Feature Flag 체크
  if (!AMBIGUITY_SCORE_ENABLED) {
    generateFetcher.submit(null, {
      method: "POST",
      action: `/api/prd-studio/${prd.id}/generate`,
    });
    return;
  }

  // 최신 ambiguity 점수 확인 (없으면 평가 실행)
  let currentResult = ambiguityResult;
  if (!currentResult) {
    currentResult = await evaluateAmbiguity();
  }

  if (!currentResult) {
    // LLM 실패 시 graceful degradation — 경고만 표시하고 생성 허용
    generateFetcher.submit(null, {
      method: "POST",
      action: `/api/prd-studio/${prd.id}/generate`,
    });
    return;
  }

  if (currentResult.gateStatus === "pass") {
    trackGatePassed(currentResult.ambiguityScore);
    generateFetcher.submit(null, {
      method: "POST",
      action: `/api/prd-studio/${prd.id}/generate`,
    });
  } else {
    // warn 또는 block → 모달 표시
    setShowGateBlocker(true);
  }
}, [ambiguityResult, prd.id]);

const handleForceGenerate = useCallback(() => {
  setShowGateBlocker(false);
  if (ambiguityResult) {
    trackGateWarned(ambiguityResult.ambiguityScore);
  }
  generateFetcher.submit(null, {
    method: "POST",
    action: `/api/prd-studio/${prd.id}/generate`,
  });
}, [ambiguityResult, prd.id]);
```

### 6.3 Feature Flag

```typescript
// 환경변수 AMBIGUITY_SCORE_ENABLED로 비활성화 가능
// 기본값: true (v0.8.0 출시 시)
const AMBIGUITY_SCORE_ENABLED = true; // 추후 환경변수로 전환
```

### 6.4 배치 분석 경로 호환

`prd_analysis_queue` 배치 경로는 게이트 미적용. 배치는 소스 데이터(Radar/Ideas)에서 이미 충분한 컨텍스트를 수집하므로 인터뷰 기반 게이트가 불필요해요.

---

## 7. DB 스키마 확장

### 7.1 prds 테이블 컬럼 추가

| 컬럼 | Drizzle 타입 | SQL 타입 | Nullable | 설명 |
|------|-------------|---------|----------|------|
| `ambiguityScore` | `real("ambiguity_score")` | `REAL` | Yes | 최종 Ambiguity Score (0.0~1.0). null = 미평가 |
| `dimensionScores` | `text("dimension_scores", { mode: "json" })` | `TEXT` | Yes | 차원별 점수 + 메타데이터 JSON |
| `projectType` | `text("project_type")` | `TEXT` | Yes | `"greenfield"` \| `"brownfield"`. null = 미판별 |

### 7.2 Drizzle 스키마 수정

```typescript
// app/features/prd-studio/db/schema.ts — prds 테이블에 추가

import type { DimensionScoresJson } from "../types";

export const prds = sqliteTable(
  "prds",
  {
    // ... 기존 컬럼 유지
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    title: text("title").notNull(),
    status: text("status").notNull().default(PrdStatus.DRAFT),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull().references(() => users.id),
    sourceIdeaId: text("source_idea_id"),
    interviewProgress: integer("interview_progress").notNull().default(0),
    finalRating: integer("final_rating"),
    finalComment: text("final_comment"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),

    // ── F50: Ambiguity Score ────────────────────────
    ambiguityScore: real("ambiguity_score"),
    dimensionScores: text("dimension_scores", { mode: "json" }).$type<DimensionScoresJson>(),
    projectType: text("project_type"),
  },
  (table) => ({
    tenantIdx: index("idx_prds_tenant").on(table.tenantId),
    createdByIdx: index("idx_prds_created_by").on(table.createdBy),
    statusIdx: index("idx_prds_status").on(table.status),
  }),
);
```

### 7.3 PrdEventType 확장

```typescript
// schema.ts — PrdEventType에 3개 이벤트 추가

export const PrdEventType = {
  INTERVIEW_START: "interview_start",
  SECTION_COMPLETE: "section_complete",
  INTERVIEW_ABANDON: "interview_abandon",
  PRD_GENERATED: "prd_generated",
  PRD_EDITED: "prd_edited",
  REVIEW_START: "review_start",
  REVIEW_COMPLETE: "review_complete",
  PRD_FINALIZED: "prd_finalized",
  // ── F50: Ambiguity Score Events ──
  AMBIGUITY_EVALUATED: "ambiguity_evaluated",
  GATE_PASSED: "gate_passed",
  GATE_WARNED: "gate_warned",
} as const;
```

---

## 8. 마이그레이션 SQL

```sql
-- migrations/0067_add_ambiguity_score.sql

ALTER TABLE prds ADD COLUMN ambiguity_score REAL;
ALTER TABLE prds ADD COLUMN dimension_scores TEXT;
ALTER TABLE prds ADD COLUMN project_type TEXT;
```

- 3컬럼 모두 nullable이므로 기존 레코드 호환 — 데이터 마이그레이션 불필요
- `tests/helpers/db.ts`에도 동일 SQL 추가 필수 (마이그레이션 gotcha)
- `real` 타입은 D1/SQLite에서 REAL affinity (IEEE 754 double)

### dimension_scores JSON 구조

```json
{
  "goal": {
    "score": 0.9,
    "rationale": "목표가 3개로 명확히 정의됨",
    "weakPoints": [],
    "suggestedQuestions": []
  },
  "constraint": {
    "score": 0.7,
    "rationale": "기술 제약은 구체적이나 우선순위 미분류",
    "weakPoints": ["P0/P1 구분 없음"],
    "suggestedQuestions": ["요구사항의 우선순위를 P0/P1로 분류해주세요"]
  },
  "success": {
    "score": 0.8,
    "rationale": "KPI 2개 포함, 대상 사용자 특정됨",
    "weakPoints": [],
    "suggestedQuestions": []
  },
  "context": null,
  "evaluatedAt": 1742304000,
  "model": "gpt-4.1",
  "projectType": "greenfield"
}
```

---

## 9. API 변경

### 9.1 신규 라우트: POST /api/prd-studio/:id/ambiguity

```typescript
// app/routes/api.prd-studio.$id.ambiguity.ts

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { PrdStatus } from "~/features/prd-studio/db/schema";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { AmbiguityScorer } from "~/features/prd-studio/lib/ambiguity-scorer";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import type { FallbackContext } from "~/lib/ai";

export async function action({ params, request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = params.id!;
  const service = new PrdStudioService(db);

  // PRD 로드 + 소유자 검증
  const prd = await service.getById(id, ctx.tenantId);
  if (!prd) {
    return json({ error: "PRD를 찾을 수 없어요." }, { status: 404 });
  }
  if (prd.createdBy !== ctx.user.id) {
    return json({ error: "본인의 PRD만 평가할 수 있어요." }, { status: 403 });
  }
  if (prd.status !== PrdStatus.DRAFT) {
    return json({ error: "DRAFT 상태의 PRD만 평가할 수 있어요." }, { status: 400 });
  }

  // API 키 확인
  const env = context.cloudflare.env as unknown as Record<string, string>;
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: "AI API가 설정되지 않았어요." }, { status: 503 });
  }

  // 인터뷰 답변 수집
  const sections = prd.sections.map((s) => ({
    type: s.type,
    answer: s.interviewAnswer ?? "",
  }));

  // 답변 있는 섹션이 최소 3개 이상인지 확인
  const answeredCount = sections.filter((s) => s.answer.trim().length > 0).length;
  if (answeredCount < 3) {
    return json(
      { error: "최소 3개 이상 섹션에 답변해야 평가할 수 있어요." },
      { status: 400 },
    );
  }

  // 요청 body에서 부분 재평가 여부 확인
  let body: { partial?: boolean; changedSection?: string } = {};
  try {
    body = await request.json();
  } catch {
    // body 없으면 전체 평가
  }

  // FallbackContext 구성
  const aiCtx: FallbackContext = {
    env: context.cloudflare.env,
    userId: ctx.user.id,
    tenantId: ctx.tenantId,
    agentName: "ambiguity-scorer",
  };

  try {
    const scorer = new AmbiguityScorer();
    let result;

    if (body.partial && body.changedSection && prd.dimensionScores) {
      // 부분 재평가
      const existing = (prd.dimensionScores as unknown as { goal?: object })
        ? extractDimensionScores(prd.dimensionScores)
        : null;

      if (existing) {
        result = await scorer.evaluatePartial(
          apiKey, sections, body.changedSection, existing, aiCtx,
        );
      } else {
        result = await scorer.evaluate(apiKey, sections, aiCtx);
      }
    } else {
      // 전체 평가
      result = await scorer.evaluate(apiKey, sections, aiCtx);
    }

    // DB 저장
    await service.saveAmbiguityScore(id, {
      ambiguityScore: result.ambiguityScore,
      dimensionScores: buildDimensionScoresJson(result),
      projectType: result.projectType,
    });

    // 이벤트 기록
    await service.logEvent({
      prdId: id,
      tenantId: ctx.tenantId,
      eventType: "ambiguity_evaluated",
      actorId: ctx.user.id,
      payload: {
        ambiguityScore: result.ambiguityScore,
        clarityPercent: result.clarityPercent,
        projectType: result.projectType,
        gateStatus: result.gateStatus,
      },
    });

    return json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api.prd-studio.ambiguity] Error:", message);

    if (message.includes("aborted")) {
      return json({ error: "평가 시간이 초과됐어요." }, { status: 504 });
    }
    return json({ error: "평가 중 오류가 발생했어요." }, { status: 500 });
  }
}
```

### 9.2 접근 제어 매트릭스 (추가)

| 작업 | 미인증 | 다른 테넌트 | 같은 테넌트 타인 | 소유자 | admin |
|------|--------|------------|----------------|--------|-------|
| Ambiguity 평가 | ✗ 401 | ✗ 404 | ✗ 403 | ✓ | ✗ |

### 9.3 PrdStudioService 메서드 추가

```typescript
// prd-studio.service.ts — 추가 메서드

/** Ambiguity Score 저장 */
async saveAmbiguityScore(prdId: string, data: {
  ambiguityScore: number;
  dimensionScores: DimensionScoresJson;
  projectType: string;
}) {
  await this.db
    .update(prds)
    .set({
      ambiguityScore: data.ambiguityScore,
      dimensionScores: data.dimensionScores,
      projectType: data.projectType,
      updatedAt: sql`(unixepoch())`,
    })
    .where(eq(prds.id, prdId));
}

/** Ambiguity Score 조회 (prds 테이블에서 직접) */
async getAmbiguityScore(prdId: string) {
  const row = await this.db
    .select({
      ambiguityScore: prds.ambiguityScore,
      dimensionScores: prds.dimensionScores,
      projectType: prds.projectType,
    })
    .from(prds)
    .where(eq(prds.id, prdId))
    .get();

  return row ?? null;
}
```

---

## 10. 이벤트 추적

### 10.1 신규 이벤트 3종

| # | eventType | 트리거 시점 | 전송 방식 | payload |
|---|-----------|-----------|----------|---------|
| 9 | `ambiguity_evaluated` | LLM 차원별 평가 완료 | fetch (서버 측) | `{ ambiguityScore, clarityPercent, projectType, gateStatus }` |
| 10 | `gate_passed` | 게이트 통과 (생성 진행) | fetch (클라이언트 측) | `{ ambiguityScore, gateLevel: "pass" }` |
| 11 | `gate_warned` | 경고 무시 후 생성 진행 | fetch (클라이언트 측) | `{ ambiguityScore, skippedDimensions }` |

### 10.2 useEventTracking 확장

```typescript
// hooks/useEventTracking.ts — 추가 메서드

const trackAmbiguityEvaluated = useCallback(
  (ambiguityScore: number, clarityPercent: number) => {
    trackEvent(prdId, PrdEventType.AMBIGUITY_EVALUATED, {
      ambiguityScore,
      clarityPercent,
    });
  },
  [prdId],
);

const trackGatePassed = useCallback(
  (ambiguityScore: number) => {
    trackEvent(prdId, PrdEventType.GATE_PASSED, {
      ambiguityScore,
      gateLevel: "pass",
    });
  },
  [prdId],
);

const trackGateWarned = useCallback(
  (ambiguityScore: number) => {
    trackEvent(prdId, PrdEventType.GATE_WARNED, {
      ambiguityScore,
    });
  },
  [prdId],
);
```

### 10.3 KPI 측정 쿼리

```sql
-- 게이트 통과율 (pass / (pass + warned))
SELECT
  COUNT(CASE WHEN event_type = 'gate_passed' THEN 1 END) AS passed,
  COUNT(CASE WHEN event_type = 'gate_warned' THEN 1 END) AS warned,
  ROUND(
    COUNT(CASE WHEN event_type = 'gate_passed' THEN 1 END) * 100.0
    / NULLIF(COUNT(CASE WHEN event_type IN ('gate_passed', 'gate_warned') THEN 1 END), 0),
    1
  ) AS pass_rate
FROM prd_events
WHERE event_type IN ('gate_passed', 'gate_warned');

-- 평균 명확성 점수 추이
SELECT
  DATE(created_at, 'unixepoch') AS day,
  ROUND(AVG(json_extract(payload, '$.clarityPercent')), 1) AS avg_clarity
FROM prd_events
WHERE event_type = 'ambiguity_evaluated'
GROUP BY day
ORDER BY day;

-- NOT_READY 감소 효과 (게이트 적용 전후 비교)
SELECT
  CASE WHEN p.ambiguity_score IS NOT NULL THEN 'with_gate' ELSE 'no_gate' END AS gate_group,
  COUNT(CASE WHEN r.verdict = 'NOT_READY' THEN 1 END) AS not_ready,
  COUNT(*) AS total,
  ROUND(COUNT(CASE WHEN r.verdict = 'NOT_READY' THEN 1 END) * 100.0 / COUNT(*), 1) AS not_ready_rate
FROM prd_reviews r
JOIN prds p ON r.prd_id = p.id
GROUP BY gate_group;
```

---

## 11. 타입 정의

### 11.1 신규 타입 (types/index.ts에 추가)

```typescript
// app/features/prd-studio/types/index.ts — 추가

// ── F50: Ambiguity Score Types ──────────────────────────────

/** 평가 차원 */
export type DimensionType = "goal" | "constraint" | "success" | "context";

/** 프로젝트 유형 */
export type ProjectType = "greenfield" | "brownfield";

/** 게이트 상태 */
export type GateStatus = "pass" | "warn" | "block";

/** 차원별 평가 결과 */
export interface DimensionScore {
  dimension: DimensionType;
  score: number;                    // 0.0 ~ 1.0 (null이면 Greenfield context)
  rationale: string;                // 평가 근거 (1~2문장)
  weakPoints: string[];             // 부족한 점 목록
  suggestedQuestions: string[];     // 보충 질문 제안
}

/** 최종 평가 결과 */
export interface AmbiguityResult {
  ambiguityScore: number;           // 0.0 ~ 1.0
  clarityPercent: number;           // 0 ~ 100 (표시용)
  projectType: ProjectType;
  dimensions: DimensionScore[];
  gateStatus: GateStatus;
  evaluatedAt: number;              // unix timestamp
  model: string;
}

/** AmbiguityScorer 설정 */
export interface AmbiguityConfig {
  gateThreshold: number;            // ≤ 이 값이면 pass (기본 0.2)
  warnThreshold: number;            // ≤ 이 값이면 warn (기본 0.4)
  temperature: number;              // LLM temperature (기본 0.1)
  maxTokens: number;                // LLM max_tokens (기본 600)
  model: string;                    // LLM 모델 (기본 "gpt-4.1")
}

/** DB에 저장되는 dimension_scores JSON 구조 */
export interface DimensionScoresJson {
  goal: DimensionScoreEntry | null;
  constraint: DimensionScoreEntry | null;
  success: DimensionScoreEntry | null;
  context: DimensionScoreEntry | null;
  evaluatedAt: number;
  model: string;
  projectType: ProjectType;
}

/** dimension_scores 내 개별 차원 */
export interface DimensionScoreEntry {
  score: number;
  rationale: string;
  weakPoints: string[];
  suggestedQuestions: string[];
}
```

### 11.2 UpdatePrdInput 확장

```typescript
// 기존 UpdatePrdInput에 ambiguity 필드 추가
export interface UpdatePrdInput {
  title?: string;
  status?: string;
  interviewProgress?: number;
  finalRating?: number;
  finalComment?: string;
  // F50: Ambiguity Score
  ambiguityScore?: number;
  dimensionScores?: DimensionScoresJson;
  projectType?: string;
}
```

---

## 12. 테스트 계획

### 12.1 단위 테스트

| 파일 | 대상 | 테스트 케이스 | 예상 수 |
|------|------|-------------|---------|
| `tests/unit/prd-studio/ambiguity-scorer.test.ts` | AmbiguityScorer | 가중 합산, 게이트 판정, 프로젝트 유형 판별, 역매핑 | 15개 |
| `tests/unit/prd-studio/ambiguity-scorer.test.ts` | parseResponse | 정상 JSON, 불완전 JSON, 빈 응답 | 5개 |
| `tests/unit/prd-studio/ambiguity-scorer.test.ts` | detectProjectType | Greenfield, Brownfield, 경계 키워드 | 5개 |

#### 핵심 테스트 시나리오

```typescript
// tests/unit/prd-studio/ambiguity-scorer.test.ts

describe("AmbiguityScorer", () => {
  describe("computeWeightedScore", () => {
    it("Greenfield: goal=0.9, constraint=0.7, success=0.8 → clarity 0.81", () => {
      const dims: DimensionScore[] = [
        { dimension: "goal", score: 0.9, rationale: "", weakPoints: [], suggestedQuestions: [] },
        { dimension: "constraint", score: 0.7, rationale: "", weakPoints: [], suggestedQuestions: [] },
        { dimension: "success", score: 0.8, rationale: "", weakPoints: [], suggestedQuestions: [] },
      ];
      // 0.9*0.4 + 0.7*0.3 + 0.8*0.3 = 0.36 + 0.21 + 0.24 = 0.81
      expect(computeWeightedScore(dims, "greenfield")).toBeCloseTo(0.81);
    });

    it("Brownfield: 4차원 가중 합산 정확성", () => {
      const dims: DimensionScore[] = [
        { dimension: "goal", score: 0.8, rationale: "", weakPoints: [], suggestedQuestions: [] },
        { dimension: "constraint", score: 0.6, rationale: "", weakPoints: [], suggestedQuestions: [] },
        { dimension: "success", score: 0.7, rationale: "", weakPoints: [], suggestedQuestions: [] },
        { dimension: "context", score: 0.9, rationale: "", weakPoints: [], suggestedQuestions: [] },
      ];
      // 0.8*0.35 + 0.6*0.25 + 0.7*0.25 + 0.9*0.15 = 0.28 + 0.15 + 0.175 + 0.135 = 0.74
      expect(computeWeightedScore(dims, "brownfield")).toBeCloseTo(0.74);
    });
  });

  describe("getGateStatus", () => {
    it("ambiguity ≤ 0.2 → pass", () => {
      expect(getGateStatus(0.19)).toBe("pass");
      expect(getGateStatus(0.20)).toBe("pass");
    });
    it("0.2 < ambiguity ≤ 0.4 → warn", () => {
      expect(getGateStatus(0.21)).toBe("warn");
      expect(getGateStatus(0.40)).toBe("warn");
    });
    it("ambiguity > 0.4 → block", () => {
      expect(getGateStatus(0.41)).toBe("block");
    });
  });

  describe("detectProjectType", () => {
    it("background에 '기존 시스템' + '마이그레이션' 포함 → brownfield", () => {
      const sections = [{ type: "background", answer: "기존 시스템에서 마이그레이션 필요" }];
      expect(detectProjectType(sections)).toBe("brownfield");
    });
    it("키워드 1개만 → greenfield 유지", () => {
      const sections = [{ type: "background", answer: "기존 문제를 해결하는 신규 프로젝트" }];
      expect(detectProjectType(sections)).toBe("greenfield");
    });
    it("background 답변 없음 → greenfield", () => {
      expect(detectProjectType([])).toBe("greenfield");
    });
  });

  describe("getAffectedDimensions", () => {
    it("objectives 변경 → goal + success 재평가", () => {
      expect(getAffectedDimensions("objectives")).toEqual(["goal", "success"]);
    });
    it("risks 변경 → constraint만 재평가", () => {
      expect(getAffectedDimensions("risks")).toEqual(["constraint"]);
    });
  });
});
```

### 12.2 통합 테스트

| 파일 | 대상 | 테스트 케이스 | 예상 수 |
|------|------|-------------|---------|
| `tests/integration/api-prd-ambiguity.test.ts` | API 라우트 | 인증, 소유자 검증, DRAFT 상태 검증, 최소 답변 검증 | 8개 |

#### API 통합 테스트 시나리오

```typescript
describe("POST /api/prd-studio/:id/ambiguity", () => {
  it("미인증 → 401", async () => { /* ... */ });
  it("다른 테넌트 PRD → 404", async () => { /* ... */ });
  it("타인 PRD → 403", async () => { /* ... */ });
  it("GENERATED 상태 PRD → 400", async () => { /* ... */ });
  it("답변 2개 → 400 (최소 3개 필요)", async () => { /* ... */ });
  it("정상 평가 → 200 + AmbiguityResult", async () => { /* ... */ });
  it("부분 재평가 → 200 + 해당 차원만 갱신", async () => { /* ... */ });
  it("DB에 ambiguity_score, dimension_scores 저장 확인", async () => { /* ... */ });
});
```

### 12.3 게이트 로직 테스트

| 파일 | 대상 | 테스트 케이스 | 예상 수 |
|------|------|-------------|---------|
| `tests/unit/prd-studio/gate-logic.test.ts` | 게이트 흐름 | pass → generate 호출, warn → 모달, block → 모달, LLM 실패 → graceful | 6개 |

### 12.4 UI 스냅샷 테스트

| 파일 | 대상 | 테스트 케이스 | 예상 수 |
|------|------|-------------|---------|
| `tests/unit/prd-studio/ui/AmbiguityGauge.test.tsx` | AmbiguityGauge | null 결과, pass/warn/block 상태, 차원 카드 렌더링 | 5개 |
| `tests/unit/prd-studio/ui/GateBlocker.test.tsx` | GateBlocker | block 모달, warn 모달, 보충 질문 표시, 버튼 클릭 | 5개 |

### 12.5 테스트 총 예상

| 카테고리 | 테스트 수 |
|---------|----------|
| 단위 (scorer + parser + detector) | 25개 |
| 통합 (API 라우트) | 8개 |
| 게이트 로직 | 6개 |
| UI 컴포넌트 | 10개 |
| **합계** | **49개** |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-18 | Initial — F50 Ambiguity Score 설계 12섹션 작성. 컴포넌트 아키텍처, AmbiguityScorer, 차원 매핑, LLM 프롬프트, UI 3종, 게이트 로직, DB 스키마, 마이그레이션, API, 이벤트, 타입, 테스트 | Sinclair Seo |
