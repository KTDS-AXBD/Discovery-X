import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import {
  makeUser,
  makeDiscovery,
  makeDiscoveryLink,
  resetFixtureCounter,
} from "../../helpers/fixtures";
import { users, discoveries, discoveryLinks } from "~/db/schema";
import {
  linkDiscoveries,
  getLinkedDiscoveries,
} from "~/lib/agent/tools/connector-tools";

function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof linkDiscoveries>[0];
}

describe("Agent connector-tools", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
  });

  // ─── linkDiscoveries ────────────────────────────────────────────────

  describe("linkDiscoveries", () => {
    it("returns error when linking same discovery", async () => {
      const result = JSON.parse(
        await linkDiscoveries(asDB(db), {
          fromDiscoveryId: "disc-1",
          toDiscoveryId: "disc-1",
          linkType: "similar",
        })
      );

      expect(result.error).toContain("동일한 Discovery");
    });

    it("returns error for non-existent from discovery", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-2", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await linkDiscoveries(asDB(db), {
          fromDiscoveryId: "non-existent",
          toDiscoveryId: "disc-2",
          linkType: "similar",
        })
      );

      expect(result.error).toContain("출발 Discovery");
    });

    it("returns error for non-existent to discovery", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await linkDiscoveries(asDB(db), {
          fromDiscoveryId: "disc-1",
          toDiscoveryId: "non-existent",
          linkType: "similar",
        })
      );

      expect(result.error).toContain("도착 Discovery");
    });

    it("creates link successfully", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc1 = makeDiscovery({ id: "disc-1", ownerId: user.id, title: "Discovery A" });
      const disc2 = makeDiscovery({ id: "disc-2", ownerId: user.id, title: "Discovery B" });
      db.insert(discoveries).values([disc1, disc2]).run();

      const result = JSON.parse(
        await linkDiscoveries(asDB(db), {
          fromDiscoveryId: "disc-1",
          toDiscoveryId: "disc-2",
          linkType: "predecessor",
          note: "A precedes B",
        })
      );

      expect(result.success).toBe(true);
      expect(result.linkId).toBeDefined();
      expect(result.from.title).toBe("Discovery A");
      expect(result.to.title).toBe("Discovery B");
      expect(result.linkType).toBe("predecessor");
    });

    it("creates bidirectional links for similar type", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc1 = makeDiscovery({ id: "disc-1", ownerId: user.id });
      const disc2 = makeDiscovery({ id: "disc-2", ownerId: user.id });
      db.insert(discoveries).values([disc1, disc2]).run();

      const result = JSON.parse(
        await linkDiscoveries(asDB(db), {
          fromDiscoveryId: "disc-1",
          toDiscoveryId: "disc-2",
          linkType: "similar",
        })
      );

      expect(result.success).toBe(true);
      expect(result.bidirectional).toBe(true);
      expect(result.reverseLinkId).toBeDefined();

      // Verify both links exist in DB
      const links = db.select().from(discoveryLinks).all();
      expect(links).toHaveLength(2);
    });

    it("creates bidirectional links for alternative type", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc1 = makeDiscovery({ id: "disc-1", ownerId: user.id });
      const disc2 = makeDiscovery({ id: "disc-2", ownerId: user.id });
      db.insert(discoveries).values([disc1, disc2]).run();

      const result = JSON.parse(
        await linkDiscoveries(asDB(db), {
          fromDiscoveryId: "disc-1",
          toDiscoveryId: "disc-2",
          linkType: "alternative",
        })
      );

      expect(result.bidirectional).toBe(true);
    });

    it("creates unidirectional link for predecessor type", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc1 = makeDiscovery({ id: "disc-1", ownerId: user.id });
      const disc2 = makeDiscovery({ id: "disc-2", ownerId: user.id });
      db.insert(discoveries).values([disc1, disc2]).run();

      const result = JSON.parse(
        await linkDiscoveries(asDB(db), {
          fromDiscoveryId: "disc-1",
          toDiscoveryId: "disc-2",
          linkType: "predecessor",
        })
      );

      expect(result.bidirectional).toBe(false);
      expect(result.reverseLinkId).toBeUndefined();

      const links = db.select().from(discoveryLinks).all();
      expect(links).toHaveLength(1);
    });

    it("prevents duplicate links", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc1 = makeDiscovery({ id: "disc-1", ownerId: user.id });
      const disc2 = makeDiscovery({ id: "disc-2", ownerId: user.id });
      db.insert(discoveries).values([disc1, disc2]).run();

      // Create first link
      await linkDiscoveries(asDB(db), {
        fromDiscoveryId: "disc-1",
        toDiscoveryId: "disc-2",
        linkType: "predecessor",
      });

      // Try to create duplicate
      const result = JSON.parse(
        await linkDiscoveries(asDB(db), {
          fromDiscoveryId: "disc-1",
          toDiscoveryId: "disc-2",
          linkType: "predecessor",
        })
      );

      expect(result.error).toContain("이미 동일한 관계");
    });

    it("allows different link types between same discoveries", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc1 = makeDiscovery({ id: "disc-1", ownerId: user.id });
      const disc2 = makeDiscovery({ id: "disc-2", ownerId: user.id });
      db.insert(discoveries).values([disc1, disc2]).run();

      // Create predecessor link
      await linkDiscoveries(asDB(db), {
        fromDiscoveryId: "disc-1",
        toDiscoveryId: "disc-2",
        linkType: "predecessor",
      });

      // Create similar link (different type)
      const result = JSON.parse(
        await linkDiscoveries(asDB(db), {
          fromDiscoveryId: "disc-1",
          toDiscoveryId: "disc-2",
          linkType: "similar",
        })
      );

      expect(result.success).toBe(true);
    });
  });

  // ─── getLinkedDiscoveries ─────────────────────────────────────────────

  describe("getLinkedDiscoveries", () => {
    it("returns empty when no links exist", async () => {
      const result = JSON.parse(
        await getLinkedDiscoveries(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.links).toHaveLength(0);
      expect(result.message).toContain("연결된 Discovery가 없습니다");
    });

    it("returns outgoing links", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc1 = makeDiscovery({ id: "disc-1", ownerId: user.id, title: "Source" });
      const disc2 = makeDiscovery({ id: "disc-2", ownerId: user.id, title: "Target" });
      db.insert(discoveries).values([disc1, disc2]).run();

      const link = makeDiscoveryLink({
        fromDiscoveryId: "disc-1",
        toDiscoveryId: "disc-2",
        linkType: "predecessor",
      });
      db.insert(discoveryLinks).values(link).run();

      const result = JSON.parse(
        await getLinkedDiscoveries(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.links).toHaveLength(1);
      expect(result.links[0].direction).toBe("outgoing");
      expect(result.links[0].discovery.title).toBe("Target");
    });

    it("returns incoming links", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc1 = makeDiscovery({ id: "disc-1", ownerId: user.id, title: "Source" });
      const disc2 = makeDiscovery({ id: "disc-2", ownerId: user.id, title: "Target" });
      db.insert(discoveries).values([disc1, disc2]).run();

      const link = makeDiscoveryLink({
        fromDiscoveryId: "disc-1",
        toDiscoveryId: "disc-2",
        linkType: "predecessor",
      });
      db.insert(discoveryLinks).values(link).run();

      const result = JSON.parse(
        await getLinkedDiscoveries(asDB(db), { discoveryId: "disc-2" })
      );

      expect(result.links).toHaveLength(1);
      expect(result.links[0].direction).toBe("incoming");
      expect(result.links[0].discovery.title).toBe("Source");
    });

    it("deduplicates bidirectional links", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc1 = makeDiscovery({ id: "disc-1", ownerId: user.id });
      const disc2 = makeDiscovery({ id: "disc-2", ownerId: user.id });
      db.insert(discoveries).values([disc1, disc2]).run();

      // Create bidirectional links (similar)
      const link1 = makeDiscoveryLink({
        fromDiscoveryId: "disc-1",
        toDiscoveryId: "disc-2",
        linkType: "similar",
      });
      const link2 = makeDiscoveryLink({
        fromDiscoveryId: "disc-2",
        toDiscoveryId: "disc-1",
        linkType: "similar",
      });
      db.insert(discoveryLinks).values([link1, link2]).run();

      const result = JSON.parse(
        await getLinkedDiscoveries(asDB(db), { discoveryId: "disc-1" })
      );

      // Should deduplicate and show only one link
      expect(result.links).toHaveLength(1);
    });

    it("returns multiple links with different types", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc1 = makeDiscovery({ id: "disc-1", ownerId: user.id });
      const disc2 = makeDiscovery({ id: "disc-2", ownerId: user.id });
      const disc3 = makeDiscovery({ id: "disc-3", ownerId: user.id });
      db.insert(discoveries).values([disc1, disc2, disc3]).run();

      const link1 = makeDiscoveryLink({
        fromDiscoveryId: "disc-1",
        toDiscoveryId: "disc-2",
        linkType: "predecessor",
      });
      const link2 = makeDiscoveryLink({
        fromDiscoveryId: "disc-1",
        toDiscoveryId: "disc-3",
        linkType: "similar",
      });
      db.insert(discoveryLinks).values([link1, link2]).run();

      const result = JSON.parse(
        await getLinkedDiscoveries(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.links).toHaveLength(2);
    });

    it("includes link metadata (note, createdAt)", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc1 = makeDiscovery({ id: "disc-1", ownerId: user.id });
      const disc2 = makeDiscovery({ id: "disc-2", ownerId: user.id });
      db.insert(discoveries).values([disc1, disc2]).run();

      const link = makeDiscoveryLink({
        fromDiscoveryId: "disc-1",
        toDiscoveryId: "disc-2",
        linkType: "predecessor",
        note: "Test note",
      });
      db.insert(discoveryLinks).values(link).run();

      const result = JSON.parse(
        await getLinkedDiscoveries(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.links[0].note).toBe("Test note");
      expect(result.links[0].linkId).toBeDefined();
    });
  });
});
