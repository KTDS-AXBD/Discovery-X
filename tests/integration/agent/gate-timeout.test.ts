import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import {
  makeUser,
  makeDiscovery,
  makeGatePackage,
  makeGateApproval,
  resetFixtureCounter,
} from "../../helpers/fixtures";
import {
  users,
  discoveries,
  gatePackages,
  gateApprovals,
  eventLogs,
  GateApprovalDecision,
} from "~/db/schema";
import { eq } from "drizzle-orm";
import { processExpiredGateApprovals } from "~/lib/notifications/alert-engine";
import { requestGateApproval } from "~/lib/agent/tools/governance-tools";

function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof processExpiredGateApprovals>[0];
}

describe("Gate Timeout — processExpiredGateApprovals", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
  });

  function setupBase() {
    const owner = makeUser({ id: "owner-1" });
    const reviewer1 = makeUser({ id: "reviewer-1" });
    const reviewer2 = makeUser({ id: "reviewer-2" });
    // system-radar user already seeded via 0004 migration
    db.insert(users).values([owner, reviewer1, reviewer2]).run();

    const disc = makeDiscovery({
      id: "disc-1",
      ownerId: owner.id,
      status: "GATE1",
      stageUpdatedAt: new Date("2026-01-15T00:00:00Z"),
    });
    db.insert(discoveries).values(disc).run();

    const pkg = makeGatePackage({
      id: "pkg-1",
      discoveryId: "disc-1",
      gateType: "GATE1",
    });
    db.insert(gatePackages).values(pkg).run();

    return { owner, reviewer1, reviewer2 };
  }

  it("auto-rejects expired PENDING approvals", async () => {
    setupBase();

    // Expired approval (SLA deadline in the past)
    const pastDeadline = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const approval = makeGateApproval({
      id: "approval-1",
      gatePackageId: "pkg-1",
      reviewerId: "reviewer-1",
      decision: GateApprovalDecision.PENDING,
      slaDeadline: pastDeadline,
    });
    db.insert(gateApprovals).values(approval).run();

    const result = await processExpiredGateApprovals(asDB(db));

    expect(result.expiredCount).toBe(1);
    expect(result.details.expired).toHaveLength(1);
    expect(result.details.expired[0].approvalId).toBe("approval-1");

    // Verify DB update
    const updated = db.select().from(gateApprovals).where(eq(gateApprovals.id, "approval-1")).all();
    expect(updated[0].decision).toBe("REJECTED");
    expect(updated[0].comment).toContain("SLA 기한 초과");
    expect(updated[0].decidedAt).toBeTruthy();
  });

  it("sets gate package to NO_GO when all approvals decided with rejection", async () => {
    setupBase();

    const pastDeadline = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    // One already approved, one pending (will expire)
    const approval1 = makeGateApproval({
      id: "approval-1",
      gatePackageId: "pkg-1",
      reviewerId: "reviewer-1",
      decision: "APPROVED",
    });
    const approval2 = makeGateApproval({
      id: "approval-2",
      gatePackageId: "pkg-1",
      reviewerId: "reviewer-2",
      decision: GateApprovalDecision.PENDING,
      slaDeadline: pastDeadline,
    });
    db.insert(gateApprovals).values([approval1, approval2]).run();

    const result = await processExpiredGateApprovals(asDB(db));

    expect(result.expiredCount).toBe(1);

    // Gate package should be NO_GO (one rejection via auto-reject)
    const pkg = db.select().from(gatePackages).where(eq(gatePackages.id, "pkg-1")).all();
    expect(pkg[0].decision).toBe("NO_GO");
    expect(pkg[0].decidedAt).toBeTruthy();
  });

  it("transitions discovery to HOLD on NO_GO with required fields", async () => {
    setupBase();

    const pastDeadline = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const approval = makeGateApproval({
      id: "approval-1",
      gatePackageId: "pkg-1",
      reviewerId: "reviewer-1",
      decision: GateApprovalDecision.PENDING,
      slaDeadline: pastDeadline,
    });
    db.insert(gateApprovals).values(approval).run();

    await processExpiredGateApprovals(asDB(db));

    // Discovery should be HOLD
    const disc = db.select().from(discoveries).where(eq(discoveries.id, "disc-1")).all();
    expect(disc[0].status).toBe("HOLD");
    expect(disc[0].notNowTriggerType).toBe("Internal_Capability");
    expect(disc[0].revisitDate).toBeTruthy();
    expect(disc[0].stageUpdatedAt).toBeTruthy();
  });

  it("logs GATE_AUTO_HOLD event", async () => {
    setupBase();

    const pastDeadline = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const approval = makeGateApproval({
      id: "approval-1",
      gatePackageId: "pkg-1",
      reviewerId: "reviewer-1",
      decision: GateApprovalDecision.PENDING,
      slaDeadline: pastDeadline,
    });
    db.insert(gateApprovals).values(approval).run();

    await processExpiredGateApprovals(asDB(db));

    // Check event log
    const logs = db
      .select()
      .from(eventLogs)
      .where(eq(eventLogs.eventType, "GATE_AUTO_HOLD"))
      .all();
    expect(logs).toHaveLength(1);
    expect(logs[0].discoveryId).toBe("disc-1");
    expect(logs[0].actorId).toBe("system-radar");
    const metadata = logs[0].metadata as Record<string, unknown>;
    expect(metadata.gatePackageId).toBe("pkg-1");
    expect(metadata.gateDecision).toBe("NO_GO");
  });

  it("does not modify non-expired approvals", async () => {
    setupBase();

    // Future deadline (not expired)
    const futureDeadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
    const approval = makeGateApproval({
      id: "approval-1",
      gatePackageId: "pkg-1",
      reviewerId: "reviewer-1",
      decision: GateApprovalDecision.PENDING,
      slaDeadline: futureDeadline,
    });
    db.insert(gateApprovals).values(approval).run();

    const result = await processExpiredGateApprovals(asDB(db));

    expect(result.expiredCount).toBe(0);

    // Approval should remain PENDING
    const unchanged = db.select().from(gateApprovals).where(eq(gateApprovals.id, "approval-1")).all();
    expect(unchanged[0].decision).toBe("PENDING");
  });

  it("collects reminder candidates within 24 hours of deadline", async () => {
    setupBase();

    // Deadline in 12 hours (within 24h window)
    const soonDeadline = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const approval = makeGateApproval({
      id: "approval-1",
      gatePackageId: "pkg-1",
      reviewerId: "reviewer-1",
      decision: GateApprovalDecision.PENDING,
      slaDeadline: soonDeadline,
    });
    db.insert(gateApprovals).values(approval).run();

    const result = await processExpiredGateApprovals(asDB(db));

    expect(result.expiredCount).toBe(0);
    expect(result.reminderCount).toBe(1);
    expect(result.details.reminders[0].hoursLeft).toBeLessThanOrEqual(12);
  });

  it("applies default SLA of 7 days when not specified", async () => {
    const owner = makeUser({ id: "owner-1" });
    const reviewer = makeUser({ id: "reviewer-1" });
    db.insert(users).values([owner, reviewer]).run();

    const disc = makeDiscovery({ id: "disc-1", ownerId: owner.id });
    db.insert(discoveries).values(disc).run();

    const pkg = makeGatePackage({ id: "pkg-1", discoveryId: "disc-1", gateType: "GATE1" });
    db.insert(gatePackages).values(pkg).run();

    // Request without slaDeadlineDays → default 7 days
    const result = JSON.parse(
      await requestGateApproval(asDB(db), {
        gatePackageId: "pkg-1",
        reviewerIds: ["reviewer-1"],
      })
    );

    expect(result.success).toBe(true);
    expect(result.slaDeadline).toBeDefined();

    // Check the deadline is approximately 7 days from now
    const deadline = new Date(result.slaDeadline);
    const daysDiff = (deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThan(6.9);
    expect(daysDiff).toBeLessThan(7.1);
  });

  it("skips approvals without SLA deadline", async () => {
    setupBase();

    // Approval without slaDeadline
    const approval = makeGateApproval({
      id: "approval-1",
      gatePackageId: "pkg-1",
      reviewerId: "reviewer-1",
      decision: GateApprovalDecision.PENDING,
      // no slaDeadline
    });
    db.insert(gateApprovals).values(approval).run();

    const result = await processExpiredGateApprovals(asDB(db));

    expect(result.expiredCount).toBe(0);
    expect(result.reminderCount).toBe(0);

    // Approval unchanged
    const unchanged = db.select().from(gateApprovals).where(eq(gateApprovals.id, "approval-1")).all();
    expect(unchanged[0].decision).toBe("PENDING");
  });
});
