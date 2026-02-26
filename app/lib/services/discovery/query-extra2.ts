/**
 * query-extra2.ts — Discovery 서브라우트용 추가 쿼리 서비스
 * add-evidence / decide-next / methods / gate 등 라우트 전용
 */
import { eq, and } from "drizzle-orm";
import type { DB } from "~/db";
import {
  experiments,
  evidence,
  users,
  gatePackages,
  gateApprovals,
  methodPacks,
  methodRuns,
  UserRole,
} from "~/db/schema";

export class DiscoveryQueryExtraService {
  constructor(private db: DB) {}

  /**
   * Discovery에 속한 실험 목록 (add-evidence 선택용)
   */
  async getExperimentsByDiscoveryId(discoveryId: string) {
    return this.db
      .select()
      .from(experiments)
      .where(eq(experiments.discoveryId, discoveryId));
  }

  /**
   * Discovery에 속한 Evidence 목록 + 강도 필터용
   */
  async getEvidenceSummary(discoveryId: string) {
    const allEvidence = await this.db
      .select()
      .from(evidence)
      .where(eq(evidence.discoveryId, discoveryId));

    const strongEvidence = allEvidence.filter(
      (e) => e.strength === "A" || e.strength === "B",
    );

    return {
      allEvidence,
      evidenceCount: allEvidence.length,
      strongEvidenceCount: strongEvidence.length,
    };
  }

  /**
   * 사용자 단건 조회 (이메일 발송용)
   */
  async getUserById(userId: string) {
    return this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
  }

  /**
   * Gate 페이지 전체 데이터 조회
   * - 패키지 목록
   * - 각 패키지의 승인 목록 + 리뷰어 이름
   * - Gatekeeper/Admin 목록
   */
  async getGatePageData(discoveryId: string) {
    const packages = await this.db
      .select()
      .from(gatePackages)
      .where(eq(gatePackages.discoveryId, discoveryId));

    const allUsers = await this.db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const approvals: Array<{
      id: string;
      gatePackageId: string;
      reviewerId: string;
      decision: string;
      comment: string | null;
      requestedAt: string;
      decidedAt: string | null;
      slaDeadline: string | null;
      reviewerName: string;
    }> = [];

    for (const pkg of packages) {
      const pkgApprovals = await this.db
        .select()
        .from(gateApprovals)
        .where(eq(gateApprovals.gatePackageId, pkg.id));

      for (const a of pkgApprovals) {
        const reviewer = userMap.get(a.reviewerId);
        approvals.push({
          ...a,
          requestedAt: a.requestedAt.toISOString(),
          decidedAt: a.decidedAt?.toISOString() || null,
          slaDeadline: a.slaDeadline?.toISOString() || null,
          reviewerName: reviewer?.name || "알 수 없음",
        });
      }
    }

    const gatekeepers = allUsers
      .filter(
        (u) => u.role === UserRole.ADMIN || u.role === UserRole.GATEKEEPER,
      )
      .map((u) => ({ id: u.id, name: u.name }));

    const serializedPackages = packages.map((p) => ({
      id: p.id,
      gateType: p.gateType,
      decision: p.decision,
      rationale: p.rationale,
      autoDraftedAt: p.autoDraftedAt?.toISOString() || null,
      submittedAt: p.submittedAt?.toISOString() || null,
      decidedAt: p.decidedAt?.toISOString() || null,
      scorecard: p.scorecard as Record<string, unknown> | null,
      methodRunSummary: p.methodRunSummary as Array<Record<string, unknown>> | null,
      evidenceSummary: p.evidenceSummary as Array<Record<string, unknown>> | null,
      assumptions: p.assumptions as Array<Record<string, unknown>> | null,
    }));

    return { packages: serializedPackages, approvals, gatekeepers };
  }

  /**
   * Methods 페이지 데이터 조회 (methodPacks + methodRuns)
   */
  async getMethodsPageData(discoveryId: string, _currentStatus: string) {
    const allPacks = await this.db.select().from(methodPacks);

    const runs = await this.db
      .select()
      .from(methodRuns)
      .where(eq(methodRuns.discoveryId, discoveryId));

    return { allPacks, runs };
  }

  /**
   * methods.tsx action — 기존 실행 중인 run 존재 여부 체크
   */
  async getRunningMethodRun(discoveryId: string, methodPackId: string) {
    return this.db
      .select()
      .from(methodRuns)
      .where(
        and(
          eq(methodRuns.discoveryId, discoveryId),
          eq(methodRuns.methodPackId, methodPackId),
          eq(methodRuns.status, "RUNNING"),
        ),
      );
  }

  /**
   * gate approval 단건 조회 (submit-approval 시 검증용)
   */
  async getGateApprovalById(approvalId: string) {
    return this.db.query.gateApprovals.findFirst({
      where: eq(gateApprovals.id, approvalId),
    });
  }

  /**
   * gate approval 전체 목록 (패키지 기준 집계용)
   */
  async getGateApprovalsByPackageId(gatePackageId: string) {
    return this.db
      .select()
      .from(gateApprovals)
      .where(eq(gateApprovals.gatePackageId, gatePackageId));
  }

  /**
   * reviewer 존재 및 역할 검증 (request-approval 시)
   */
  async getReviewerForGate(reviewerId: string) {
    const reviewer = await this.db.query.users.findFirst({
      where: eq(users.id, reviewerId),
    });
    if (
      !reviewer ||
      (reviewer.role !== UserRole.ADMIN && reviewer.role !== UserRole.GATEKEEPER)
    ) {
      return null;
    }
    return reviewer;
  }
}
