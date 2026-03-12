import type { DB } from "~/db";
import {
  modelCatalog,
  priceCatalog,
  routingPolicies,
  policyProviderPriorities,
  policyPurposeRules,
  policyDegradeRules,
} from "./schema";

// ============================================================================
// MODEL CATALOG SEED DATA (12 models, 2026-03 최신)
// ============================================================================

const MODEL_SEED_DATA = [
  // --- Anthropic ---
  {
    id: "anthropic:claude-opus-4-6",
    provider: "anthropic",
    modelId: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    capabilityScore: 95,
    maxContextTokens: 200000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: true,
  },
  {
    id: "anthropic:claude-sonnet-4-6",
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    capabilityScore: 80,
    maxContextTokens: 200000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: true,
  },
  {
    id: "anthropic:claude-haiku-4-5",
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5",
    capabilityScore: 50,
    maxContextTokens: 200000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: true,
  },
  // --- OpenAI (2026-03 최신: GPT-5.4 + GPT-4.1 계열) ---
  {
    id: "openai:gpt-5.4",
    provider: "openai",
    modelId: "gpt-5.4",
    displayName: "GPT-5.4",
    capabilityScore: 95,
    maxContextTokens: 1050000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: true,
  },
  {
    id: "openai:gpt-4.1",
    provider: "openai",
    modelId: "gpt-4.1",
    displayName: "GPT-4.1",
    capabilityScore: 90,
    maxContextTokens: 1000000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: true,
  },
  {
    id: "openai:gpt-4.1-mini",
    provider: "openai",
    modelId: "gpt-4.1-mini",
    displayName: "GPT-4.1 Mini",
    capabilityScore: 70,
    maxContextTokens: 1000000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: true,
  },
  {
    id: "openai:gpt-4.1-nano",
    provider: "openai",
    modelId: "gpt-4.1-nano",
    displayName: "GPT-4.1 Nano",
    capabilityScore: 55,
    maxContextTokens: 1000000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: true,
  },
  // --- Google Gemini (Pro 계정: 2.5 Pro + Flash) ---
  {
    id: "google:gemini-2.5-pro",
    provider: "google",
    modelId: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    capabilityScore: 85,
    maxContextTokens: 1000000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: true,
  },
  {
    id: "google:gemini-2.5-flash",
    provider: "google",
    modelId: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    capabilityScore: 65,
    maxContextTokens: 1000000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: false,
  },
  // --- DeepSeek (V3.2 자동 서빙, 128K 컨텍스트) ---
  {
    id: "deepseek:deepseek-chat",
    provider: "deepseek",
    modelId: "deepseek-chat",
    displayName: "DeepSeek V3.2",
    capabilityScore: 80,
    maxContextTokens: 128000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: true,
  },
  {
    id: "deepseek:deepseek-reasoner",
    provider: "deepseek",
    modelId: "deepseek-reasoner",
    displayName: "DeepSeek R1 V3.2",
    capabilityScore: 88,
    maxContextTokens: 128000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: false,
  },
  // --- Workers AI (무료 fallback) ---
  {
    id: "workers-ai:llama",
    provider: "workers-ai",
    modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    displayName: "Workers AI Llama",
    capabilityScore: 35,
    maxContextTokens: 8000,
    supportsTools: false,
    supportsStreaming: true,
    supportsJsonMode: false,
  },
] as const;

// ============================================================================
// PRICE CATALOG SEED DATA (12 models, 2026-03 최신)
// ============================================================================

const EFFECTIVE_FROM = new Date("2026-03-01");

