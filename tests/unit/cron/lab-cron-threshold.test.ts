import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeDiscovery, makeEvidence, resetFixtureCounter } from "../../helpers/fixtures";
import { discoveries, users, evidence, tenants, tenantMembers } from "~/db";
import {
  getEvidenceCount,
  EVIDENCE_THRESHOLD,
} from "~/routes/api.cron.lab";

function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof getEvidenceCount>[0];
}

function seedBase(db: TestDB) {
  db.insert(users).values({ id: "user-1", email: "test@test.com", name: "Tester" }).run();
  db.insert(tenants)
    .values({ id: "tenant-1", name: "Test Tenant", slug: "test-tenant", ownerUserId: "user-1" })
    .run();
  db.insert(tenantMembers)
    .values({ id: "tm-1", tenantId: "tenant-1", userId: "user-1" })
    .run();
}

function seedEvidence(db: TestDB, count: number) {
  for (let i = 0; i < count; i++) {
    const disc = makeDiscovery({ tenantId: "tenant-1", ownerId: "user-1" });
    db.insert(discoveries).values(disc).run();
    const ev = makeEvidence({ discoveryId: disc.id, createdById: "user-1" });
    db.insert(evidence).values(ev).run();
  }
}

describe("Cron Lab 임계치", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    seedBase(db);
  });

  it("EVIDENCE_THRESHOLD는 30이다", () => {
    expect(EVIDENCE_THRESHOLD).toBe(30);
  });

  it("Evidence 30건 이상이면 추출 실행 대상이다", async () => {
    seedEvidence(db, 31);
    const count = await getEvidenceCount(asDB(db), "tenant-1");
    expect(count).toBe(31);
    expect(count >= EVIDENCE_THRESHOLD).toBe(true);
  });

  it("Evidence 30건 미만이면 skip한다", async () => {
    seedEvidence(db, 29);
    const count = await getEvidenceCount(asDB(db), "tenant-1");
    expect(count).toBe(29);
    expect(count < EVIDENCE_THRESHOLD).toBe(true);
  });

  it("Evidence 0건이면 skip한다", async () => {
    const count = await getEvidenceCount(asDB(db), "tenant-1");
    expect(count).toBe(0);
    expect(count < EVIDENCE_THRESHOLD).toBe(true);
  });

  it("정확히 30건이면 추출 실행 대상이다", async () => {
    seedEvidence(db, 30);
    const count = await getEvidenceCount(asDB(db), "tenant-1");
    expect(count).toBe(30);
    expect(count >= EVIDENCE_THRESHOLD).toBe(true);
  });
});
