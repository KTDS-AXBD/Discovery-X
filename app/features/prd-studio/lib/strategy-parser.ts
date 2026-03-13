/**
 * 전략 프레임워크 파서 — LLM JSON 응답 → StrategyResult
 *
 * markdown 래핑 제거, snake_case 호환, 부분 결과 허용, 값 정규화.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwotResult {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  crossAnalysis: string;
}

export interface LeanCanvasResult {
  problem: string;
  solution: string;
  keyMetrics: string;
  uniqueValueProp: string;
  unfairAdvantage: string;
  channels: string;
  customerSegments: string;
  costStructure: string;
  revenueStreams: string;
}

export interface JtbdResult {
  who: string;
  why: string;
  whatBefore: string;
  how: string;
  whatAfter: string;
  alternatives: string;
}

export interface Competitor {
  name: string;
  description: string;
  strengths: string[];
  weaknesses: string[];
}

export interface CompetitionResult {
  directCompetitors: Competitor[];
  indirectCompetitors: Competitor[];
  differentiation: string;
}

export interface MarketSizingEntry {
  value: string;
  description: string;
}

export interface MarketSizingResult {
  tam: MarketSizingEntry;
  sam: MarketSizingEntry;
  som: MarketSizingEntry;
  methodology: string;
  assumptions: string[];
}

export interface Risk {
  category: string;
  description: string;
  impact: "high" | "medium" | "low";
  likelihood: "high" | "medium" | "low";
  mitigation: string;
}

export interface RiskAssessmentResult {
  risks: Risk[];
  overallRiskLevel: "high" | "medium" | "low";
  summary: string;
}

export interface StrategyResult {
  swot: SwotResult;
  leanCanvas: LeanCanvasResult;
  jtbd: JtbdResult;
  competition: CompetitionResult;
  marketSizing: MarketSizingResult;
  riskAssessment: RiskAssessmentResult;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const EMPTY_SWOT: SwotResult = {
  strengths: [],
  weaknesses: [],
  opportunities: [],
  threats: [],
  crossAnalysis: "",
};

const EMPTY_LEAN_CANVAS: LeanCanvasResult = {
  problem: "",
  solution: "",
  keyMetrics: "",
  uniqueValueProp: "",
  unfairAdvantage: "",
  channels: "",
  customerSegments: "",
  costStructure: "",
  revenueStreams: "",
};

const EMPTY_JTBD: JtbdResult = {
  who: "",
  why: "",
  whatBefore: "",
  how: "",
  whatAfter: "",
  alternatives: "",
};

const EMPTY_COMPETITION: CompetitionResult = {
  directCompetitors: [],
  indirectCompetitors: [],
  differentiation: "",
};

const EMPTY_MARKET_SIZING: MarketSizingResult = {
  tam: { value: "", description: "" },
  sam: { value: "", description: "" },
  som: { value: "", description: "" },
  methodology: "",
  assumptions: [],
};

const EMPTY_RISK_ASSESSMENT: RiskAssessmentResult = {
  risks: [],
  overallRiskLevel: "medium",
  summary: "",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripMarkdownWrapper(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return match ? match[1].trim() : trimmed;
}

const VALID_LEVELS = new Set(["high", "medium", "low"]);

function normalizeLevel(value: unknown): "high" | "medium" | "low" {
  const s = String(value ?? "").toLowerCase();
  return VALID_LEVELS.has(s) ? (s as "high" | "medium" | "low") : "medium";
}

function ensureArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseStrategyResult(raw: string): StrategyResult {
  const cleaned = stripMarkdownWrapper(raw);
  if (!cleaned) {
    return {
      swot: EMPTY_SWOT,
      leanCanvas: EMPTY_LEAN_CANVAS,
      jtbd: EMPTY_JTBD,
      competition: EMPTY_COMPETITION,
      marketSizing: EMPTY_MARKET_SIZING,
      riskAssessment: EMPTY_RISK_ASSESSMENT,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      swot: EMPTY_SWOT,
      leanCanvas: EMPTY_LEAN_CANVAS,
      jtbd: EMPTY_JTBD,
      competition: EMPTY_COMPETITION,
      marketSizing: EMPTY_MARKET_SIZING,
      riskAssessment: EMPTY_RISK_ASSESSMENT,
    };
  }

  return {
    swot: parseSwot(parsed.swot),
    leanCanvas: parseLeanCanvas(parsed.leanCanvas ?? parsed.lean_canvas),
    jtbd: parseJtbd(parsed.jtbd),
    competition: parseCompetition(parsed.competition),
    marketSizing: parseMarketSizing(parsed.marketSizing ?? parsed.market_sizing),
    riskAssessment: parseRiskAssessment(parsed.riskAssessment ?? parsed.risk_assessment),
  };
}

// ---------------------------------------------------------------------------
// Sub-parsers
// ---------------------------------------------------------------------------

function parseSwot(raw: unknown): SwotResult {
  if (!raw || typeof raw !== "object") return EMPTY_SWOT;
  const obj = raw as Record<string, unknown>;
  return {
    strengths: ensureArray(obj.strengths),
    weaknesses: ensureArray(obj.weaknesses),
    opportunities: ensureArray(obj.opportunities),
    threats: ensureArray(obj.threats),
    crossAnalysis: String(obj.crossAnalysis ?? obj.cross_analysis ?? ""),
  };
}

function parseLeanCanvas(raw: unknown): LeanCanvasResult {
  if (!raw || typeof raw !== "object") return EMPTY_LEAN_CANVAS;
  const obj = raw as Record<string, unknown>;
  return {
    problem: String(obj.problem ?? ""),
    solution: String(obj.solution ?? ""),
    keyMetrics: String(obj.keyMetrics ?? obj.key_metrics ?? ""),
    uniqueValueProp: String(obj.uniqueValueProp ?? obj.unique_value_prop ?? ""),
    unfairAdvantage: String(obj.unfairAdvantage ?? obj.unfair_advantage ?? ""),
    channels: String(obj.channels ?? ""),
    customerSegments: String(obj.customerSegments ?? obj.customer_segments ?? ""),
    costStructure: String(obj.costStructure ?? obj.cost_structure ?? ""),
    revenueStreams: String(obj.revenueStreams ?? obj.revenue_streams ?? ""),
  };
}

function parseJtbd(raw: unknown): JtbdResult {
  if (!raw || typeof raw !== "object") return EMPTY_JTBD;
  const obj = raw as Record<string, unknown>;
  return {
    who: String(obj.who ?? ""),
    why: String(obj.why ?? ""),
    whatBefore: String(obj.whatBefore ?? obj.what_before ?? ""),
    how: String(obj.how ?? ""),
    whatAfter: String(obj.whatAfter ?? obj.what_after ?? ""),
    alternatives: String(obj.alternatives ?? ""),
  };
}

function parseCompetitor(raw: unknown): Competitor {
  if (!raw || typeof raw !== "object") return { name: "", description: "", strengths: [], weaknesses: [] };
  const obj = raw as Record<string, unknown>;
  return {
    name: String(obj.name ?? ""),
    description: String(obj.description ?? ""),
    strengths: ensureArray(obj.strengths),
    weaknesses: ensureArray(obj.weaknesses),
  };
}

function parseCompetition(raw: unknown): CompetitionResult {
  if (!raw || typeof raw !== "object") return EMPTY_COMPETITION;
  const obj = raw as Record<string, unknown>;
  const direct = obj.directCompetitors ?? obj.direct_competitors;
  const indirect = obj.indirectCompetitors ?? obj.indirect_competitors;
  return {
    directCompetitors: Array.isArray(direct) ? direct.map(parseCompetitor) : [],
    indirectCompetitors: Array.isArray(indirect) ? indirect.map(parseCompetitor) : [],
    differentiation: String(obj.differentiation ?? ""),
  };
}

function parseMarketSizingEntry(raw: unknown): MarketSizingEntry {
  if (!raw || typeof raw !== "object") return { value: "", description: "" };
  const obj = raw as Record<string, unknown>;
  return {
    value: String(obj.value ?? ""),
    description: String(obj.description ?? ""),
  };
}

function parseMarketSizing(raw: unknown): MarketSizingResult {
  if (!raw || typeof raw !== "object") return EMPTY_MARKET_SIZING;
  const obj = raw as Record<string, unknown>;
  return {
    tam: parseMarketSizingEntry(obj.tam),
    sam: parseMarketSizingEntry(obj.sam),
    som: parseMarketSizingEntry(obj.som),
    methodology: String(obj.methodology ?? ""),
    assumptions: ensureArray(obj.assumptions),
  };
}

function parseRisk(raw: unknown): Risk {
  if (!raw || typeof raw !== "object") {
    return { category: "", description: "", impact: "medium", likelihood: "medium", mitigation: "" };
  }
  const obj = raw as Record<string, unknown>;
  return {
    category: String(obj.category ?? ""),
    description: String(obj.description ?? ""),
    impact: normalizeLevel(obj.impact),
    likelihood: normalizeLevel(obj.likelihood),
    mitigation: String(obj.mitigation ?? ""),
  };
}

function parseRiskAssessment(raw: unknown): RiskAssessmentResult {
  if (!raw || typeof raw !== "object") return EMPTY_RISK_ASSESSMENT;
  const obj = raw as Record<string, unknown>;
  return {
    risks: Array.isArray(obj.risks) ? obj.risks.map(parseRisk) : [],
    overallRiskLevel: normalizeLevel(obj.overallRiskLevel ?? obj.overall_risk_level),
    summary: String(obj.summary ?? ""),
  };
}
