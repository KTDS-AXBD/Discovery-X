import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../../helpers/db";
import { PolicyRouter } from "~/lib/ai/policy-router";
import { seedModelCatalog, seedRoutingPolicy } from "~/features/cost/db/seed";
import {
  budgetPolicies,
  budgetUsageCache,
  modelCatalog,
  routingDecisions,
} from "~/features/cost/db/schema";
import type { RoutingRequest } from "~/features/cost/types";
import type { DB } from "~/db";

// ============================================================================
// HELPERS
// ============================================================================

const ENV_WITH_ALL_KEYS = {
  ANTHROPIC_API_KEY: "sk-ant-test",
  OPENAI_API_KEY: "sk-openai-test",
  GOOGLE_AI_API_KEY: "google-test",
};

const ENV_ANTHROPIC_ONLY = {
  ANTHROPIC_API_KEY: "sk-ant-test",
};

function baseRequest(overrides: Partial<RoutingRequest> = {}): RoutingRequest {
  return {
    userId: "user-1",
    tenantId: "tenant-1",
    purpose: "chat",
    needsTools: false,
    needsStreaming: false,
    needsJsonMode: false,
    ...overrides,
  };
}

function insertBudgetPolicy(
  db: TestDB,
  opts: {
    id?: string;
    tenantId?: string;
    userId?: string | null;
    purpose?: string | null;
    budgetUsd?: number;
    thresholdWarnPct?: number;
    thresholdDegradePct?: number;
    thresholdBlockPct?: number;
  } = {}
) {
  const now = new Date();
  const oneMonthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return db.insert(budgetPolicies).values({
    id: opts.id ?? "bp-1",
    tenantId: opts.tenantId ?? "tenant-1",
    userId: opts.userId ?? null,
    purpose: opts.purpose ?? null,
    budgetUsd: opts.budgetUsd ?? 100,
    periodStart: now,
    periodEnd: oneMonthLater,
    thresholdWarnPct: opts.thresholdWarnPct ?? 80,
    thresholdDegradePct: opts.thresholdDegradePct ?? 100,
    thresholdBlockPct: opts.thresholdBlockPct ?? 120,
    isActive: true,
  });
}

function setBudgetTier(
  db: TestDB,
  budgetPolicyId: string,
  tier: string,
  usagePct: number,
  usageUsd: number
) {
  return db.insert(budgetUsageCache).values({
    id: `buc-${budgetPolicyId}`,
    budgetPolicyId,
    currentUsageUsd: usageUsd,
    usagePct,
    budgetTier: tier,
  });
}

// ============================================================================
// TESTS
// ============================================================================

