/**
 * GTM 결과 파서 — LLM JSON 응답 → GtmResult
 *
 * markdown 래핑 제거, snake_case 호환, 부분 결과 허용, priority 정규화.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BeachheadSegment {
  segment: string;
  rationale: string;
  size: string;
  accessibility: string;
}

export interface Icp {
  profile: string;
  demographics: string;
  psychographics: string;
  painPoints: string[];
  buyingTriggers: string[];
}

export interface Messaging {
  oneLiner: string;
  elevatorPitch: string;
  keyMessages: string[];
}

export interface Channel {
  name: string;
  priority: "primary" | "secondary" | "experimental";
  rationale: string;
  estimatedCost: string;
}

export interface ChannelStrategy {
  channels: Channel[];
  recommendation: string;
}

export interface LaunchPhase {
  name: string;
  duration: string;
  objectives: string[];
  actions: string[];
}

export interface LaunchPlan {
  phases: LaunchPhase[];
}

export interface GtmResult {
  beachheadSegment: BeachheadSegment;
  icp: Icp;
  messaging: Messaging;
  channelStrategy: ChannelStrategy;
  launchPlan: LaunchPlan;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const EMPTY_BEACHHEAD: BeachheadSegment = {
  segment: "",
  rationale: "",
  size: "",
  accessibility: "",
};

const EMPTY_ICP: Icp = {
  profile: "",
  demographics: "",
  psychographics: "",
  painPoints: [],
  buyingTriggers: [],
};

const EMPTY_MESSAGING: Messaging = {
  oneLiner: "",
  elevatorPitch: "",
  keyMessages: [],
};

const EMPTY_CHANNEL_STRATEGY: ChannelStrategy = {
  channels: [],
  recommendation: "",
};

const EMPTY_LAUNCH_PLAN: LaunchPlan = {
  phases: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripMarkdownWrapper(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return match ? match[1].trim() : trimmed;
}

const VALID_PRIORITIES = new Set(["primary", "secondary", "experimental"]);

function normalizePriority(value: unknown): "primary" | "secondary" | "experimental" {
  const s = String(value ?? "").toLowerCase();
  return VALID_PRIORITIES.has(s) ? (s as "primary" | "secondary" | "experimental") : "secondary";
}

function ensureArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseGtmResult(raw: string): GtmResult {
  const cleaned = stripMarkdownWrapper(raw);
  if (!cleaned) {
    return {
      beachheadSegment: EMPTY_BEACHHEAD,
      icp: EMPTY_ICP,
      messaging: EMPTY_MESSAGING,
      channelStrategy: EMPTY_CHANNEL_STRATEGY,
      launchPlan: EMPTY_LAUNCH_PLAN,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      beachheadSegment: EMPTY_BEACHHEAD,
      icp: EMPTY_ICP,
      messaging: EMPTY_MESSAGING,
      channelStrategy: EMPTY_CHANNEL_STRATEGY,
      launchPlan: EMPTY_LAUNCH_PLAN,
    };
  }

  return {
    beachheadSegment: parseBeachhead(parsed.beachheadSegment ?? parsed.beachhead_segment),
    icp: parseIcp(parsed.icp),
    messaging: parseMessaging(parsed.messaging),
    channelStrategy: parseChannelStrategy(parsed.channelStrategy ?? parsed.channel_strategy),
    launchPlan: parseLaunchPlan(parsed.launchPlan ?? parsed.launch_plan),
  };
}

// ---------------------------------------------------------------------------
// Sub-parsers
// ---------------------------------------------------------------------------

function parseBeachhead(raw: unknown): BeachheadSegment {
  if (!raw || typeof raw !== "object") return EMPTY_BEACHHEAD;
  const obj = raw as Record<string, unknown>;
  return {
    segment: String(obj.segment ?? ""),
    rationale: String(obj.rationale ?? ""),
    size: String(obj.size ?? ""),
    accessibility: String(obj.accessibility ?? ""),
  };
}

function parseIcp(raw: unknown): Icp {
  if (!raw || typeof raw !== "object") return EMPTY_ICP;
  const obj = raw as Record<string, unknown>;
  return {
    profile: String(obj.profile ?? ""),
    demographics: String(obj.demographics ?? ""),
    psychographics: String(obj.psychographics ?? ""),
    painPoints: ensureArray(obj.painPoints ?? obj.pain_points),
    buyingTriggers: ensureArray(obj.buyingTriggers ?? obj.buying_triggers),
  };
}

function parseMessaging(raw: unknown): Messaging {
  if (!raw || typeof raw !== "object") return EMPTY_MESSAGING;
  const obj = raw as Record<string, unknown>;
  return {
    oneLiner: String(obj.oneLiner ?? obj.one_liner ?? ""),
    elevatorPitch: String(obj.elevatorPitch ?? obj.elevator_pitch ?? ""),
    keyMessages: ensureArray(obj.keyMessages ?? obj.key_messages),
  };
}

function parseChannel(raw: unknown): Channel {
  if (!raw || typeof raw !== "object") {
    return { name: "", priority: "secondary", rationale: "", estimatedCost: "" };
  }
  const obj = raw as Record<string, unknown>;
  return {
    name: String(obj.name ?? ""),
    priority: normalizePriority(obj.priority),
    rationale: String(obj.rationale ?? ""),
    estimatedCost: String(obj.estimatedCost ?? obj.estimated_cost ?? ""),
  };
}

function parseChannelStrategy(raw: unknown): ChannelStrategy {
  if (!raw || typeof raw !== "object") return EMPTY_CHANNEL_STRATEGY;
  const obj = raw as Record<string, unknown>;
  return {
    channels: Array.isArray(obj.channels) ? obj.channels.map(parseChannel) : [],
    recommendation: String(obj.recommendation ?? ""),
  };
}

function parseLaunchPhase(raw: unknown): LaunchPhase {
  if (!raw || typeof raw !== "object") {
    return { name: "", duration: "", objectives: [], actions: [] };
  }
  const obj = raw as Record<string, unknown>;
  return {
    name: String(obj.name ?? ""),
    duration: String(obj.duration ?? ""),
    objectives: ensureArray(obj.objectives),
    actions: ensureArray(obj.actions),
  };
}

function parseLaunchPlan(raw: unknown): LaunchPlan {
  if (!raw || typeof raw !== "object") return EMPTY_LAUNCH_PLAN;
  const obj = raw as Record<string, unknown>;
  return {
    phases: Array.isArray(obj.phases) ? obj.phases.map(parseLaunchPhase) : [],
  };
}
