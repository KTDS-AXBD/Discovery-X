import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, makeDiscovery, resetFixtureCounter } from "../../helpers/fixtures";
import { users, discoveries, eventLogs } from "~/db/schema";
import {
  createDiscovery,
  generateIdeaCandidates,
  selectIdeaCandidate,
  autoFillTemplate,
} from "~/lib/agent/tools/discovery-tools";

function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof createDiscovery>[0];
}

describe("BD PoC agent tools", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
  });

  // ─── generateIdeaCandidates ──────────────────────────────────────

  describe("generateIdeaCandidates", () => {
    // I-01: 후보 3개 생성
    it("returns candidateGroupId with count capped at requested", async () => {
      const result = JSON.parse(
        await generateIdeaCandidates(asDB(db), { count: 3 })
      );

      expect(result.success).toBe(true);
      expect(result.candidateGroupId).toBeTruthy();
      expect(result.count).toBe(3);
      expect(result.message).toContain(result.candidateGroupId);
    });

    // I-02: 후보 1개 생성
    it("handles count of 1", async () => {
      const result = JSON.parse(
        await generateIdeaCandidates(asDB(db), { count: 1 })
      );

      expect(result.success).toBe(true);
      expect(result.candidateGroupId).toBeTruthy();
      expect(result.count).toBe(1);
    });

    // I-03: sourceContext 전달
    it("accepts sourceContext parameter", async () => {
      const result = JSON.parse(
        await generateIdeaCandidates(asDB(db), { count: 2, sourceContext: "AI 시장" })
      );

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });

    // I-04: industryCode 전달
    it("passes through industryCode", async () => {
      const result = JSON.parse(
        await generateIdeaCandidates(asDB(db), { count: 1, industryCode: "manufacturing" })
      );

      expect(result.success).toBe(true);
      expect(result.industryCode).toBe("manufacturing");
    });
  });

  // ─── selectIdeaCandidate ─────────────────────────────────────────

  describe("selectIdeaCandidate", () => {
    // I-05: 3개 중 1개 선택 → 선택 IDEA_CARD, 나머지 DROP
    it("promotes selected candidate and drops others", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const groupId = "group-abc";
      const d1 = makeDiscovery({ ownerId: user.id, candidateGroupId: groupId, status: "DISCOVERY" });
      const d2 = makeDiscovery({ ownerId: user.id, candidateGroupId: groupId, status: "DISCOVERY" });
      const d3 = makeDiscovery({ ownerId: user.id, candidateGroupId: groupId, status: "DISCOVERY" });
      db.insert(discoveries).values([d1, d2, d3]).run();

      const result = JSON.parse(
        await selectIdeaCandidate(asDB(db), {
          candidateGroupId: groupId,
          selectedDiscoveryId: d2.id!,
        })
      );

      expect(result.success).toBe(true);
      expect(result.selected).toBe(d2.id);
      expect(result.newStatus).toBe("IDEA_CARD");
      expect(result.dropped).toHaveLength(2);
      expect(result.dropped).toContain(d1.id);
      expect(result.dropped).toContain(d3.id);

      // DB 확인
      const selected = db.select().from(discoveries).where(eq(discoveries.id, d2.id!)).get();
      expect(selected!.status).toBe("IDEA_CARD");

      const dropped1 = db.select().from(discoveries).where(eq(discoveries.id, d1.id!)).get();
      expect(dropped1!.status).toBe("DROP");

      const dropped3 = db.select().from(discoveries).where(eq(discoveries.id, d3.id!)).get();
      expect(dropped3!.status).toBe("DROP");
    });

    // I-06: 선택 사유 포함
    it("logs selection reason in eventLogs", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const groupId = "group-reason";
      const d1 = makeDiscovery({ ownerId: user.id, candidateGroupId: groupId, status: "DISCOVERY" });
      db.insert(discoveries).values(d1).run();

      await selectIdeaCandidate(asDB(db), {
        candidateGroupId: groupId,
        selectedDiscoveryId: d1.id!,
        reason: "시장성이 가장 높음",
      });

      const logs = db.select().from(eventLogs).all();
      const selectLog = logs.find((l) => l.eventType === "candidate_selected");
      expect(selectLog).toBeDefined();

      const metadata = selectLog!.metadata as Record<string, unknown>;
      expect(metadata.reason).toBe("시장성이 가장 높음");
    });

    // I-07: 존재하지 않는 groupId
    it("returns error for non-existent groupId", async () => {
      const result = JSON.parse(
        await selectIdeaCandidate(asDB(db), {
          candidateGroupId: "non-existent-group",
          selectedDiscoveryId: "any-id",
        })
      );

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("non-existent-group");
    });

    // I-08: 후보가 1개뿐일 때 선택
    it("promotes single candidate with no drops", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const groupId = "group-single";
      const d1 = makeDiscovery({ ownerId: user.id, candidateGroupId: groupId, status: "DISCOVERY" });
      db.insert(discoveries).values(d1).run();

      const result = JSON.parse(
        await selectIdeaCandidate(asDB(db), {
          candidateGroupId: groupId,
          selectedDiscoveryId: d1.id!,
        })
      );

      expect(result.success).toBe(true);
      expect(result.selected).toBe(d1.id);
      expect(result.dropped).toHaveLength(0);

      const row = db.select().from(discoveries).where(eq(discoveries.id, d1.id!)).get();
      expect(row!.status).toBe("IDEA_CARD");
    });
  });

  // ─── autoFillTemplate ────────────────────────────────────────────

  describe("autoFillTemplate", () => {
    // I-09: 전체 필드 채움
    it("fills all template fields", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ ownerId: user.id, status: "IDEA_CARD" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await autoFillTemplate(asDB(db), {
          discoveryId: disc.id!,
          hypothesis: "AI가 제조업 품질을 혁신한다",
          targetSegment: "중소 제조기업",
          valueProposition: "비용 30% 절감",
        })
      );

      expect(result.success).toBe(true);
      expect(result.filledFields).toContain("seedSummary");
      expect(result.filledFields).toContain("targetSegment");
      expect(result.filledFields).toContain("valueProposition");

      const row = db.select().from(discoveries).where(eq(discoveries.id, disc.id!)).get();
      expect(row!.seedSummary).toBe("AI가 제조업 품질을 혁신한다");
      expect(row!.targetSegment).toBe("중소 제조기업");
      expect(row!.valueProposition).toBe("비용 30% 절감");
    });

    // I-10: 부분 필드 채움
    it("fills only provided fields, leaves others unchanged", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({
        ownerId: user.id,
        status: "IDEA_CARD",
        seedSummary: "기존 요약",
      });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await autoFillTemplate(asDB(db), {
          discoveryId: disc.id!,
          targetSegment: "대기업 R&D",
        })
      );

      expect(result.success).toBe(true);
      expect(result.filledFields).toContain("targetSegment");
      expect(result.filledFields).not.toContain("seedSummary");

      const row = db.select().from(discoveries).where(eq(discoveries.id, disc.id!)).get();
      expect(row!.targetSegment).toBe("대기업 R&D");
      expect(row!.seedSummary).toBe("기존 요약");
    });

    // I-11: 존재하지 않는 discoveryId
    it("returns error for non-existent discoveryId", async () => {
      const result = JSON.parse(
        await autoFillTemplate(asDB(db), {
          discoveryId: "non-existent-id",
          hypothesis: "test",
        })
      );

      expect(result.error).toBeTruthy();
    });
  });
});
