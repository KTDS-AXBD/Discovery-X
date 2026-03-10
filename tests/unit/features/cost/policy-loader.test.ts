import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../../helpers/db";
import type { DB } from "~/db";
import { PolicyLoader } from "~/features/cost/service/policy-loader";
import {
  routingPolicies,
  policyProviderPriorities,
  policyPurposeRules,
  policyDegradeRules,
} from "~/features/cost/db/schema";

// ============================================================================
// HELPERS
// ============================================================================

function insertPolicy(
  db: TestDB,
  overrides: Partial<{
    id: string;
    tenantId: string | null;
    name: string;
    version: number;
    isActive: boolean;
    priority: number;
  }> = {}
) {
  const id = overrides.id ?? "test-policy";
  return db.insert(routingPolicies).values({
    id,
    tenantId: overrides.tenantId ?? null,
    name: overrides.name ?? "test",
    version: overrides.version ?? 1,
    isActive: overrides.isActive ?? true,
    priority: overrides.priority ?? 100,
  });
}

function insertProviderPriorities(
  db: TestDB,
  policyId: string,
  providers: { provider: string; priority: number }[]
) {
  return Promise.all(
    providers.map((p, i) =>
      db.insert(policyProviderPriorities).values({
        id: `${policyId}-pp-${i}`,
        policyId,
        policyVersion: 1,
        provider: p.provider,
        priority: p.priority,
      })
    )
  );
}

function insertPurposeRules(
  db: TestDB,
  policyId: string,
  rules: {
    purpose: string;
    minCapabilityScore: number;
    degradable: boolean;
    requiresTools?: boolean;
    requiresJsonMode?: boolean;
  }[]
) {
  return Promise.all(
    rules.map((r, i) =>
      db.insert(policyPurposeRules).values({
        id: `${policyId}-pr-${i}`,
        policyId,
        policyVersion: 1,
        purpose: r.purpose,
        minCapabilityScore: r.minCapabilityScore,
        degradable: r.degradable,
        requiresTools: r.requiresTools ?? false,
        requiresJsonMode: r.requiresJsonMode ?? false,
        requiresStreaming: false,
      })
    )
  );
}

function insertDegradeRules(
  db: TestDB,
  policyId: string,
  rules: {
    fromMinScore: number;
    fromMaxScore: number;
    degradeToModelId: string | null;
    action: string;
  }[]
) {
  return Promise.all(
    rules.map((r, i) =>
      db.insert(policyDegradeRules).values({
        id: `${policyId}-dr-${i}`,
        policyId,
        policyVersion: 1,
        fromMinScore: r.fromMinScore,
        fromMaxScore: r.fromMaxScore,
        degradeToModelId: r.degradeToModelId,
        action: r.action,
      })
    )
  );
}

// ============================================================================
// TESTS
// ============================================================================

