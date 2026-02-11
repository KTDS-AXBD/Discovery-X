import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import {
  makeDiscovery,
  makeContextNode,
  resetFixtureCounter,
} from "../../helpers/fixtures";
import { discoveries, contextNodes, ontologyTypes } from "~/db/schema";
import {
  normalizeLabel,
  matchGlobalEntity,
  matchGlobalEntitiesBatch,
} from "~/lib/ontology/matcher";

/** TestDB → DrizzleD1Database 호환 타입 캐스팅 */
function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof matchGlobalEntity>[0];
}

/** 테스트용 ontologyType 시드 */
function seedOntologyTypes(db: TestDB) {
  db.insert(ontologyTypes)
    .values([
      { id: "ONT-01", nameKo: "기술", domain: "tech", color: "#000" },
      { id: "ONT-02", nameKo: "시장", domain: "market", color: "#111" },
      { id: "ONT-03", nameKo: "규제", domain: "regulation", color: "#222" },
    ])
    .run();
}

describe("ontology/matcher", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    seedOntologyTypes(db);
  });

  // ─── normalizeLabel ──────────────────────────────────────────────

  describe("normalizeLabel", () => {
    it("기본 정규화 — 소문자 변환 + trim", () => {
      expect(normalizeLabel("Hello World")).toBe("hello world");
    });

    it("다중 공백 제거 + trim", () => {
      expect(normalizeLabel("  AI  기술  ")).toBe("ai 기술");
    });

    it("한글 + 영어 혼합 정규화", () => {
      expect(normalizeLabel("ESG 탄소중립 Policy")).toBe(
        "esg 탄소중립 policy",
      );
    });

    it("특수문자 제거 (문자/숫자/공백만 유지)", () => {
      expect(normalizeLabel("AI-기술 (v2.0)")).toBe("ai기술 v20");
    });
  });

  // ─── matchGlobalEntity ───────────────────────────────────────────

  describe("matchGlobalEntity", () => {
    it("기존 엔티티 없음 → 새 globalEntityId 생성 (isNew=true)", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      const result = await matchGlobalEntity(asDB(db), "AI 기술", "ONT-01");

      expect(result.isNew).toBe(true);
      expect(result.globalEntityId).toBeTruthy();
      expect(result.matchedLabel).toBeUndefined();
    });

    it("기존 엔티티 있음 → 기존 globalEntityId 반환 (isNew=false)", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      const existingGlobalId = "global-existing-001";
      db.insert(contextNodes)
        .values(
          makeContextNode({
            discoveryId: "disc-1",
            label: "AI 기술",
            ontologyTypeId: "ONT-01",
            globalEntityId: existingGlobalId,
          }),
        )
        .run();

      const result = await matchGlobalEntity(asDB(db), "AI 기술", "ONT-01");

      expect(result.isNew).toBe(false);
      expect(result.globalEntityId).toBe(existingGlobalId);
      expect(result.matchedLabel).toBe("AI 기술");
    });

    it("같은 label 다른 ontologyTypeId → 새 globalEntityId", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      db.insert(contextNodes)
        .values(
          makeContextNode({
            discoveryId: "disc-1",
            label: "AI 기술",
            ontologyTypeId: "ONT-01",
            globalEntityId: "global-tech-001",
          }),
        )
        .run();

      // 같은 label이지만 ONT-02 (시장) 타입으로 매칭
      const result = await matchGlobalEntity(asDB(db), "AI 기술", "ONT-02");

      expect(result.isNew).toBe(true);
      expect(result.globalEntityId).not.toBe("global-tech-001");
    });

    it("대소문자 다른 label → 정규화로 기존 globalEntityId 매칭", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      db.insert(contextNodes)
        .values(
          makeContextNode({
            discoveryId: "disc-1",
            label: "ESG Market",
            ontologyTypeId: "ONT-02",
            globalEntityId: "global-esg-001",
          }),
        )
        .run();

      // 대소문자 차이 → 정규화 후 매칭되어야 함
      const result = await matchGlobalEntity(
        asDB(db),
        "esg market",
        "ONT-02",
      );

      expect(result.isNew).toBe(false);
      expect(result.globalEntityId).toBe("global-esg-001");
    });
  });

  // ─── matchGlobalEntitiesBatch ────────────────────────────────────

  describe("matchGlobalEntitiesBatch", () => {
    it("빈 배열 입력 → 빈 Map 반환", async () => {
      const results = await matchGlobalEntitiesBatch(asDB(db), []);
      expect(results.size).toBe(0);
    });

    it("3개 엔티티 배치 매칭 — 2 기존 + 1 신규", async () => {
      const disc = makeDiscovery({ id: "disc-1" });
      db.insert(discoveries).values(disc).run();

      // 기존 엔티티 2개 시드
      db.insert(contextNodes)
        .values([
          makeContextNode({
            id: "node-a",
            discoveryId: "disc-1",
            label: "AI 기술",
            ontologyTypeId: "ONT-01",
            globalEntityId: "global-ai",
          }),
          makeContextNode({
            id: "node-b",
            discoveryId: "disc-1",
            label: "ESG 시장",
            ontologyTypeId: "ONT-02",
            globalEntityId: "global-esg",
          }),
        ])
        .run();

      const results = await matchGlobalEntitiesBatch(asDB(db), [
        { label: "AI 기술", ontologyTypeId: "ONT-01" }, // 기존
        { label: "ESG 시장", ontologyTypeId: "ONT-02" }, // 기존
        { label: "새 규제", ontologyTypeId: "ONT-03" }, // 신규
      ]);

      expect(results.size).toBe(3);

      const aiResult = results.get("AI 기술::ONT-01");
      expect(aiResult?.isNew).toBe(false);
      expect(aiResult?.globalEntityId).toBe("global-ai");

      const esgResult = results.get("ESG 시장::ONT-02");
      expect(esgResult?.isNew).toBe(false);
      expect(esgResult?.globalEntityId).toBe("global-esg");

      const newResult = results.get("새 규제::ONT-03");
      expect(newResult?.isNew).toBe(true);
    });

    it("동일 label 중복 입력 → 같은 globalEntityId 할당", async () => {
      const results = await matchGlobalEntitiesBatch(asDB(db), [
        { label: "블록체인", ontologyTypeId: "ONT-01" },
        { label: "블록체인", ontologyTypeId: "ONT-01" },
      ]);

      // Map 키가 동일하므로 마지막 값으로 덮어씌워져 1개만 존재
      expect(results.size).toBe(1);

      const entry = results.get("블록체인::ONT-01");
      expect(entry).toBeDefined();
      expect(entry?.isNew).toBe(true);
    });
  });
});
