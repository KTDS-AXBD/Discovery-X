import { eq, desc, sql } from "drizzle-orm";
import type { DB } from "~/db";
import {
  skillExecutions,
  SkillExecStatus,
  type SkillExecution,
} from "~/features/ideas/db/schema";

// ============================================================================
// Service
// ============================================================================

export class SkillExecutionService {
  constructor(private db: DB) {}

  /** 실행 생성 (PENDING 상태) */
  async create(params: {
    ideaId: string;
    skillId: string;
    tenantId: string;
    executedBy: string;
    inputContext?: string;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await this.db.insert(skillExecutions).values({
      id,
      ideaId: params.ideaId,
      skillId: params.skillId,
      tenantId: params.tenantId,
      executedBy: params.executedBy,
      status: SkillExecStatus.PENDING,
      inputContext: params.inputContext ?? null,
    });
    return id;
  }

  /** 상태 전환 + 결과 저장 */
  async updateStatus(
    id: string,
    status: (typeof SkillExecStatus)[keyof typeof SkillExecStatus],
    data?: {
      resultData?: Record<string, unknown>;
      resultMarkdown?: string;
      errorMessage?: string;
      modelVersion?: string;
      tokensUsed?: number;
      latencyMs?: number;
    },
  ) {
    const now = sql`(unixepoch())`;
    const set: Record<string, unknown> = { status };

    if (status === SkillExecStatus.PROCESSING) {
      set.startedAt = now;
    }
    if (
      status === SkillExecStatus.COMPLETED ||
      status === SkillExecStatus.FAILED
    ) {
      set.completedAt = now;
    }

    if (data) {
      if (data.resultData !== undefined) set.resultData = data.resultData;
      if (data.resultMarkdown !== undefined)
        set.resultMarkdown = data.resultMarkdown;
      if (data.errorMessage !== undefined) set.errorMessage = data.errorMessage;
      if (data.modelVersion !== undefined) set.modelVersion = data.modelVersion;
      if (data.tokensUsed !== undefined) set.tokensUsed = data.tokensUsed;
      if (data.latencyMs !== undefined) set.latencyMs = data.latencyMs;
    }

    await this.db
      .update(skillExecutions)
      .set(set)
      .where(eq(skillExecutions.id, id));
  }

  /** 아이디어별 실행 이력 조회 (최신순) */
  async listByIdea(ideaId: string) {
    return this.db
      .select()
      .from(skillExecutions)
      .where(eq(skillExecutions.ideaId, ideaId))
      .orderBy(desc(skillExecutions.requestedAt));
  }

  /** 단일 실행 조회 */
  async getById(id: string): Promise<SkillExecution | null> {
    return (
      (await this.db
        .select()
        .from(skillExecutions)
        .where(eq(skillExecutions.id, id))
        .get()) ?? null
    );
  }
}