const PRICE_SEED_DATA = [
  // Anthropic
  {
    modelCatalogId: "anthropic:claude-opus-4-6",
    inputPricePerMToken: 15.0,
    outputPricePerMToken: 75.0,
    cacheReadPricePerMToken: 1.5,
    cacheWritePricePerMToken: 18.75,
  },
  {
    modelCatalogId: "anthropic:claude-sonnet-4-6",
    inputPricePerMToken: 3.0,
    outputPricePerMToken: 15.0,
    cacheReadPricePerMToken: 0.3,
    cacheWritePricePerMToken: 3.75,
  },
  {
    modelCatalogId: "anthropic:claude-haiku-4-5",
    inputPricePerMToken: 0.8,
    outputPricePerMToken: 4.0,
    cacheReadPricePerMToken: 0.08,
    cacheWritePricePerMToken: 1.0,
  },
  // OpenAI (2026-03)
  {
    modelCatalogId: "openai:gpt-5.4",
    inputPricePerMToken: 2.5,
    outputPricePerMToken: 15.0,
    cacheReadPricePerMToken: null,
    cacheWritePricePerMToken: null,
  },
  {
    modelCatalogId: "openai:gpt-4.1",
    inputPricePerMToken: 2.0,
    outputPricePerMToken: 8.0,
    cacheReadPricePerMToken: null,
    cacheWritePricePerMToken: null,
  },
  {
    modelCatalogId: "openai:gpt-4.1-mini",
    inputPricePerMToken: 0.4,
    outputPricePerMToken: 1.6,
    cacheReadPricePerMToken: null,
    cacheWritePricePerMToken: null,
  },
  {
    modelCatalogId: "openai:gpt-4.1-nano",
    inputPricePerMToken: 0.1,
    outputPricePerMToken: 0.4,
    cacheReadPricePerMToken: null,
    cacheWritePricePerMToken: null,
  },
  // Google Gemini
  {
    modelCatalogId: "google:gemini-2.5-pro",
    inputPricePerMToken: 1.25,
    outputPricePerMToken: 10.0,
    cacheReadPricePerMToken: null,
    cacheWritePricePerMToken: null,
  },
  {
    modelCatalogId: "google:gemini-2.5-flash",
    inputPricePerMToken: 0.15,
    outputPricePerMToken: 0.6,
    cacheReadPricePerMToken: null,
    cacheWritePricePerMToken: null,
  },
  // DeepSeek V3.2 (2026-03)
  {
    modelCatalogId: "deepseek:deepseek-chat",
    inputPricePerMToken: 0.28,
    outputPricePerMToken: 0.42,
    cacheReadPricePerMToken: 0.028,
    cacheWritePricePerMToken: null,
  },
  {
    modelCatalogId: "deepseek:deepseek-reasoner",
    inputPricePerMToken: 0.28,
    outputPricePerMToken: 0.42,
    cacheReadPricePerMToken: 0.028,
    cacheWritePricePerMToken: null,
  },
  // Workers AI
  {
    modelCatalogId: "workers-ai:llama",
    inputPricePerMToken: 0.0,
    outputPricePerMToken: 0.0,
    cacheReadPricePerMToken: null,
    cacheWritePricePerMToken: null,
  },
] as const;

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

export async function seedModelCatalog(db: DB): Promise<number> {
  let count = 0;
  for (const data of MODEL_SEED_DATA) {
    await db
      .insert(modelCatalog)
      .values({
        id: data.id,
        provider: data.provider,
        modelId: data.modelId,
        displayName: data.displayName,
        capabilityScore: data.capabilityScore,
        maxContextTokens: data.maxContextTokens,
        supportsTools: data.supportsTools,
        supportsStreaming: data.supportsStreaming,
        supportsJsonMode: data.supportsJsonMode,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: modelCatalog.id,
        set: {
          provider: data.provider,
          modelId: data.modelId,
          displayName: data.displayName,
          capabilityScore: data.capabilityScore,
          maxContextTokens: data.maxContextTokens,
          supportsTools: data.supportsTools,
          supportsStreaming: data.supportsStreaming,
          supportsJsonMode: data.supportsJsonMode,
          isActive: true,
        },
      });
    count++;
  }
  return count;
}

export async function seedPriceCatalog(db: DB): Promise<number> {
  let count = 0;
  for (const data of PRICE_SEED_DATA) {
    const id = `price-${data.modelCatalogId}`;
    await db
      .insert(priceCatalog)
      .values({
        id,
        modelCatalogId: data.modelCatalogId,
        inputPricePerMToken: data.inputPricePerMToken,
        outputPricePerMToken: data.outputPricePerMToken,
        cacheReadPricePerMToken: data.cacheReadPricePerMToken,
        cacheWritePricePerMToken: data.cacheWritePricePerMToken,
        effectiveFrom: EFFECTIVE_FROM,
      })
      .onConflictDoUpdate({
        target: priceCatalog.id,
        set: {
          inputPricePerMToken: data.inputPricePerMToken,
          outputPricePerMToken: data.outputPricePerMToken,
          cacheReadPricePerMToken: data.cacheReadPricePerMToken,
          cacheWritePricePerMToken: data.cacheWritePricePerMToken,
        },
      });
    count++;
  }
  return count;
}

// ============================================================================
// ROUTING POLICY SEED DATA (DX-DSGN-011 §7.2)
// ============================================================================

const DEFAULT_POLICY_ID = "default-global";

const PROVIDER_PRIORITIES = [
  { provider: "anthropic", priority: 1 },
  { provider: "deepseek", priority: 2 },
  { provider: "openai", priority: 3 },
  { provider: "google", priority: 4 },
  { provider: "workers-ai", priority: 5 },
] as const;

