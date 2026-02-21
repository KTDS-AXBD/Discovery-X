import { eq, desc, inArray, count } from "drizzle-orm";
import type { DB } from "~/db";
import { discoveries, experiments, evidence, users, eventLogs } from "~/db/schema";
import { DiscoveryStatus } from "~/db/schema";
import { tenantWhere } from "~/lib/query/tenant-scope";
import { isOverdue } from "~/lib/format-date";
import type {
  Discovery,
  DiscoveryListItem,
  DiscoveryListParams,
  DiscoveryDetail,
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
}
