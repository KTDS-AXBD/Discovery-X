// SignalService — SharedSignal CRUD + 라우팅 로직
import { eq, and, desc, sql } from "drizzle-orm";
import type { DB } from "~/db";
import {
  sharedSignals,
  type SharedSignal,
  type NewSharedSignal,
  topics,
} from "~/db/schema-v2";
import { users } from "~/db/schema";

export interface SignalWithDetails {
  id: number;
  contentSummary: string;
  score: number;
  status: string;
  topicId: string | null;
  topicName: string | null;
  sourceUserName: string | null;
  createdAt: Date;
}

// ============================================================================
// Service
// ============================================================================

export class SignalService {
  constructor(private db: DB) {}

  /** 팀 기준 시그널 목록 조회 (필터 옵션) */
  async list(
    teamId: string,
    opts?: { topicId?: string; status?: string; limit?: number },
  ): Promise<SharedSignal[]> {
    const conditions = [eq(sharedSignals.teamId, teamId)];

    if (opts?.topicId) {
      conditions.push(eq(sharedSignals.topicId, opts.topicId));
    }
    if (opts?.status) {
      conditions.push(eq(sharedSignals.status, opts.status));
    }

    return this.db
      .select()
      .from(sharedSignals)
      .where(and(...conditions))
      .orderBy(desc(sharedSignals.score))
      .limit(opts?.limit ?? 50);
  }

  /** 시그널 생성 */
  async create(data: NewSharedSignal): Promise<SharedSignal> {
    const result = await this.db
      .insert(sharedSignals)
      .values(data)
      .returning();
    return result[0];
  }

  /** 상태 변경 + 라우팅 대상 설정 */
  async updateStatus(
    id: number,
    status: string,
    routedTo?: string,
  ): Promise<void> {
    await this.db
      .update(sharedSignals)
      .set({
        status,
        ...(routedTo !== undefined && { routedTo }),
      })
      .where(eq(sharedSignals.id, id));
  }

  /** Topic별 시그널 조회 (score 내림차순) */
  async getByTopic(topicId: string): Promise<SharedSignal[]> {
    return this.db
      .select()
      .from(sharedSignals)
      .where(eq(sharedSignals.topicId, topicId))
      .orderBy(desc(sharedSignals.score));
  }

  /** 시그널 무시 처리 (status → 'dismissed') */
  async dismiss(id: number): Promise<void> {
    await this.db
      .update(sharedSignals)
      .set({ status: "dismissed" })
      .where(eq(sharedSignals.id, id));
  }

  /**
   * 시그널 목록 + 토픽명 + 소스 사용자명 (JOIN)
   * topicId/status 필터 지원, score + createdAt 내림차순
   */
  async listWithDetails(
    teamId: string,
    opts?: { topicId?: string; status?: string; limit?: number },
  ): Promise<SignalWithDetails[]> {
    const conditions = [eq(sharedSignals.teamId, teamId)];
    if (opts?.topicId) conditions.push(eq(sharedSignals.topicId, opts.topicId));
    if (opts?.status) conditions.push(eq(sharedSignals.status, opts.status));

    return this.db
      .select({
        id: sharedSignals.id,
        contentSummary: sharedSignals.contentSummary,
        score: sharedSignals.score,
        status: sharedSignals.status,
        topicId: sharedSignals.topicId,
        topicName: topics.name,
        sourceUserName: users.name,
        createdAt: sharedSignals.createdAt,
      })
      .from(sharedSignals)
      .leftJoin(topics, eq(topics.id, sharedSignals.topicId))
      .leftJoin(users, eq(users.id, sharedSignals.sourceUserId))
      .where(and(...conditions))
      .orderBy(desc(sharedSignals.score), desc(sql`${sharedSignals.createdAt}`))
      .limit(opts?.limit ?? 100);
  }
}