describe("PolicyLoader", () => {
  let db: TestDB;
  let loader: PolicyLoader;

  beforeEach(() => {
    db = createTestDb();
    loader = new PolicyLoader(db as unknown as DB);
  });

  describe("loadPolicy", () => {
    it("정책이 없으면 null 반환", async () => {
      const result = await loader.loadPolicy("tenant-1");
      expect(result).toBeNull();
    });

    it("전역 정책(tenantId=null) 로드", async () => {
      await insertPolicy(db, { id: "global-1", tenantId: null });
      await insertProviderPriorities(db, "global-1", [
        { provider: "anthropic", priority: 1 },
        { provider: "openai", priority: 2 },
      ]);

      const result = await loader.loadPolicy("any-tenant");

      expect(result).not.toBeNull();
      expect(result!.policy.id).toBe("global-1");
      expect(result!.providerPriorities).toHaveLength(2);
      expect(result!.providerPriorities[0].provider).toBe("anthropic");
    });

    it("tenant-specific 정책이 전역보다 우선", async () => {
      await insertPolicy(db, {
        id: "global-1",
        tenantId: null,
        priority: 100,
      });
      await insertPolicy(db, {
        id: "tenant-1-policy",
        tenantId: "tenant-1",
        priority: 50,
      });
      await insertProviderPriorities(db, "tenant-1-policy", [
        { provider: "openai", priority: 1 },
      ]);

      const result = await loader.loadPolicy("tenant-1");

      expect(result!.policy.id).toBe("tenant-1-policy");
      expect(result!.providerPriorities[0].provider).toBe("openai");
    });

    it("비활성 정책은 무시", async () => {
      await insertPolicy(db, {
        id: "inactive",
        tenantId: null,
        isActive: false,
      });

      const result = await loader.loadPolicy("tenant-1");
      expect(result).toBeNull();
    });

    it("가장 낮은 priority 값의 정책 선택", async () => {
      await insertPolicy(db, {
        id: "high-priority",
        tenantId: "t1",
        priority: 10,
      });
      await insertPolicy(db, {
        id: "low-priority",
        tenantId: "t1",
        priority: 200,
      });

      const result = await loader.loadPolicy("t1");
      expect(result!.policy.id).toBe("high-priority");
    });

    it("정규화 3테이블 모두 로드", async () => {
      await insertPolicy(db, { id: "full-policy", tenantId: null });
      await insertProviderPriorities(db, "full-policy", [
        { provider: "anthropic", priority: 1 },
        { provider: "openai", priority: 2 },
        { provider: "google", priority: 3 },
      ]);
      await insertPurposeRules(db, "full-policy", [
        { purpose: "chat", minCapabilityScore: 35, degradable: true },
        {
          purpose: "extraction",
          minCapabilityScore: 55,
          degradable: false,
          requiresJsonMode: true,
        },
      ]);
      await insertDegradeRules(db, "full-policy", [
        {
          fromMinScore: 85,
          fromMaxScore: 100,
          degradeToModelId: "anthropic:claude-sonnet-4-6",
          action: "degrade",
        },
        {
          fromMinScore: 0,
          fromMaxScore: 54,
          degradeToModelId: null,
          action: "block",
        },
      ]);

      const result = await loader.loadPolicy("any");

      expect(result!.providerPriorities).toHaveLength(3);
      expect(result!.purposeRules).toHaveLength(2);
      expect(result!.degradeRules).toHaveLength(2);

      // purpose rule 내용 확인
      const extraction = result!.purposeRules.find(
        (r) => r.purpose === "extraction"
      );
      expect(extraction?.requiresJsonMode).toBe(true);
      expect(extraction?.degradable).toBe(false);
    });

    it("provider priorities가 priority 오름차순 정렬", async () => {
      await insertPolicy(db, { id: "p", tenantId: null });
      await insertProviderPriorities(db, "p", [
        { provider: "google", priority: 3 },
        { provider: "anthropic", priority: 1 },
        { provider: "openai", priority: 2 },
      ]);

      const result = await loader.loadPolicy("t");
      const providers = result!.providerPriorities.map((p) => p.provider);
      expect(providers).toEqual(["anthropic", "openai", "google"]);
    });

    it("degrade rules가 fromMinScore 오름차순 정렬", async () => {
      await insertPolicy(db, { id: "p", tenantId: null });
      await insertDegradeRules(db, "p", [
        {
          fromMinScore: 85,
          fromMaxScore: 100,
          degradeToModelId: null,
          action: "degrade",
        },
        {
          fromMinScore: 0,
          fromMaxScore: 54,
          degradeToModelId: null,
          action: "block",
        },
        {
          fromMinScore: 55,
          fromMaxScore: 84,
          degradeToModelId: null,
          action: "degrade",
        },
      ]);

      const result = await loader.loadPolicy("t");
      const scores = result!.degradeRules.map((r) => r.fromMinScore);
      expect(scores).toEqual([0, 55, 85]);
    });
  });

  describe("loadPolicyById", () => {
    it("특정 ID + 버전의 정책 로드", async () => {
      await insertPolicy(db, { id: "p1", tenantId: null, version: 1 });
      await insertProviderPriorities(db, "p1", [
        { provider: "anthropic", priority: 1 },
      ]);

      const result = await loader.loadPolicyById("p1", 1);
      expect(result!.policy.id).toBe("p1");
      expect(result!.providerPriorities).toHaveLength(1);
    });

    it("존재하지 않는 ID는 null", async () => {
      const result = await loader.loadPolicyById("nonexistent", 1);
      expect(result).toBeNull();
    });
  });

  describe("캐시", () => {
    it("동일 tenantId의 두 번째 호출은 캐시 사용", async () => {
      await insertPolicy(db, { id: "p", tenantId: null });

      const result1 = await loader.loadPolicy("t1");
      // DB에서 정책 삭제
      db.delete(routingPolicies).run();

      // 캐시에서 반환
      const result2 = await loader.loadPolicy("t1");
      expect(result2!.policy.id).toBe(result1!.policy.id);
    });

    it("invalidateCache 후 DB에서 다시 로드", async () => {
      await insertPolicy(db, { id: "p", tenantId: null });
      await loader.loadPolicy("t1");

      // 정책 삭제 + 캐시 무효화
      db.delete(routingPolicies).run();
      loader.invalidateCache();

      const result = await loader.loadPolicy("t1");
      expect(result).toBeNull();
    });

    it("특정 tenant만 캐시 무효화 가능", async () => {
      await insertPolicy(db, {
        id: "tp1",
        tenantId: "t1",
        priority: 10,
      });
      await insertPolicy(db, {
        id: "tp2",
        tenantId: "t2",
        priority: 10,
      });
      await loader.loadPolicy("t1");
      await loader.loadPolicy("t2");

      // t1만 무효화
      loader.invalidateCache("t1");

      // DB에서 t1 정책 삭제
      db.delete(routingPolicies).run();

      // t2는 여전히 캐시에서 반환
      const t2Result = await loader.loadPolicy("t2");
      expect(t2Result).not.toBeNull();
      expect(t2Result!.policy.id).toBe("tp2");

      // t1은 DB에서 다시 로드 (이제 없으므로 null)
      const t1Result = await loader.loadPolicy("t1");
      expect(t1Result).toBeNull();
    });
  });
});
