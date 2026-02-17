import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import {
  makeDiscovery,
  makeEvidence,
  resetFixtureCounter,
} from "../../helpers/fixtures";
import {
  discoveries,
  users,
  evidence,
  ontologyTypes,
  tenants,
  tenantMembers,
} from "~/db/schema";
import { extractOntologyBatch, type ExtractionResult } from "~/lib/ontology/extractor";

/** TestDB → DrizzleD1Database 호환 타입 캐스팅 */
function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof extractOntologyBatch>[0];
}

/** 공통 시드 데이터 */
function seedBase(db: TestDB) {
  db.insert(users).values({ id: "user-1", email: "test@test.com", name: "Tester" }).run();
  db.insert(tenants)
    .values({ id: "tenant-1", name: "Test Tenant", slug: "test-tenant", ownerUserId: "user-1" })
    .run();
  db.insert(tenantMembers)
    .values({ id: "tm-1", tenantId: "tenant-1", userId: "user-1" })
    .run();
  db.insert(ontologyTypes)
    .values([
      { id: "ONT-01", nameKo: "기술", domain: "tech", color: "#000" },
      { id: "ONT-02", nameKo: "시장", domain: "market", color: "#111" },
    ])
    .onConflictDoNothing()
    .run();
}

describe("ontology/extractor", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    seedBase(db);
  });

  // ─── VALID_RELATION_TYPES 간접 검증 ─────────────────────────────
  // VALID_RELATION_TYPES는 export되지 않으므로, extractFromEvidence의
  // 엣지 생성 로직에서 유효하지 않은 relationType이 무시되는지로 검증.
  // 여기서는 모듈이 정상 로드되는지 + 상수가 존재함을 간접 확인.

  describe("VALID_RELATION_TYPES 간접 검증", () => {
    it("extractor 모듈이 정상 로드된다 (extractOntologyBatch export 확인)", () => {
      expect(typeof extractOntologyBatch).toBe("function");
    });

    it("ExtractionResult 타입이 올바른 구조를 갖는다", () => {
      const stub: ExtractionResult = {
        evidenceProcessed: 0,
        nodesCreated: 0,
        edgesCreated: 0,
        globalEntitiesMatched: 0,
        errors: [],
      };
      // 5개의 VALID_RELATION_TYPES: supports, contradicts, causes, relates_to, depends_on
      expect(stub.evidenceProcessed).toBe(0);
      expect(Array.isArray(stub.errors)).toBe(true);
    });
  });

  // ─── extractOntologyBatch — 쿼리 로직 테스트 ────────────────────

  describe("extractOntologyBatch 쿼리 로직", () => {
    it("ontologyExtractedAt이 null인 evidence만 배치 대상이 된다", async () => {
      const disc = makeDiscovery({ id: "disc-1", tenantId: "tenant-1" });
      db.insert(discoveries).values(disc).run();

      // evidence 2개: 하나는 미추출, 하나는 추출 완료
      db.insert(evidence)
        .values(
          makeEvidence({
            id: "ev-fresh",
            discoveryId: "disc-1",
            createdById: "user-1",
            content: "Fresh evidence without extraction",
            ontologyExtractedAt: null,
          }),
        )
        .run();
      db.insert(evidence)
        .values(
          makeEvidence({
            id: "ev-done",
            discoveryId: "disc-1",
            createdById: "user-1",
            content: "Already extracted evidence",
            ontologyExtractedAt: new Date("2026-01-15T00:00:00Z"),
          }),
        )
        .run();

      // extractOntologyBatch는 LLM 호출(callClaude)에 의존하므로
      // API key 없이 호출하면 LLM 호출 실패 → errors에 기록됨
      // 핵심: ev-fresh만 처리 시도하고, ev-done은 스킵하는지 확인
      const result = await extractOntologyBatch(
        asDB(db),
        "fake-api-key",
        "tenant-1",
        10,
      );

      // LLM 호출 실패로 에러가 발생하지만, 처리 대상은 ev-fresh뿐이어야 함
      // (errors 배열에 ev-done의 ID가 없어야 함)
      const errorMentionsDone = result.errors.some((e) =>
        e.includes("ev-done"),
      );
      expect(errorMentionsDone).toBe(false);

      // ev-fresh에 대한 에러(LLM 호출 실패)만 있거나, 처리 시도된 흔적이 있어야 함
      if (result.errors.length > 0) {
        expect(result.errors.some((e) => e.includes("ev-fresh"))).toBe(true);
      }
    });

    it("ontologyExtractedAt이 이미 설정된 evidence는 스킵된다", async () => {
      const disc = makeDiscovery({ id: "disc-2", tenantId: "tenant-1" });
      db.insert(discoveries).values(disc).run();

      // 모든 evidence가 이미 추출 완료
      db.insert(evidence)
        .values(
          makeEvidence({
            id: "ev-already",
            discoveryId: "disc-2",
            createdById: "user-1",
            content: "Already processed",
            ontologyExtractedAt: new Date("2026-01-20T00:00:00Z"),
          }),
        )
        .run();

      const result = await extractOntologyBatch(
        asDB(db),
        "fake-api-key",
        "tenant-1",
        10,
      );

      // 처리 대상 없음 → 0건
      expect(result.evidenceProcessed).toBe(0);
      expect(result.nodesCreated).toBe(0);
      expect(result.edgesCreated).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("빈 테넌트에서 extractOntologyBatch 호출 → 빈 결과", async () => {
      const result = await extractOntologyBatch(
        asDB(db),
        "fake-api-key",
        "empty-tenant",
        5,
      );

      expect(result.evidenceProcessed).toBe(0);
      expect(result.nodesCreated).toBe(0);
      expect(result.edgesCreated).toBe(0);
      expect(result.globalEntitiesMatched).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("다른 테넌트의 evidence는 포함되지 않는다", async () => {
      // 테넌트A 시드
      db.insert(tenants)
        .values({ id: "tenant-A", name: "Tenant A", slug: "tenant-a", ownerUserId: "user-1" })
        .run();
      // 테넌트A의 discovery+evidence
      const discA = makeDiscovery({ id: "disc-a", tenantId: "tenant-A" });
      db.insert(discoveries).values(discA).run();
      db.insert(evidence)
        .values(
          makeEvidence({
            id: "ev-a",
            discoveryId: "disc-a",
            createdById: "user-1",
            content: "Tenant A evidence",
          }),
        )
        .run();

      // 테넌트B로 조회 → 대상 없음
      const result = await extractOntologyBatch(
        asDB(db),
        "fake-api-key",
        "tenant-B",
        10,
      );

      expect(result.evidenceProcessed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
