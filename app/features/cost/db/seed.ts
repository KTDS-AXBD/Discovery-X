import type { DB } from "~/db";
import { modelCatalog, priceCatalog } from "./schema";

// ============================================================================
// MODEL CATALOG SEED DATA (7 models)
// ============================================================================

const MODEL_SEED_DATA = [
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
  {
    id: "openai:gpt-4o",
    provider: "openai",
    modelId: "gpt-4o",
    displayName: "GPT-4o",
    capabilityScore: 90,
    maxContextTokens: 128000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: true,
  },
  {
    id: "openai:gpt-4o-mini",
    provider: "openai",
    modelId: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    capabilityScore: 70,
    maxContextTokens: 128000,
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
// PRICE CATALOG SEED DATA (7 models, effectiveFrom = 2025-01-01)
// ============================================================================

const EFFECTIVE_FROM = new Date("2025-01-01");

const PRICE_SEED_DATA = [
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
  {
    modelCatalogId: "openai:gpt-4o",
    inputPricePerMToken: 2.5,
    outputPricePerMToken: 10.0,
    cacheReadPricePerMToken: null,
    cacheWritePricePerMToken: null,
  },
  {
    modelCatalogId: "openai:gpt-4o-mini",
    inputPricePerMToken: 0.15,
    outputPricePerMToken: 0.6,
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

export async function seedAll(
  db: DB
): Promise<{ models: number; prices: number }> {
  const models = await seedModelCatalog(db);
  const prices = await seedPriceCatalog(db);
  return { models, prices };
}
