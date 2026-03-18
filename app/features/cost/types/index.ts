import type { Purpose } from "../constants/purpose";

export type BudgetTier = "normal" | "warn" | "degrade" | "block";

export type ReasonCode =
  | "primary"
  | "fallback_error"
  | "fallback_credit"
  | "budget_degrade"
  | "budget_block"
  | "capability_skip"
  | "policy_override"
  | "retry";

export type ProviderId = "anthropic" | "openai" | "google" | "deepseek" | "workers-ai";

export interface BudgetEvaluation {
  tier: BudgetTier;
  usagePct: number;
  budgetUsd: number;
  currentUsageUsd: number;
  policyId: string;
}

export interface RoutingRequest {
  userId: string;
  tenantId: string;
  purpose: Purpose;
  needsTools: boolean;
  needsStreaming: boolean;
  needsJsonMode: boolean;
  estimatedTokens?: number;
  /** PAL Router opt-in — true이면 복잡도 기반 티어 라우팅 활성화 */
  enablePalRouter?: boolean;
  /** PAL Router 입력 — enablePalRouter=true일 때 필수 */
  palInput?: {
    toolCount: number;
    conversationDepth: number;
  };
}

export interface RoutingResult {
  provider: ProviderId;
  model: string;
  decisionId: string;
  reasonCode: ReasonCode;
  budgetTier: BudgetTier;
  /** PAL Router 결과 (활성화 시에만 존재) */
  palTier?: "frugal" | "standard" | "frontier";
}

export interface UsageEventInput {
  userId: string;
  tenantId: string;
  conversationId?: string;
  provider: ProviderId;
  model: string;
  purpose: Purpose;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  latencyMs?: number;
  toolRounds?: number;
  retryOf?: string;
  routingDecisionId?: string;
}
