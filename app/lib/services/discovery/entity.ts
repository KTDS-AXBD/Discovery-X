import { eq, and, count } from "drizzle-orm";
import type { DB } from "~/db";
import { discoveries, experiments, evidence, eventLogs } from "~/db/schema";
import { DiscoveryStatus } from "~/db/schema";
import type {
  Discovery,
  CreateDiscoveryInput,
  UpdateDiscoveryInput,
  AddExperimentInput,
  AddEvidenceInput,
  CompleteExperimentInput,
} from "./types";
import { DiscoveryQueryService } from "./query";

export class DiscoveryEntityService {
  private queryService: DiscoveryQueryService;

  constructor(private db: DB) {
    this.queryService = new DiscoveryQueryService(db);
  }

  /**
   * 생성
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

    const created = await this.queryService.getById(discoveryId);
    return created!;
  }

  /**
   * Discovery 필드 수정
   */
  async update(
    id: string,
    data: UpdateDiscoveryInput,
    actorId: string,
  ): Promise<void> {
    const discovery = await this.queryService.getById(id);
    if (!discovery) {
      throw new Error(`Discovery를 찾을 수 없습니다: ${id}`);
    }

    if (
      discovery.status !== DiscoveryStatus.DISCOVERY &&
      discovery.status !== DiscoveryStatus.IDEA_CARD
    ) {
      throw new Error("INBOX/OPEN 상태에서만 편집할 수 있습니다");
    }

    await this.db
      .update(discoveries)
      .set({
        title: data.title,
        seedSummary: data.seedSummary,
        seedLinks: data.seedLinks || null,
        sourceType: data.sourceType,
        targetSegment: data.targetSegment || null,
        valueProposition: data.valueProposition || null,
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, id));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId: id,
      eventType: "UPDATE_DISCOVERY",
      metadata: { title: data.title, sourceType: data.sourceType },
    });
  }

  /**
   * 실험 추가
   */
  async addExperiment(
    discoveryId: string,
    input: AddExperimentInput,
    actorId: string,
  ): Promise<string> {
    const discovery = await this.queryService.getById(discoveryId);
    if (!discovery) {
      throw new Error(`Discovery를 찾을 수 없습니다: ${discoveryId}`);
    }

    if (discovery.status !== DiscoveryStatus.IDEA_CARD) {
      throw new Error(
        "OPEN 상태의 Discovery만 실험을 추가할 수 있습니다",
      );
    }

    // 실험 제한 검증 (최대 3개)
    const expCount = await this.db
      .select({ count: count() })
      .from(experiments)
      .where(eq(experiments.discoveryId, discoveryId));
    if ((expCount[0]?.count || 0) >= 3) {
      throw new Error("최대 3개 실험만 가능합니다");
    }

    const experimentId = crypto.randomUUID();
    await this.db.insert(experiments).values({
      id: experimentId,
      discoveryId,
      hypothesis: input.hypothesis,
      minimalAction: input.minimalAction,
      deadline: input.deadline,
      expectedEvidence: input.expectedEvidence,
    });

    await this.db
      .update(discoveries)
      .set({ updatedAt: new Date() })
      .where(eq(discoveries.id, discoveryId));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId,
      eventType: "ADD_EXPERIMENT",
      metadata: { experimentId, hypothesis: input.hypothesis },
    });

    return experimentId;
  }

  /**
   * 근거 추가
   */
  async addEvidence(
    discoveryId: string,
    input: AddEvidenceInput,
    actorId: string,
  ): Promise<string> {
    const discovery = await this.queryService.getById(discoveryId);
    if (!discovery) {
      throw new Error(`Discovery를 찾을 수 없습니다: ${discoveryId}`);
    }

    if (discovery.status === DiscoveryStatus.DISCOVERY) {
      throw new Error("INBOX 상태에서는 Evidence를 추가할 수 없습니다");
    }

    const evidenceId = crypto.randomUUID();
    await this.db.insert(evidence).values({
      id: evidenceId,
      discoveryId,
      experimentId: input.experimentId || null,
      type: input.type,
      strength: input.strength,
      content: input.content,
      linkOrAttachment: input.linkOrAttachment || null,
      createdById: input.createdById,
    });

    await this.db
      .update(discoveries)
      .set({ updatedAt: new Date() })
      .where(eq(discoveries.id, discoveryId));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId,
      eventType: "ADD_EVIDENCE",
      metadata: { evidenceId, type: input.type, strength: input.strength },
    });

    return evidenceId;
  }

  /**
   * 실험 완료 처리
   */
  async completeExperiment(
    discoveryId: string,
    input: CompleteExperimentInput,
    actorId: string,
  ): Promise<void> {
    const experiment = await this.db.query.experiments.findFirst({
      where: and(
        eq(experiments.id, input.experimentId),
        eq(experiments.discoveryId, discoveryId),
      ),
    });

    if (!experiment) {
      throw new Error("실험을 찾을 수 없습니다");
    }

    if (experiment.completedAt) {
      throw new Error("이미 완료된 실험입니다");
    }

    await this.db
      .update(experiments)
      .set({
        resultSummary: input.resultSummary,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(experiments.id, input.experimentId));

    await this.db
      .update(discoveries)
      .set({ updatedAt: new Date() })
      .where(eq(discoveries.id, discoveryId));

    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId,
      eventType: "COMPLETE_EXPERIMENT",
      metadata: {
        experimentId: input.experimentId,
        resultSummary: input.resultSummary,
      },
    });
  }
}
