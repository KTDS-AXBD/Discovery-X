/**
 * Governance tools — Gate approval request/submission.
 * v3 R3: 2 tools for gate approval workflow.
 */

import { eq, and } from "drizzle-orm";
import type { DB } from "~/db";
import {
  gateApprovals,
  gatePackages,
  users,
  GateApprovalDecision,
} from "~/db";

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * request_gate_approval — Gate 패키지에 승인 요청 생성
 */
export async function requestGateApproval(
  db: DB,
  input: {
    gatePackageId: string;
    reviewerIds: string[];
    slaDeadlineDays?: number;
  }
): Promise<string> {
  // Validate gate package exists
  const pkg = await db
    .select()
    .from(gatePackages)
    .where(eq(gatePackages.id, input.gatePackageId))
    .limit(1);

  if (pkg.length === 0) {
    return JSON.stringify({ error: `Gate 패키지를 찾을 수 없습니다: ${input.gatePackageId}` });
  }

  if (!input.reviewerIds || input.reviewerIds.length === 0) {
    return JSON.stringify({ error: "최소 1명의 리뷰어를 지정해야 합니다." });
  }

  // Validate reviewers exist
  for (const reviewerId of input.reviewerIds) {
    const user = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, reviewerId))
      .limit(1);
    if (user.length === 0) {
      return JSON.stringify({ error: `사용자를 찾을 수 없습니다: ${reviewerId}` });
    }
  }

  // Calculate SLA deadline (default 7 days)
  const DEFAULT_SLA_DAYS = 7;
  const slaDays = input.slaDeadlineDays ?? DEFAULT_SLA_DAYS;
  const slaDeadline = new Date(Date.now() + slaDays * 24 * 60 * 60 * 1000);

  // Create approval requests
  const approvalIds: string[] = [];
  for (const reviewerId of input.reviewerIds) {
    // Check for duplicate
    const existing = await db
      .select({ id: gateApprovals.id })
      .from(gateApprovals)
      .where(
        and(
          eq(gateApprovals.gatePackageId, input.gatePackageId),
          eq(gateApprovals.reviewerId, reviewerId)
        )
      )
      .limit(1);

    if (existing.length > 0) continue; // Skip duplicate

    const id = generateId();
    await db.insert(gateApprovals).values({
      id,
      gatePackageId: input.gatePackageId,
      reviewerId,
      decision: GateApprovalDecision.PENDING,
      slaDeadline,
    });
    approvalIds.push(id);
  }

  return JSON.stringify({
    success: true,
    approvalIds,
    gatePackageId: input.gatePackageId,
    reviewerCount: input.reviewerIds.length,
    slaDeadline: slaDeadline?.toISOString(),
    message: `${approvalIds.length}명의 리뷰어에게 승인 요청을 생성했습니다.`,
  });
}

/**
 * submit_gate_approval — 승인/거부/조건부 결정
 */
export async function submitGateApproval(
  db: DB,
  input: {
    approvalId: string;
    decision: string;
    comment?: string;
  }
): Promise<string> {
  const validDecisions = ["APPROVED", "REJECTED", "CONDITIONAL"];
  if (!validDecisions.includes(input.decision)) {
    return JSON.stringify({
      error: `유효하지 않은 결정입니다. 가능한 값: ${validDecisions.join(", ")}`,
    });
  }

  // Get approval
  const approval = await db
    .select()
    .from(gateApprovals)
    .where(eq(gateApprovals.id, input.approvalId))
    .limit(1);

  if (approval.length === 0) {
    return JSON.stringify({ error: `승인 요청을 찾을 수 없습니다: ${input.approvalId}` });
  }

  if (approval[0].decision !== GateApprovalDecision.PENDING) {
    return JSON.stringify({
      error: `이미 결정된 승인 요청입니다 (현재: ${approval[0].decision}).`,
    });
  }

  // Update approval
  await db
    .update(gateApprovals)
    .set({
      decision: input.decision,
      comment: input.comment,
      decidedAt: new Date(),
    })
    .where(eq(gateApprovals.id, input.approvalId));

  // Check if all approvals for this gate package are decided
  const allApprovals = await db
    .select()
    .from(gateApprovals)
    .where(eq(gateApprovals.gatePackageId, approval[0].gatePackageId));

  const pendingCount = allApprovals.filter(
    (a) => a.id === input.approvalId ? false : a.decision === GateApprovalDecision.PENDING
  ).length;

  const approvedCount = allApprovals.filter(
    (a) => a.id === input.approvalId
      ? input.decision === "APPROVED"
      : a.decision === "APPROVED"
  ).length;

  const rejectedCount = allApprovals.filter(
    (a) => a.id === input.approvalId
      ? input.decision === "REJECTED"
      : a.decision === "REJECTED"
  ).length;

  // If all decided, update gate package
  let gatePackageUpdated = false;
  if (pendingCount === 0) {
    let gateDecision: string;
    if (rejectedCount > 0) {
      gateDecision = "NO_GO";
    } else if (approvedCount === allApprovals.length) {
      gateDecision = "GO";
    } else {
      gateDecision = "CONDITIONAL";
    }

    await db
      .update(gatePackages)
      .set({
        decision: gateDecision,
        decidedAt: new Date(),
      })
      .where(eq(gatePackages.id, approval[0].gatePackageId));

    gatePackageUpdated = true;
  }

  return JSON.stringify({
    success: true,
    approvalId: input.approvalId,
    decision: input.decision,
    gatePackageId: approval[0].gatePackageId,
    pendingCount,
    approvedCount,
    rejectedCount,
    gatePackageUpdated,
    message: gatePackageUpdated
      ? `모든 리뷰가 완료되어 Gate 패키지가 업데이트되었습니다.`
      : `결정 완료. 남은 대기 리뷰: ${pendingCount}건`,
  });
}
