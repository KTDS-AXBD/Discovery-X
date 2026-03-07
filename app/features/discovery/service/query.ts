import { eq, desc, inArray, count, and, lte } from "drizzle-orm";
import type { DB } from "~/db";
import {
  discoveries, experiments, evidence, users, eventLogs, discoveryKpis, kpiMeasurements, discoveryLinks,
  decisionLogs, extractedPatterns, reusableRules,
  contextNodes, contextEdges, ontologyTypes, contextSnapshots,
  industryAdapters, industryRules,
} from "~/db";
import { DiscoveryStatus } from "~/db";
import { tenantWhere } from "~/lib/query/tenant-scope";
import { isOverdue, daysUntilDue } from "~/lib/format-date";
import { ACTIVE_STATUSES } from "~/lib/constants/status";
import type {
  Discovery,
  DiscoveryListItem,
  DiscoveryListParams,
  DiscoveryDetail,
  KpiWithMeasurements,
  DiscoveryLinksResult,
  ActivityLogWithActor,
  WeeklyReviewItem,
  RecallQueueItem,
  DiscoveryExportRow,
} from "./types";

export class DiscoveryQueryService {
  constructor(private db: DB) {}

  /**
   * 목록 조회 (필터 + tenant scope)
   */
  async list(params: DiscoveryListParams): Promise<DiscoveryListItem[]> {
    const { tenantId, status } = params;

    let allDiscoveries: Discovery[];

    if (status === "OVERDUE") {
      const openDiscoveries = await this.db
        .select()
        .from(discoveries)
        .where(tenantWhere(discoveries, tenantId));
      allDiscoveries = openDiscoveries.filter(
        (d) =>
          (d.status === DiscoveryStatus.IDEA_CARD ||
            d.status === DiscoveryStatus.HYPOTHESIS) &&
          isOverdue(d.dueDate),
      );
    } else if (status && status in DiscoveryStatus) {
      allDiscoveries = await this.db
        .select()
        .from(discoveries)
        .where(
          tenantWhere(discoveries, tenantId, eq(discoveries.status, status)),
        );
    } else {
      allDiscoveries = await this.db
        .select()
        .from(discoveries)
        .where(tenantWhere(discoveries, tenantId));
    }

    // Owner 이름 배치 조회
    const ownerIds = [
      ...new Set(allDiscoveries.map((d) => d.ownerId).filter(Boolean)),
    ] as string[];
    const ownerList =
      ownerIds.length > 0
        ? await this.db
            .select()
            .from(users)
            .where(inArray(users.id, ownerIds))
        : [];
    const ownerMap = new Map(ownerList.map((u) => [u.id, u]));

    return allDiscoveries.map((discovery) => {
      const owner = discovery.ownerId
        ? ownerMap.get(discovery.ownerId)
        : undefined;

      const isInboxOverdue =
        discovery.status === DiscoveryStatus.DISCOVERY &&
        Date.now() - new Date(discovery.createdAt).getTime() >
          7 * 24 * 60 * 60 * 1000;

      const isOpenOverdue =
        (discovery.status === DiscoveryStatus.IDEA_CARD ||
          discovery.status === DiscoveryStatus.HYPOTHESIS) &&
        isOverdue(discovery.dueDate);

      return {
        ...discovery,
        ownerName: owner?.name,
        isInboxOverdue,
        isOpenOverdue,
      };
    });
  }

  /**
   * 상세 조회
   */
  async getById(id: string): Promise<Discovery | null> {
    const result = await this.db.query.discoveries.findFirst({
      where: eq(discoveries.id, id),
    });
    return result ?? null;
  }

  /**
   * 상세 조회 + 관련 엔티티 (owner, reviewer, experiments, evidence)
   */
  async getDetail(id: string): Promise<DiscoveryDetail | null> {
    const discovery = await this.getById(id);
    if (!discovery) return null;

    const [owner, reviewer, gatekeeper, discoveryExperiments, discoveryEvidence] =
      await Promise.all([
        discovery.ownerId
          ? this.db.query.users.findFirst({
              where: eq(users.id, discovery.ownerId),
            })
          : Promise.resolve(undefined),
        discovery.reviewerId
          ? this.db.query.users.findFirst({
              where: eq(users.id, discovery.reviewerId),
            })
          : Promise.resolve(undefined),
        discovery.gatekeeperId
          ? this.db.query.users.findFirst({
              where: eq(users.id, discovery.gatekeeperId),
            })
          : Promise.resolve(undefined),
        this.db
          .select()
          .from(experiments)
          .where(eq(experiments.discoveryId, id)),
        this.db
          .select()
          .from(evidence)
          .where(eq(evidence.discoveryId, id)),
      ]);

    return {
      discovery,
      owner: owner ?? null,
      reviewer: reviewer ?? null,
      gatekeeper: gatekeeper ?? null,
      experiments: discoveryExperiments,
      evidence: discoveryEvidence,
    };
  }

