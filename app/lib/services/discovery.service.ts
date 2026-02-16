import { eq, desc, inArray } from "drizzle-orm";
import type { DB } from "~/db";
import { discoveries, experiments, evidence, users, eventLogs } from "~/db/schema";
import { DiscoveryStatus } from "~/db/schema";
import { tenantWhere } from "~/lib/query/tenant-scope";
import { DiscoveryValidationRules } from "~/lib/validation/discovery-rules";
import { ALLOWED_TRANSITIONS } from "~/lib/constants/status";
import { isOverdue } from "~/lib/format-date";

// ============================================================================
// Types
// ============================================================================

type Discovery = typeof discoveries.$inferSelect;
type Experiment = typeof experiments.$inferSelect;
type Evidence = typeof evidence.$inferSelect;
type User = typeof users.$inferSelect;

interface DiscoveryListItem extends Discovery {
  ownerName: string | undefined;
  isInboxOverdue: boolean;
  isOpenOverdue: boolean;
}

interface DiscoveryListParams {
  tenantId: string;
  status?: string;
  page?: number;
  limit?: number;
}

interface DiscoveryDetail {
  discovery: Discovery;
  owner: User | null;
  reviewer: User | null;
  gatekeeper: User | null;
  experiments: Experiment[];
  evidence: Evidence[];
}

interface CreateDiscoveryInput {
  title: string;
  seedSummary: string;
  seedLinks?: string[] | null;
  sourceType: string;
  ownerId: string;
  tenantId: string;
}

interface ChangeOwnerInput {
  discoveryId: string;
  newOwnerId: string;
  actorId: string;
  handoverNote?: string;
}

// ============================================================================
// Service
// ============================================================================

export class DiscoveryService {
  constructor(private db: DB) {}

  /**
   * 목록 조회 (필터 + tenant scope)
   * routes/discoveries._index.tsx loader 패턴 추출
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
   * routes/discoveries.$id.tsx loader 패턴 추출
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
   * 생성
   * routes/discoveries.new.tsx action 패턴 추출
   */
  async create(
    data: CreateDiscoveryInput,
    actorId: string,
  ): Promise<Discovery> {
    const discoveryId = crypto.randomUUID();

    await this.db.insert(discoveries).values({
      id: discoveryId,
      title: data.title,
      seedSummary: data.seedSummary,
      seedLinks: data.seedLinks || null,
      sourceType: data.sourceType,
      status: DiscoveryStatus.DISCOVERY,
      ownerId: data.ownerId,
      tenantId: data.tenantId,
    });

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId,
      eventType: "CREATE_DISCOVERY",
      metadata: { title: data.title, sourceType: data.sourceType },
    });

    const created = await this.getById(discoveryId);
    return created!;
  }

  /**
   * 상태 전환 (validateTransition 경유 필수)
   * CLAUDE.md: 직접 DB UPDATE 금지 → DiscoveryValidationRules.validateTransition() 경유
   */
  async transition(
    id: string,
    targetStatus: string,
    actorId: string,
  ): Promise<Discovery> {
    const discovery = await this.getById(id);
    if (!discovery) {
      throw new Error(`Discovery를 찾을 수 없습니다: ${id}`);
    }

    // 상태 전환 유효성 검사 (ValidationError throw)
    DiscoveryValidationRules.validateTransition(
      discovery.status,
      targetStatus,
    );

    await this.db
      .update(discoveries)
      .set({
        status: targetStatus,
        stageUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, id));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId: id,
      eventType: "STATUS_TRANSITION",
      metadata: {
        fromStatus: discovery.status,
        toStatus: targetStatus,
      },
    });

    const updated = await this.getById(id);
    return updated!;
  }

  /**
   * Owner 변경
   * routes/discoveries.$id.tsx action (intent=changeOwner) 패턴 추출
   */
  async changeOwner(input: ChangeOwnerInput): Promise<void> {
    const discovery = await this.getById(input.discoveryId);
    if (!discovery) {
      throw new Error(
        `Discovery를 찾을 수 없습니다: ${input.discoveryId}`,
      );
    }

    if (
      discovery.status !== DiscoveryStatus.DISCOVERY &&
      discovery.status !== DiscoveryStatus.IDEA_CARD
    ) {
      throw new Error(
        "INBOX/OPEN 상태에서만 Owner를 변경할 수 있습니다",
      );
    }

    await this.db
      .update(discoveries)
      .set({ ownerId: input.newOwnerId, updatedAt: new Date() })
      .where(eq(discoveries.id, input.discoveryId));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: input.actorId,
      discoveryId: input.discoveryId,
      eventType: "CHANGE_OWNER",
      metadata: {
        previousOwnerId: discovery.ownerId,
        newOwnerId: input.newOwnerId,
        handoverNote: input.handoverNote,
      },
    });
  }

  /**
   * 허용된 전환 목록 조회
   */
  getAllowedTransitions(currentStatus: string): string[] {
    return ALLOWED_TRANSITIONS[currentStatus] ?? [];
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
}