const PURPOSE_RULES = [
  {
    purpose: "chat",
    minCapabilityScore: 35,
    requiresTools: false,
    requiresJsonMode: false,
    requiresStreaming: false,
    degradable: true,
    degradeToScore: 35,
  },
  {
    purpose: "analysis",
    minCapabilityScore: 55,
    requiresTools: false,
    requiresJsonMode: false,
    requiresStreaming: false,
    degradable: true,
    degradeToScore: 35,
  },
  {
    purpose: "extraction",
    minCapabilityScore: 55,
    requiresTools: false,
    requiresJsonMode: true,
    requiresStreaming: false,
    degradable: false,
    degradeToScore: null,
  },
  {
    purpose: "batch",
    minCapabilityScore: 35,
    requiresTools: false,
    requiresJsonMode: false,
    requiresStreaming: false,
    degradable: true,
    degradeToScore: 35,
  },
  {
    purpose: "agent-tool",
    minCapabilityScore: 55,
    requiresTools: true,
    requiresJsonMode: false,
    requiresStreaming: false,
    degradable: false,
    degradeToScore: null,
  },
  {
    purpose: "eval",
    minCapabilityScore: 55,
    requiresTools: false,
    requiresJsonMode: false,
    requiresStreaming: false,
    degradable: false,
    degradeToScore: null,
  },
] as const;

const DEGRADE_RULES = [
  {
    fromMinScore: 85,
    fromMaxScore: 100,
    degradeToModelId: "anthropic:claude-sonnet-4-6",
    action: "degrade",
  },
  {
    fromMinScore: 55,
    fromMaxScore: 84,
    degradeToModelId: "anthropic:claude-haiku-4-5",
    action: "degrade",
  },
  {
    fromMinScore: 0,
    fromMaxScore: 54,
    degradeToModelId: null,
    action: "block",
  },
] as const;

export async function seedRoutingPolicy(db: DB): Promise<number> {
  let count = 0;

  // 1. routing_policies 본체
  await db
    .insert(routingPolicies)
    .values({
      id: DEFAULT_POLICY_ID,
      tenantId: null, // 전역 정책
      name: "default-global",
      version: 1,
      isActive: true,
      priority: 100,
    })
    .onConflictDoUpdate({
      target: routingPolicies.id,
      set: {
        name: "default-global",
        version: 1,
        isActive: true,
        priority: 100,
      },
    });
  count++;

  // 2. provider priorities
  for (const pp of PROVIDER_PRIORITIES) {
    const id = `${DEFAULT_POLICY_ID}-pp-${pp.provider}`;
    await db
      .insert(policyProviderPriorities)
      .values({
        id,
        policyId: DEFAULT_POLICY_ID,
        policyVersion: 1,
        provider: pp.provider,
        priority: pp.priority,
      })
      .onConflictDoUpdate({
        target: policyProviderPriorities.id,
        set: {
          provider: pp.provider,
          priority: pp.priority,
        },
      });
    count++;
  }

  // 3. purpose rules
  for (const pr of PURPOSE_RULES) {
    const id = `${DEFAULT_POLICY_ID}-pr-${pr.purpose}`;
    await db
      .insert(policyPurposeRules)
      .values({
        id,
        policyId: DEFAULT_POLICY_ID,
        policyVersion: 1,
        purpose: pr.purpose,
        minCapabilityScore: pr.minCapabilityScore,
        requiresTools: pr.requiresTools,
        requiresJsonMode: pr.requiresJsonMode,
        requiresStreaming: pr.requiresStreaming,
        degradable: pr.degradable,
        degradeToScore: pr.degradeToScore,
      })
      .onConflictDoUpdate({
        target: policyPurposeRules.id,
        set: {
          minCapabilityScore: pr.minCapabilityScore,
          requiresTools: pr.requiresTools,
          requiresJsonMode: pr.requiresJsonMode,
          requiresStreaming: pr.requiresStreaming,
          degradable: pr.degradable,
          degradeToScore: pr.degradeToScore,
        },
      });
    count++;
  }

  // 4. degrade rules
  for (let i = 0; i < DEGRADE_RULES.length; i++) {
    const dr = DEGRADE_RULES[i];
    const id = `${DEFAULT_POLICY_ID}-dr-${i}`;
    await db
      .insert(policyDegradeRules)
      .values({
        id,
        policyId: DEFAULT_POLICY_ID,
        policyVersion: 1,
        fromMinScore: dr.fromMinScore,
        fromMaxScore: dr.fromMaxScore,
        degradeToModelId: dr.degradeToModelId,
        action: dr.action,
      })
      .onConflictDoUpdate({
        target: policyDegradeRules.id,
        set: {
          fromMinScore: dr.fromMinScore,
          fromMaxScore: dr.fromMaxScore,
          degradeToModelId: dr.degradeToModelId,
          action: dr.action,
        },
      });
    count++;
  }

  return count;
}

export async function seedAll(
  db: DB
): Promise<{ models: number; prices: number; routingPolicy: number }> {
  const models = await seedModelCatalog(db);
  const prices = await seedPriceCatalog(db);
  const routingPolicy = await seedRoutingPolicy(db);
  return { models, prices, routingPolicy };
}