  /**
   * 활동 로그 조회
   */
  async getActivityLogs(discoveryId: string, limit = 50) {
    return this.db
      .select()
      .from(eventLogs)
      .where(eq(eventLogs.discoveryId, discoveryId))
      .orderBy(desc(eventLogs.timestamp))
      .limit(limit);
  }

  /**
   * 실험 개수 조회
   */
  async getExperimentCount(discoveryId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(experiments)
      .where(eq(experiments.discoveryId, discoveryId));
    return result[0]?.count || 0;
  }

  /**
   * KPI + 최근 측정값 조회
   */
  async getKpisWithMeasurements(discoveryId: string): Promise<KpiWithMeasurements[]> {
    const kpis = await this.db
      .select()
      .from(discoveryKpis)
      .where(eq(discoveryKpis.discoveryId, discoveryId));

    return Promise.all(
      kpis.map(async (kpi) => {
        const measurements = await this.db
          .select()
          .from(kpiMeasurements)
          .where(eq(kpiMeasurements.kpiId, kpi.id))
          .orderBy(desc(kpiMeasurements.measuredAt))
          .limit(5);
        return {
          kpi,
          measurements: measurements.map((m) => ({
            id: m.id,
            value: m.value,
            measuredAt: m.measuredAt.toISOString(),
          })),
        };
      }),
    );
  }

  /**
   * Discovery 연결 링크 + 연결된 Discovery 상세 조회
   */
  async getLinksWithDiscoveries(discoveryId: string): Promise<DiscoveryLinksResult> {
    const [linksFrom, linksTo] = await Promise.all([
      this.db.select().from(discoveryLinks).where(eq(discoveryLinks.fromDiscoveryId, discoveryId)),
      this.db.select().from(discoveryLinks).where(eq(discoveryLinks.toDiscoveryId, discoveryId)),
    ]);

    const linkedDiscoveryIds = [
      ...linksFrom.map((l) => l.toDiscoveryId),
      ...linksTo.map((l) => l.fromDiscoveryId),
    ];
    const linkedDiscoveriesList =
      linkedDiscoveryIds.length > 0
        ? await this.db.select().from(discoveries).where(inArray(discoveries.id, linkedDiscoveryIds))
        : [];

    const allLinks = [
      ...linksFrom.map((l) => ({ ...l, direction: "from" as const })),
      ...linksTo.map((l) => ({ ...l, direction: "to" as const })),
    ];

    return { allLinks, linkedDiscoveries: linkedDiscoveriesList };
  }

  /**
   * 활동 로그 + 액터 이름 해석
   */
  async getActivityLogsWithActors(discoveryId: string, limit = 50): Promise<ActivityLogWithActor[]> {
    const logs = await this.getActivityLogs(discoveryId, limit);
    const actorIds = [...new Set(logs.map((l) => l.actorId))];
    const systemActors = ["system-agent", "system-radar", "system"];
    const nonSystemActorIds = actorIds.filter((aid) => !systemActors.includes(aid));
    const actorUsers =
      nonSystemActorIds.length > 0
        ? await this.db.select().from(users).where(inArray(users.id, nonSystemActorIds))
        : [];

    const actorMap = new Map<string, string>();
    for (const aid of systemActors) actorMap.set(aid, "시스템");
    for (const u of actorUsers) actorMap.set(u.id, u.name);

    return logs.map((l) => ({
      id: l.id,
      eventType: l.eventType,
      actorId: l.actorId,
      actorName: actorMap.get(l.actorId) || l.actorId,
      metadata: l.metadata as Record<string, unknown> | null,
      timestamp: l.timestamp?.toISOString() || new Date().toISOString(),
    }));
  }

  /**
   * 전체 사용자 목록 (Owner/Reviewer/Gatekeeper 선택용)
   */
  async getAllUsers() {
    return this.db.select().from(users);
  }

