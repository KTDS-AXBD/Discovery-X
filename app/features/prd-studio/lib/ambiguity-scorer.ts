import { callLLM } from "~/lib/ai";
import type { FallbackContext } from "~/lib/ai";
import type {
  DimensionType,
  DimensionScore,
  AmbiguityResult,
  AmbiguityConfig,
  ProjectType,
} from "../types";

// ============================================================================
// 상수
// ============================================================================

/** 섹션 답변 입력 */
interface SectionInput {
  type: string;
  answer: string;
}

/** Greenfield(3차원) vs Brownfield(4차원) 가중치 */
const DIMENSION_WEIGHTS: Record<ProjectType, Record<DimensionType, number>> = {
  greenfield: {
    goal: 0.40,
    constraint: 0.30,
    success: 0.30,
    context: 0,
  },
  brownfield: {
    goal: 0.35,
    constraint: 0.25,
    success: 0.25,
    context: 0.15,
  },
};

/** 차원 → 매핑 섹션 */
const DIMENSION_TO_SECTIONS: Record<DimensionType, string[]> = {
  goal: ["summary", "objectives"],
  constraint: ["risks", "requirements"],
  success: ["objectives", "target_users"],
  context: ["background", "solution", "timeline"],
};

/** 섹션 → 영향 차원 (역매핑) */
const SECTION_TO_DIMENSION_MAP: Record<string, DimensionType[]> = {
  summary: ["goal"],
  background: ["context"],
  objectives: ["goal", "success"],
  target_users: ["success"],
  requirements: ["constraint"],
  solution: ["context"],
  risks: ["constraint"],
  timeline: ["context"],
};

const DIMENSION_LABELS: Record<DimensionType, string> = {
  goal: "Goal (목표 명확성)",
  constraint: "Constraint (제약 명확성)",
  success: "Success (성공 기준 명확성)",
  context: "Context (맥락 명확성)",
};

// ============================================================================
// AmbiguityScorer
// ============================================================================

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

  getAffectedDimensions(sectionType: string): DimensionType[] {
    return SECTION_TO_DIMENSION_MAP[sectionType] ?? [];
  }

  // ── 프롬프트 빌더 ────────────────────────────────────────

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

  // ── 응답 파서 ──────────────────────────────────────────────

  private parseResponse(text: string, projectType: ProjectType): DimensionScore[] {
    const parsed = parseJsonFromLLM(text);
    const dimensionTypes: DimensionType[] = projectType === "greenfield"
      ? ["goal", "constraint", "success"]
      : ["goal", "constraint", "success", "context"];

    const dimensions: DimensionScore[] = dimensionTypes.map((dim) => {
      const entry = parsed?.dimensions?.[dim];
      if (!entry || typeof entry.score !== "number") {
        return {
          dimension: dim,
          score: 0,
          rationale: "평가 실패",
          weakPoints: [],
          suggestedQuestions: [],
        };
      }
      return {
        dimension: dim,
        score: clampScore(entry.score),
        rationale: entry.rationale ?? "",
        weakPoints: Array.isArray(entry.weakPoints) ? entry.weakPoints : [],
        suggestedQuestions: Array.isArray(entry.suggestedQuestions) ? entry.suggestedQuestions : [],
      };
    });

    // Greenfield에서 context가 없으면 score 0으로 추가 (UI에서 N/A 표시용)
    if (projectType === "greenfield") {
      dimensions.push({
        dimension: "context",
        score: 0,
        rationale: "Greenfield 프로젝트 — 맥락 차원 미적용",
        weakPoints: [],
        suggestedQuestions: [],
      });
    }

    return dimensions;
  }

  private parsePartialResponse(text: string): DimensionScore[] {
    const parsed = parseJsonFromLLM(text);
    if (!parsed?.dimensions) return [];

    const results: DimensionScore[] = [];
    for (const [key, entry] of Object.entries(parsed.dimensions)) {
      const dim = key as DimensionType;
      const e = entry;
      if (!e || typeof e.score !== "number") continue;
      results.push({
        dimension: dim,
        score: clampScore(e.score),
        rationale: e.rationale ?? "",
        weakPoints: Array.isArray(e.weakPoints) ? e.weakPoints : [],
        suggestedQuestions: Array.isArray(e.suggestedQuestions) ? e.suggestedQuestions : [],
      });
    }
    return results;
  }
}

// ============================================================================
// 유틸리티
// ============================================================================

/** 차원에 매핑된 섹션 답변을 모아서 하나의 텍스트로 반환 */
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

/** LLM 응답 파싱 결과 타입 */
interface LLMDimensionResponse {
  dimensions?: Record<string, {
    score?: number;
    rationale?: string;
    weakPoints?: string[];
    suggestedQuestions?: string[];
  } | null>;
}

/** LLM 응답에서 JSON 추출 (markdown fence 제거) */
function parseJsonFromLLM(text: string): LLMDimensionResponse | null {
  try {
    // markdown code fence 제거
    const cleaned = text
      .replace(/^```(?:json)?\s*\n?/m, "")
      .replace(/\n?```\s*$/m, "")
      .trim();
    return JSON.parse(cleaned);
  } catch {
    // fence 없이 바로 JSON인 경우
    try {
      return JSON.parse(text.trim());
    } catch {
      return null;
    }
  }
}

/** 점수를 0.0~1.0으로 클램핑 (NaN → 0) */
function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(1, score));
}