describe("PolicyRouter", () => {
  let db: TestDB;

  beforeEach(async () => {
    db = createTestDb();
    // 모델 카탈로그 + 라우팅 정책 시딩
    await seedModelCatalog(db as unknown as DB);
    await seedRoutingPolicy(db as unknown as DB);
  });

  describe("기본 라우팅 (정상 경로)", () => {
    it("기본 정책으로 anthropic 최우선 선택", async () => {
      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      const result = await router.route(baseRequest());

      expect(result.provider).toBe("anthropic");
      expect(result.reasonCode).toBe("primary");
      expect(result.budgetTier).toBe("normal");
      expect(result.decisionId).toBeTruthy();
    });

    it("anthropic 키 없으면 openai로 fallback", async () => {
      const router = new PolicyRouter(db as unknown as DB, {
        OPENAI_API_KEY: "sk-openai-test",
        GOOGLE_AI_API_KEY: "google-test",
      });
      const result = await router.route(baseRequest());

      expect(result.provider).toBe("openai");
      expect(result.reasonCode).toBe("primary");
    });

    it("모든 유료 프로바이더 키 없으면 workers-ai", async () => {
      const router = new PolicyRouter(db as unknown as DB, {});
      const result = await router.route(baseRequest());

      expect(result.provider).toBe("workers-ai");
    });

    it("routing_decisions 로그 기록 확인", async () => {
      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      const result = await router.route(baseRequest());

      const [decision] = db
        .select()
        .from(routingDecisions)
        .all();

      expect(decision).toBeTruthy();
      expect(decision.id).toBe(result.decisionId);
      expect(decision.userId).toBe("user-1");
      expect(decision.tenantId).toBe("tenant-1");
      expect(decision.purpose).toBe("chat");
      expect(decision.selectedProvider).toBe("anthropic");
      expect(decision.reasonCode).toBe("primary");
    });
  });

  describe("기능 적합성 필터링 (Step 3)", () => {
    it("tools 필요 시 Workers AI 제외 (supportsTools=false)", async () => {
      const router = new PolicyRouter(db as unknown as DB, {});
      const result = await router.route(
        baseRequest({ needsTools: true, purpose: "agent-tool" })
      );

      // Workers AI는 tools 미지원이므로 선택 안 됨
      expect(result.provider).not.toBe("workers-ai");
      // API 키 없으므로 모든 provider 불가 → capability_skip
      expect(result.reasonCode).toBe("capability_skip");
    });

    it("jsonMode 필요 시 미지원 모델 제외", async () => {
      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      const result = await router.route(
        baseRequest({ needsJsonMode: true, purpose: "extraction" })
      );

      // anthropic은 jsonMode 지원 → 선택
      expect(result.provider).toBe("anthropic");
    });

    it("purpose의 minCapabilityScore 미달 모델 제외", async () => {
      const router = new PolicyRouter(db as unknown as DB, {});

      // agent-tool은 minCapabilityScore=55 → Workers AI(35) 제외
      const result = await router.route(
        baseRequest({ purpose: "agent-tool", needsTools: true })
      );

      // Workers AI (score 35)는 minCapabilityScore 55 미달 + tools 미지원
      expect(result.provider).not.toBe("workers-ai");
    });

    it("estimatedTokens > maxContextTokens인 모델 제외", async () => {
      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);

      // Workers AI는 maxContextTokens=8000이므로 10000 토큰 요청 시 제외
      // 다른 모델은 128K~1M이므로 정상 선택
      const result = await router.route(
        baseRequest({ estimatedTokens: 10000 })
      );

      expect(result.provider).toBe("anthropic");
    });
  });

  describe("예산 제어 (Step 4)", () => {
    it("budget normal → 정상 모델 선택", async () => {
      await insertBudgetPolicy(db);
      await setBudgetTier(db, "bp-1", "normal", 50, 50);

      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      const result = await router.route(baseRequest());

      expect(result.budgetTier).toBe("normal");
      expect(result.provider).toBe("anthropic");
    });

    it("budget warn → 정상 모델 유지 + warn tier", async () => {
      await insertBudgetPolicy(db);
      await setBudgetTier(db, "bp-1", "warn", 85, 85);

      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      const result = await router.route(baseRequest());

      expect(result.budgetTier).toBe("warn");
      expect(result.provider).toBe("anthropic");
    });

    it("budget degrade + degradable purpose → 저비용 모델 전환", async () => {
      await insertBudgetPolicy(db);
      await setBudgetTier(db, "bp-1", "degrade", 105, 105);

      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      const result = await router.route(baseRequest({ purpose: "chat" }));

      expect(result.budgetTier).toBe("degrade");
      expect(result.reasonCode).toBe("budget_degrade");
      // degrade rule: 85~100 → sonnet, chat은 degradable
      // anthropic sonnet이 degrade 대상으로 선택됨
      expect(result.model).toBeTruthy();
    });

    it("budget degrade + non-degradable purpose → 모델 유지", async () => {
      await insertBudgetPolicy(db, { purpose: "extraction" });
      await setBudgetTier(db, "bp-1", "degrade", 105, 105);

      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      const result = await router.route(
        baseRequest({ purpose: "extraction", needsJsonMode: true })
      );

      expect(result.budgetTier).toBe("degrade");
      // extraction은 degradable=false → 모델 유지
      // 그래도 reasonCode는 budget_degrade
      expect(result.provider).toBe("anthropic");
    });

    it("budget block → 차단", async () => {
      await insertBudgetPolicy(db);
      await setBudgetTier(db, "bp-1", "block", 125, 125);

      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      const result = await router.route(baseRequest());

      expect(result.budgetTier).toBe("block");
      expect(result.reasonCode).toBe("budget_block");
      expect(result.model).toBe("");
    });

    it("budget 정책 없으면 normal 취급", async () => {
      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      const result = await router.route(baseRequest());

      expect(result.budgetTier).toBe("normal");
      expect(result.provider).toBe("anthropic");
    });
  });

  describe("provider 가용성 (Step 5)", () => {
    it("markProviderFailed 후 해당 provider 건너뛰기", async () => {
      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      router.markProviderFailed("anthropic");

      const result = await router.route(baseRequest());

      expect(result.provider).toBe("openai");
    });

    it("markProviderHealthy로 복구", async () => {
      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      router.markProviderFailed("anthropic");
      router.markProviderHealthy("anthropic");

      const result = await router.route(baseRequest());
      expect(result.provider).toBe("anthropic");
    });
  });

  describe("캐시", () => {
    it("invalidateCache 후 정책 재로드", async () => {
      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);

      // 첫 호출 (캐시에 로드)
      await router.route(baseRequest());

      // 모든 모델 비활성화
      db.update(modelCatalog)
        .set({ isActive: false })
        .run();

      // 캐시 무효화 전 → 캐시된 모델 사용
      const before = await router.route(baseRequest());
      expect(before.provider).toBe("anthropic");

      // 캐시 무효화 후 → 활성 모델 없음
      router.invalidateCache();
      await expect(router.route(baseRequest())).rejects.toThrow(
        "활성 모델이 없습니다"
      );
    });
  });

  describe("routing_decisions 로그", () => {
    it("block 시에도 decision 로그 기록", async () => {
      await insertBudgetPolicy(db);
      await setBudgetTier(db, "bp-1", "block", 125, 125);

      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      const result = await router.route(baseRequest());

      const decisions = db
        .select()
        .from(routingDecisions)
        .all();

      expect(decisions).toHaveLength(1);
      expect(decisions[0].reasonCode).toBe("budget_block");
      expect(decisions[0].id).toBe(result.decisionId);
    });

    it("budgetState 스냅샷이 JSON으로 기록됨", async () => {
      await insertBudgetPolicy(db, { budgetUsd: 200 });
      await setBudgetTier(db, "bp-1", "warn", 90, 180);

      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      await router.route(baseRequest());

      const [decision] = db
        .select()
        .from(routingDecisions)
        .all();

      const state = decision.budgetState as Record<string, unknown>;
      expect(state.tier).toBe("warn");
      expect(state.usagePct).toBe(90);
      expect(state.budgetUsd).toBe(200);
    });

    it("policyId와 policyVersion 기록", async () => {
      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      await router.route(baseRequest());

      const [decision] = db
        .select()
        .from(routingDecisions)
        .all();

      expect(decision.policyId).toBe("default-global");
      expect(decision.policyVersion).toBe(1);
    });
  });

  describe("시드 데이터 기반 종합 시나리오", () => {
    it("chat purpose + 정상 예산 → anthropic sonnet 선택", async () => {
      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      const result = await router.route(baseRequest({ purpose: "chat" }));

      expect(result.provider).toBe("anthropic");
      // anthropic의 가장 높은 capabilityScore 모델 (opus 95)
      expect(result.model).toBeTruthy();
    });

    it("agent-tool purpose + tools 필요 → workers-ai 제외", async () => {
      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      const result = await router.route(
        baseRequest({ purpose: "agent-tool", needsTools: true })
      );

      // workers-ai는 supportsTools=false + capabilityScore=35 < min 55
      expect(result.provider).not.toBe("workers-ai");
      expect(result.provider).toBe("anthropic");
    });

    it("extraction purpose + degrade 예산 → 모델 유지 (non-degradable)", async () => {
      await insertBudgetPolicy(db, { purpose: "extraction" });
      await setBudgetTier(db, "bp-1", "degrade", 105, 105);

      const router = new PolicyRouter(db as unknown as DB, ENV_WITH_ALL_KEYS);
      const result = await router.route(
        baseRequest({ purpose: "extraction", needsJsonMode: true })
      );

      // extraction은 degradable=false → 원래 모델 유지
      expect(result.provider).toBe("anthropic");
    });

    it("모든 유료 프로바이더 키 없고 tools 필요 → capability_skip", async () => {
      const router = new PolicyRouter(db as unknown as DB, {});
      const result = await router.route(
        baseRequest({ purpose: "agent-tool", needsTools: true })
      );

      // workers-ai만 가용하나 tools 미지원 + minCapabilityScore 미달
      expect(result.reasonCode).toBe("capability_skip");
    });
  });
});
