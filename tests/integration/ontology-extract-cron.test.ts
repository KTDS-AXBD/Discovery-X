/**
 * 온톨로지 자동 추출 Cron 통합 테스트
 *
 * LLM 호출은 mock하되, DB 추출 파이프라인(stale 감지 → 노드/엣지 생성
 * → ontologyExtractedAt 마킹 → 신뢰도 티어 필터링)을 실제 DB로 검증.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../helpers/db";
import {
  makeUser,
  makeDiscovery,
  makeEvidence,
  resetFixtureCounter,
} from "../helpers/fixtures";
import {
  discoveries,
  users,
  evidence,
  contextNodes,
  contextEdges,
  ontologyTypes,
  tenants,
  tenantMembers,
} from "~/db/schema";

// ─── LLM Mock ─────────────────────────────────────────────────────────────
vi.mock("~/features/chat/agent/claude-client", () => ({
  callClaude: vi.fn().mockResolvedValue({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          entities: [
            { label: "ESG 시장", ontologyTypeId: "ONT-02", confidence: 0.95 },
            { label: "탄소중립 정책", ontologyTypeId: "ONT-04", confidence: 0.72 },
            { label: "모호한 개념", ontologyTypeId: "ONT-01", confidence: 0.35 },
          ],
          relations: [
            {
              fromLabel: "ESG 시장",
              toLabel: "탄소중립 정책",
              relationType: "relates_to",
              strength: 0.8,
              confidence: 0.9,
            },
          ],
        }),
      },
    ],
  }),
  CLAUDE_MODEL: "claude-haiku-4-5-20251001",
}));

import { extractOntologyBatch } from "~/lib/ontology/extractor";

// ─── 타입 변환 ────────────────────────────────────────────────────────────
type ExtractorDB = Parameters<typeof extractOntologyBatch>[0];
function asExtractorDB(db: TestDB): ExtractorDB {
  return db as unknown as ExtractorDB;
}

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────
function seedTenantAndDiscovery(db: TestDB) {
  resetFixtureCounter();

  const user = makeUser({ id: "user-1" });
  db.insert(users).values(user).run();

  db.insert(tenants)
    .values({
      id: "tenant-1",
      name: "Test Tenant",
      slug: "test-tenant",
      ownerUserId: "user-1",
    })
    .run();

  db.insert(tenantMembers)
    .values({ id: "tm-1", tenantId: "tenant-1", userId: "user-1" })
    .run();

  const disc = makeDiscovery({
    id: "disc-1",
    tenantId: "tenant-1",
    ownerId: "user-1",
  });
  db.insert(discoveries).values(disc).run();

  return { userId: "user-1", discoveryId: "disc-1" };
}

function seedEvidence(db: TestDB, discoveryId: string, userId: string, count = 1) {
  for (let i = 0; i < count; i++) {
    const ev = makeEvidence({
      id: `ev-${i + 1}`,
      discoveryId,
      createdById: userId,
      content: `ESG 시장 규모가 2025년 150조원으로 성장. 탄소중립 정책 영향 분석 필요. 테스트 ${i + 1}`,
    });
    db.insert(evidence).values(ev).run();
  }
}

function getOntologyTypes(db: TestDB) {
  return db.select().from(ontologyTypes).all();
}

// ═══════════════════════════════════════════════════════════════════════════
describe("ontology-extract-cron 통합 테스트", () => {
  let testDb: TestDB;

  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("stale evidence가 없으면 처리 건수 0", async () => {
    seedTenantAndDiscovery(testDb);
    // evidence 없음

    const result = await extractOntologyBatch(
      asExtractorDB(testDb),
      "sk-test",
      "tenant-1",
    );

    expect(result.evidenceProcessed).toBe(0);
    expect(result.nodesCreated).toBe(0);
    expect(result.edgesCreated).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("stale evidence 처리 → 노드/엣지 생성 + ontologyExtractedAt 마킹", async () => {
    const { userId, discoveryId } = seedTenantAndDiscovery(testDb);
    seedEvidence(testDb, discoveryId, userId, 1);

    const result = await extractOntologyBatch(
      asExtractorDB(testDb),
      "sk-test",
      "tenant-1",
    );

    expect(result.evidenceProcessed).toBe(1);
    // ESG 시장 (0.95 ≥ 0.8) + 탄소중립 정책 (0.72 → 0.5~0.8, 검토 큐만) = 2 nodes
    expect(result.nodesCreated).toBe(2);
    // 관계: ESG 시장 → 탄소중립 정책 — 탄소중립 정책은 0.72(< 0.8)이라 nodeMap에 없음 → 엣지 미생성
    expect(result.edgesCreated).toBe(0);
    expect(result.errors).toEqual([]);

    // ontologyExtractedAt이 마킹되었는지 확인
    const evRows = testDb
      .select({ id: evidence.id, ontologyExtractedAt: evidence.ontologyExtractedAt })
      .from(evidence)
      .where(eq(evidence.id, "ev-1"))
      .all();
    expect(evRows[0].ontologyExtractedAt).not.toBeNull();
  });

  it("confidence < 0.5 엔티티는 무시된다", async () => {
    const { userId, discoveryId } = seedTenantAndDiscovery(testDb);
    seedEvidence(testDb, discoveryId, userId, 1);

    await extractOntologyBatch(asExtractorDB(testDb), "sk-test", "tenant-1");

    // "모호한 개념" (confidence 0.35)은 생성되지 않음
    const nodes = testDb
      .select()
      .from(contextNodes)
      .where(eq(contextNodes.discoveryId, discoveryId))
      .all();

    const labels = nodes.map((n) => n.label);
    expect(labels).not.toContain("모호한 개념");
  });

  it("confidence 0.5~0.8 엔티티는 노드 생성되지만 엣지 대상에서 제외", async () => {
    const { userId, discoveryId } = seedTenantAndDiscovery(testDb);
    seedEvidence(testDb, discoveryId, userId, 1);

    await extractOntologyBatch(asExtractorDB(testDb), "sk-test", "tenant-1");

    const nodes = testDb
      .select()
      .from(contextNodes)
      .where(eq(contextNodes.discoveryId, discoveryId))
      .all();

    // 탄소중립 정책 (0.72)는 노드로 존재하지만...
    const lowConfNode = nodes.find((n) => n.label === "탄소중립 정책");
    expect(lowConfNode).toBeDefined();
    expect(lowConfNode!.autoGenerated).toBe(1);
    expect(lowConfNode!.reviewed).toBe(0);

    // ...엣지에서는 제외됨 (nodeMap에 등록 안 됨)
    const edges = testDb.select().from(contextEdges).all();
    expect(edges).toHaveLength(0);
  });

  it("이미 처리된 evidence는 건너뛴다 (중복 방지)", async () => {
    const { userId, discoveryId } = seedTenantAndDiscovery(testDb);
    seedEvidence(testDb, discoveryId, userId, 1);

    // 1차 처리
    const first = await extractOntologyBatch(
      asExtractorDB(testDb),
      "sk-test",
      "tenant-1",
    );
    expect(first.evidenceProcessed).toBe(1);

    // 2차 처리 — stale이 아니므로 건너뜀
    const second = await extractOntologyBatch(
      asExtractorDB(testDb),
      "sk-test",
      "tenant-1",
    );
    expect(second.evidenceProcessed).toBe(0);
    expect(second.nodesCreated).toBe(0);
  });

  it("batchSize를 초과하는 evidence는 다음 배치에서 처리", async () => {
    const { userId, discoveryId } = seedTenantAndDiscovery(testDb);
    seedEvidence(testDb, discoveryId, userId, 3);

    // batchSize=2 → 2건만 처리
    const result = await extractOntologyBatch(
      asExtractorDB(testDb),
      "sk-test",
      "tenant-1",
      2,
    );

    expect(result.evidenceProcessed).toBe(2);
  });

  it("다른 테넌트의 evidence는 격리된다", async () => {
    seedTenantAndDiscovery(testDb); // tenant-1

    // tenant-2
    testDb
      .insert(tenants)
      .values({
        id: "tenant-2",
        name: "Other",
        slug: "other",
        ownerUserId: "user-1",
      })
      .run();

    const disc2 = makeDiscovery({
      id: "disc-2",
      tenantId: "tenant-2",
      ownerId: "user-1",
    });
    testDb.insert(discoveries).values(disc2).run();
    seedEvidence(testDb, "disc-2", "user-1", 1);

    // tenant-1으로 조회 → disc-2의 evidence는 안 나옴
    const result = await extractOntologyBatch(
      asExtractorDB(testDb),
      "sk-test",
      "tenant-1",
    );
    expect(result.evidenceProcessed).toBe(0);
  });

  it("자동 생성 노드에 올바른 메타데이터 설정", async () => {
    const { userId, discoveryId } = seedTenantAndDiscovery(testDb);
    seedEvidence(testDb, discoveryId, userId, 1);

    await extractOntologyBatch(asExtractorDB(testDb), "sk-test", "tenant-1");

    const nodes = testDb
      .select()
      .from(contextNodes)
      .where(eq(contextNodes.discoveryId, discoveryId))
      .all();

    for (const node of nodes) {
      expect(node.autoGenerated).toBe(1);
      expect(node.reviewed).toBe(0);
      expect(node.confidence).toBeGreaterThanOrEqual(0.5);
      expect(node.globalEntityId).toBeDefined();
      expect(node.sourceEvidenceId).toBe("ev-1");
    }
  });
});
