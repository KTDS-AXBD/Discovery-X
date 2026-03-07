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
  GateApprovalDecision,
} from "~/db/schema";
import {
  requestGateApproval,
  submitGateApproval,
} from "~/features/chat/agent/tools/governance-tools";

function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof requestGateApproval>[0];
}

describe("Agent governance-tools", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
  });

  // ─── requestGateApproval ────────────────────────────────────────────

  describe("requestGateApproval", () => {
    it("returns error for non-existent gate package", async () => {
      const result = JSON.parse(
        await requestGateApproval(asDB(db), {
          gatePackageId: "non-existent",
          reviewerIds: ["reviewer-1"],
        })
      );

      expect(result.error).toContain("Gate 패키지를 찾을 수 없습니다");
    });

    it("returns error when no reviewers specified", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      const pkg = makeGatePackage({ id: "pkg-1", discoveryId: "disc-1", gateType: "GATE1" });
      db.insert(gatePackages).values(pkg).run();

      const result = JSON.parse(
        await requestGateApproval(asDB(db), {
          gatePackageId: "pkg-1",
          reviewerIds: [],
        })
      );

      expect(result.error).toContain("최소 1명");
    });

    it("returns error for non-existent reviewer", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      const pkg = makeGatePackage({ id: "pkg-1", discoveryId: "disc-1", gateType: "GATE1" });
      db.insert(gatePackages).values(pkg).run();

      const result = JSON.parse(
        await requestGateApproval(asDB(db), {
          gatePackageId: "pkg-1",
          reviewerIds: ["non-existent-user"],
        })
      );

      expect(result.error).toContain("사용자를 찾을 수 없습니다");
    });

    it("creates approval request successfully", async () => {
      const owner = makeUser({ id: "owner-1" });
      const reviewer = makeUser({ id: "reviewer-1" });
      db.insert(users).values([owner, reviewer]).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: owner.id });
      db.insert(discoveries).values(disc).run();

      const pkg = makeGatePackage({ id: "pkg-1", discoveryId: "disc-1", gateType: "GATE1" });
      db.insert(gatePackages).values(pkg).run();

      const result = JSON.parse(
        await requestGateApproval(asDB(db), {
          gatePackageId: "pkg-1",
          reviewerIds: ["reviewer-1"],
        })
      );

      expect(result.success).toBe(true);
      expect(result.approvalIds).toHaveLength(1);
      expect(result.reviewerCount).toBe(1);
    });

    it("creates approval requests for multiple reviewers", async () => {
      const owner = makeUser({ id: "owner-1" });
      const reviewer1 = makeUser({ id: "reviewer-1" });
      const reviewer2 = makeUser({ id: "reviewer-2" });
      db.insert(users).values([owner, reviewer1, reviewer2]).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: owner.id });
      db.insert(discoveries).values(disc).run();

      const pkg = makeGatePackage({ id: "pkg-1", discoveryId: "disc-1", gateType: "GATE1" });
      db.insert(gatePackages).values(pkg).run();

      const result = JSON.parse(
        await requestGateApproval(asDB(db), {
          gatePackageId: "pkg-1",
          reviewerIds: ["reviewer-1", "reviewer-2"],
        })
      );

      expect(result.success).toBe(true);
      expect(result.approvalIds).toHaveLength(2);
      expect(result.reviewerCount).toBe(2);
    });

    it("sets SLA deadline when specified", async () => {
      const owner = makeUser({ id: "owner-1" });
      const reviewer = makeUser({ id: "reviewer-1" });
      db.insert(users).values([owner, reviewer]).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: owner.id });
      db.insert(discoveries).values(disc).run();

      const pkg = makeGatePackage({ id: "pkg-1", discoveryId: "disc-1", gateType: "GATE1" });
      db.insert(gatePackages).values(pkg).run();

      const result = JSON.parse(
        await requestGateApproval(asDB(db), {
          gatePackageId: "pkg-1",
          reviewerIds: ["reviewer-1"],
          slaDeadlineDays: 3,
        })
      );

      expect(result.success).toBe(true);
      expect(result.slaDeadline).toBeDefined();
    });

    it("skips duplicate approval requests", async () => {
      const owner = makeUser({ id: "owner-1" });
      const reviewer = makeUser({ id: "reviewer-1" });
      db.insert(users).values([owner, reviewer]).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: owner.id });
      db.insert(discoveries).values(disc).run();

      const pkg = makeGatePackage({ id: "pkg-1", discoveryId: "disc-1", gateType: "GATE1" });
      db.insert(gatePackages).values(pkg).run();

      // Create existing approval
      const existingApproval = makeGateApproval({
        gatePackageId: "pkg-1",
        reviewerId: "reviewer-1",
      });
      db.insert(gateApprovals).values(existingApproval).run();

      // Request again
      const result = JSON.parse(
        await requestGateApproval(asDB(db), {
          gatePackageId: "pkg-1",
          reviewerIds: ["reviewer-1"],
        })
      );

      expect(result.success).toBe(true);
      expect(result.approvalIds).toHaveLength(0); // No new approvals created
    });
  });

  // ─── submitGateApproval ─────────────────────────────────────────────

  describe("submitGateApproval", () => {
    it("returns error for invalid decision", async () => {
      const result = JSON.parse(
        await submitGateApproval(asDB(db), {
          approvalId: "approval-1",
          decision: "INVALID",
        })
      );

      expect(result.error).toContain("유효하지 않은 결정");
    });

    it("returns error for non-existent approval", async () => {
      const result = JSON.parse(
        await submitGateApproval(asDB(db), {
          approvalId: "non-existent",
          decision: "APPROVED",
        })
      );

      expect(result.error).toContain("승인 요청을 찾을 수 없습니다");
    });

    it("returns error for already decided approval", async () => {
      const owner = makeUser({ id: "owner-1" });
      const reviewer = makeUser({ id: "reviewer-1" });
      db.insert(users).values([owner, reviewer]).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: owner.id });
      db.insert(discoveries).values(disc).run();

      const pkg = makeGatePackage({ id: "pkg-1", discoveryId: "disc-1", gateType: "GATE1" });
      db.insert(gatePackages).values(pkg).run();

      const approval = makeGateApproval({
        id: "approval-1",
        gatePackageId: "pkg-1",
        reviewerId: "reviewer-1",
        decision: "APPROVED",
      });
      db.insert(gateApprovals).values(approval).run();

      const result = JSON.parse(
        await submitGateApproval(asDB(db), {
          approvalId: "approval-1",
          decision: "REJECTED",
        })
      );

      expect(result.error).toContain("이미 결정된");
    });

    it("submits APPROVED decision successfully", async () => {
      const owner = makeUser({ id: "owner-1" });
      const reviewer = makeUser({ id: "reviewer-1" });
      db.insert(users).values([owner, reviewer]).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: owner.id });
      db.insert(discoveries).values(disc).run();

      const pkg = makeGatePackage({ id: "pkg-1", discoveryId: "disc-1", gateType: "GATE1" });
      db.insert(gatePackages).values(pkg).run();

      const approval = makeGateApproval({
        id: "approval-1",
        gatePackageId: "pkg-1",
        reviewerId: "reviewer-1",
        decision: GateApprovalDecision.PENDING,
      });
      db.insert(gateApprovals).values(approval).run();

      const result = JSON.parse(
        await submitGateApproval(asDB(db), {
          approvalId: "approval-1",
          decision: "APPROVED",
          comment: "Looks good!",
        })
      );

      expect(result.success).toBe(true);
      expect(result.decision).toBe("APPROVED");
      expect(result.approvedCount).toBe(1);
    });

    it("submits REJECTED decision successfully", async () => {
      const owner = makeUser({ id: "owner-1" });
      const reviewer = makeUser({ id: "reviewer-1" });
      db.insert(users).values([owner, reviewer]).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: owner.id });
      db.insert(discoveries).values(disc).run();

      const pkg = makeGatePackage({ id: "pkg-1", discoveryId: "disc-1", gateType: "GATE1" });
      db.insert(gatePackages).values(pkg).run();

      const approval = makeGateApproval({
        id: "approval-1",
        gatePackageId: "pkg-1",
        reviewerId: "reviewer-1",
        decision: GateApprovalDecision.PENDING,
      });
      db.insert(gateApprovals).values(approval).run();

      const result = JSON.parse(
        await submitGateApproval(asDB(db), {
          approvalId: "approval-1",
          decision: "REJECTED",
          comment: "Needs more evidence",
        })
      );

      expect(result.success).toBe(true);
      expect(result.decision).toBe("REJECTED");
      expect(result.rejectedCount).toBe(1);
    });

    it("updates gate package to GO when all approved", async () => {
      const owner = makeUser({ id: "owner-1" });
      const reviewer = makeUser({ id: "reviewer-1" });
      db.insert(users).values([owner, reviewer]).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: owner.id });
      db.insert(discoveries).values(disc).run();

      const pkg = makeGatePackage({ id: "pkg-1", discoveryId: "disc-1", gateType: "GATE1" });
      db.insert(gatePackages).values(pkg).run();

      const approval = makeGateApproval({
        id: "approval-1",
        gatePackageId: "pkg-1",
        reviewerId: "reviewer-1",
        decision: GateApprovalDecision.PENDING,
      });
      db.insert(gateApprovals).values(approval).run();

      const result = JSON.parse(
        await submitGateApproval(asDB(db), {
          approvalId: "approval-1",
          decision: "APPROVED",
        })
      );

      expect(result.gatePackageUpdated).toBe(true);

      // Verify gate package decision
      const updatedPkg = db.select().from(gatePackages).all()[0];
      expect(updatedPkg.decision).toBe("GO");
    });

    it("updates gate package to NO_GO when any rejected", async () => {
      const owner = makeUser({ id: "owner-1" });
      const reviewer1 = makeUser({ id: "reviewer-1" });
      const reviewer2 = makeUser({ id: "reviewer-2" });
      db.insert(users).values([owner, reviewer1, reviewer2]).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: owner.id });
      db.insert(discoveries).values(disc).run();

      const pkg = makeGatePackage({ id: "pkg-1", discoveryId: "disc-1", gateType: "GATE1" });
      db.insert(gatePackages).values(pkg).run();

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
      });
      db.insert(gateApprovals).values([approval1, approval2]).run();

      const result = JSON.parse(
        await submitGateApproval(asDB(db), {
          approvalId: "approval-2",
          decision: "REJECTED",
        })
      );

      expect(result.gatePackageUpdated).toBe(true);

      const updatedPkg = db.select().from(gatePackages).all()[0];
      expect(updatedPkg.decision).toBe("NO_GO");
    });

    it("updates gate package to CONDITIONAL when mixed decisions", async () => {
      const owner = makeUser({ id: "owner-1" });
      const reviewer1 = makeUser({ id: "reviewer-1" });
      const reviewer2 = makeUser({ id: "reviewer-2" });
      db.insert(users).values([owner, reviewer1, reviewer2]).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: owner.id });
      db.insert(discoveries).values(disc).run();

      const pkg = makeGatePackage({ id: "pkg-1", discoveryId: "disc-1", gateType: "GATE1" });
      db.insert(gatePackages).values(pkg).run();

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
      });
      db.insert(gateApprovals).values([approval1, approval2]).run();

      const result = JSON.parse(
        await submitGateApproval(asDB(db), {
          approvalId: "approval-2",
          decision: "CONDITIONAL",
        })
      );

      expect(result.gatePackageUpdated).toBe(true);

      const updatedPkg = db.select().from(gatePackages).all()[0];
      expect(updatedPkg.decision).toBe("CONDITIONAL");
    });

    it("does not update gate package when pending approvals remain", async () => {
      const owner = makeUser({ id: "owner-1" });
      const reviewer1 = makeUser({ id: "reviewer-1" });
      const reviewer2 = makeUser({ id: "reviewer-2" });
      db.insert(users).values([owner, reviewer1, reviewer2]).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: owner.id });
      db.insert(discoveries).values(disc).run();

      const pkg = makeGatePackage({ id: "pkg-1", discoveryId: "disc-1", gateType: "GATE1" });
      db.insert(gatePackages).values(pkg).run();

      const approval1 = makeGateApproval({
        id: "approval-1",
        gatePackageId: "pkg-1",
        reviewerId: "reviewer-1",
        decision: GateApprovalDecision.PENDING,
      });
      const approval2 = makeGateApproval({
        id: "approval-2",
        gatePackageId: "pkg-1",
        reviewerId: "reviewer-2",
        decision: GateApprovalDecision.PENDING,
      });
      db.insert(gateApprovals).values([approval1, approval2]).run();

      const result = JSON.parse(
        await submitGateApproval(asDB(db), {
          approvalId: "approval-1",
          decision: "APPROVED",
        })
      );

      expect(result.gatePackageUpdated).toBe(false);
      expect(result.pendingCount).toBe(1);
    });
  });
});