  /**
   * Weekly Review 목록 (활성 Discovery, ageInDays 내림차순)
   * Owner 배치 조회로 N+1 방지
   */
  async listForWeeklyReview(tenantId: string): Promise<WeeklyReviewItem[]> {
    const openDiscoveries = await this.db
      .select()
      .from(discoveries)
      .where(
        and(
          inArray(discoveries.status, [...ACTIVE_STATUSES]),
          eq(discoveries.tenantId, tenantId),
        ),
      );

    const ownerIds = [
      ...new Set(openDiscoveries.map((d) => d.ownerId).filter(Boolean)),
    ] as string[];
    const ownerList =
      ownerIds.length > 0
        ? await this.db.select().from(users).where(inArray(users.id, ownerIds))
        : [];
    const ownerMap = new Map(ownerList.map((u) => [u.id, u.name]));

    const result: WeeklyReviewItem[] = openDiscoveries.map((d) => {
      const ageInDays = Math.floor(
        (Date.now() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      const daysLeft = daysUntilDue(d.dueDate);
      return {
        ...d,
        ownerName: d.ownerId ? ownerMap.get(d.ownerId) : undefined,
        ageInDays,
        daysUntilDue: daysLeft,
        isOverdue: daysLeft !== null && daysLeft < 0,
      };
    });

    result.sort((a, b) => b.ageInDays - a.ageInDays);
    return result;
  }

  /**
   * Recall Queue 목록 (HOLD + revisitDate ≤ now, daysSinceRevisit 오름차순)
   * Owner 배치 조회로 N+1 방지
   */
  async listForRecallQueue(tenantId: string): Promise<RecallQueueItem[]> {
    const now = new Date();
    const holdDiscoveries = await this.db
      .select()
      .from(discoveries)
      .where(
        and(
          eq(discoveries.status, DiscoveryStatus.HOLD),
          lte(discoveries.revisitDate, now),
          eq(discoveries.tenantId, tenantId),
        ),
      );

    const ownerIds = [
      ...new Set(holdDiscoveries.map((d) => d.ownerId).filter(Boolean)),
    ] as string[];
    const ownerList =
      ownerIds.length > 0
        ? await this.db.select().from(users).where(inArray(users.id, ownerIds))
        : [];
    const ownerMap = new Map(ownerList.map((u) => [u.id, u.name]));

    const result: RecallQueueItem[] = holdDiscoveries.map((d) => {
      const daysSinceRevisit = d.revisitDate
        ? Math.floor(
            (Date.now() - new Date(d.revisitDate).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 0;
      return {
        ...d,
        ownerName: d.ownerId ? ownerMap.get(d.ownerId) : undefined,
        daysSinceRevisit,
      };
    });

    result.sort((a, b) => {
      const dateA = a.revisitDate ? new Date(a.revisitDate).getTime() : 0;
      const dateB = b.revisitDate ? new Date(b.revisitDate).getTime() : 0;
      return dateA - dateB;
    });
    return result;
  }

  /**
   * 사용자 단건 조회
   */
  async getUserById(userId: string) {
    const result = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    return result ?? null;
  }

  /**
   * 실험 단건 조회 (discovery 소속 검증 포함)
   */
  async getExperimentById(discoveryId: string, experimentId: string) {
    const result = await this.db.query.experiments.findFirst({
      where: and(
        eq(experiments.id, experimentId),
        eq(experiments.discoveryId, discoveryId),
      ),
    });
    return result ?? null;
  }

  /**
   * 의사결정 로그 개수 조회
   */
  async getDecisionLogCount(discoveryId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(decisionLogs)
      .where(eq(decisionLogs.discoveryId, discoveryId));
    return result[0]?.count || 0;
  }

  /**
   * 추출된 패턴 목록 조회
   */
  async getExtractedPatterns(limit = 50) {
    return this.db
      .select()
      .from(extractedPatterns)
      .orderBy(desc(extractedPatterns.createdAt))
      .limit(limit);
  }

  /**
   * 활성화된 재사용 규칙 목록 조회
   */
  async getActiveRules(limit = 20) {
    return this.db
      .select()
      .from(reusableRules)
      .where(eq(reusableRules.enabled, 1))
      .limit(limit);
  }

  /**
   * 맥락 그래프 전체 데이터 조회 (nodes, edges, types, snapshots)
   */
  async getGraphData(discoveryId: string) {
    const nodes = await this.db
      .select()
      .from(contextNodes)
      .where(eq(contextNodes.discoveryId, discoveryId));

    const allEdges = await this.db.select().from(contextEdges);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = allEdges.filter(
      (e) => nodeIds.has(e.fromNodeId) || nodeIds.has(e.toNodeId),
    );

    const types = await this.db.select().from(ontologyTypes);

    const snapshots = await this.db
      .select()
      .from(contextSnapshots)
      .where(eq(contextSnapshots.discoveryId, discoveryId));

    return { nodes, edges, types, snapshots };
  }

  /**
   * 규제 준수 뷰용 데이터 조회 (adapter, rules, evs, events)
   */
  async getComplianceData(discoveryId: string, industryAdapterId: string | null | undefined) {
    let adapter: (typeof industryAdapters.$inferSelect) | null = null;
    let rules: (typeof industryRules.$inferSelect)[] = [];

    if (industryAdapterId) {
      const adapterResult = await this.db
        .select()
        .from(industryAdapters)
        .where(eq(industryAdapters.id, industryAdapterId))
        .limit(1);
      adapter = adapterResult[0] ?? null;

      if (adapter) {
        rules = await this.db
          .select()
          .from(industryRules)
          .where(
            and(
              eq(industryRules.industryAdapterId, adapter.id),
              eq(industryRules.enabled, 1),
            ),
          );
      }
    }

    const evs = await this.db
      .select()
      .from(evidence)
      .where(eq(evidence.discoveryId, discoveryId));

    const events = await this.db
      .select()
      .from(eventLogs)
      .where(eq(eventLogs.discoveryId, discoveryId))
      .orderBy(desc(eventLogs.timestamp))
      .limit(30);

    return { adapter, rules, evs, events };
  }

  /**
   * 맥락 그래프 스냅샷 저장
   */
  async saveSnapshot(discoveryId: string, stage: string, snapshotData: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  }) {
    await this.db.insert(contextSnapshots).values({
      id: crypto.randomUUID(),
      discoveryId,
      stage,
      snapshotData,
    });
  }

  /**
   * CSV 내보내기용 enriched 목록 조회 (tenant-scoped)
   * Discoveries + 관련 users/experiments/evidence를 배치 조회하여 반환한다.
   */
  async getForExport(tenantId: string): Promise<DiscoveryExportRow[]> {
    const allDiscoveries = await this.db
      .select()
      .from(discoveries)
      .where(tenantWhere(discoveries, tenantId));

    if (allDiscoveries.length === 0) return [];

    const discoveryIds = allDiscoveries.map((d) => d.id);
    const userIds = [
      ...new Set([
        ...allDiscoveries.map((d) => d.ownerId).filter(Boolean),
        ...allDiscoveries.map((d) => d.reviewerId).filter(Boolean),
      ]),
    ] as string[];

    const [allUsers, allExperiments, allEvidence] = await Promise.all([
      userIds.length > 0
        ? this.db.select().from(users).where(inArray(users.id, userIds))
        : Promise.resolve([]),
      this.db.select().from(experiments).where(inArray(experiments.discoveryId, discoveryIds)),
      this.db.select().from(evidence).where(inArray(evidence.discoveryId, discoveryIds)),
    ]);

    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const expMap = new Map<string, typeof allExperiments>();
    for (const exp of allExperiments) {
      const arr = expMap.get(exp.discoveryId) ?? [];
      arr.push(exp);
      expMap.set(exp.discoveryId, arr);
    }

    const evidenceMap = new Map<string, typeof allEvidence>();
    for (const ev of allEvidence) {
      const arr = evidenceMap.get(ev.discoveryId) ?? [];
      arr.push(ev);
      evidenceMap.set(ev.discoveryId, arr);
    }

    return allDiscoveries.map((d) => {
      const owner = d.ownerId ? userMap.get(d.ownerId) : null;
      const reviewer = d.reviewerId ? userMap.get(d.reviewerId) : null;
      const exps = expMap.get(d.id) ?? [];
      const evs = evidenceMap.get(d.id) ?? [];

      const strongEvidenceCount = evs.filter(
        (e) => e.strength === "A" || e.strength === "B",
      ).length;

      const expSlots = Array.from({ length: 3 }, (_, i) => {
        const exp = exps[i];
        return {
          hypothesis: exp?.hypothesis ?? "",
          action: exp?.minimalAction ?? "",
          deadline: exp?.deadline ? new Date(exp.deadline).toISOString() : "",
          result: exp?.resultSummary ?? "",
          completedAt: exp?.completedAt ? new Date(exp.completedAt).toISOString() : "",
        };
      });

      return {
        id: d.id,
        title: d.title,
        status: d.status,
        sourceType: d.sourceType,
        ownerName: owner?.name ?? "",
        ownerEmail: owner?.email ?? "",
        reviewerName: reviewer?.name ?? "",
        experimentCount: exps.length,
        evidenceCount: evs.length,
        strongEvidenceCount,
        createdAt: new Date(d.createdAt).toISOString(),
        dueDate: d.dueDate ? new Date(d.dueDate).toISOString() : "",
        decidedAt: d.decidedAt ? new Date(d.decidedAt).toISOString() : "",
        decisionState: d.decisionState ?? "",
        notNowTriggerType: d.notNowTriggerType ?? "",
        revisitDate: d.revisitDate ? new Date(d.revisitDate).toISOString() : "",
        deadEndFailurePattern: (d.deadEndFailurePattern as string[] | null)?.join("; ") ?? "",
        seedSummary: d.seedSummary,
        decisionRationale: d.decisionRationale ?? "",
        expSlots,
        evidenceSummary: evs.map((e) => `${e.type}/${e.strength}: ${e.content}`).join("; "),
      };
    });
  }
}
