/**
 * AgentSession 서비스 — agent_sessions_v2 테이블 기반 세션 관리.
 *
 * 세션 생성, 종료, 조회, 토큰 누적 등 CRUD + 집계 기능 제공.
 */

import { eq, and, isNull, desc, sql } from "drizzle-orm";
import type { DB } from "~/db";
import { agentSessionsV2 } from "~/db/schema-v2";
import type { AgentSessionV2 } from "~/db/schema-v2";

function generateId(): string {
  return crypto.randomUUID();
}

export class SessionManager {
  constructor(private db: DB) {}

  /** 새 세션 생성, ID 반환 */
  async createSession(userId: string): Promise<string> {
    const id = generateId();
    await this.db.insert(agentSessionsV2).values({
      id,
      userId,
    });
    return id;
  }

  /** 세션 종료: endedAt + summary 저장 */
  async endSession(sessionId: string, summary?: string): Promise<void> {
    await this.db
      .update(agentSessionsV2)
      .set({
        endedAt: new Date(),
        ...(summary !== undefined ? { summary } : {}),
      })
      .where(eq(agentSessionsV2.id, sessionId));
  }

  /** 세션 조회 (없으면 null) */
  async getSession(sessionId: string): Promise<AgentSessionV2 | null> {
    const [row] = await this.db
      .select()
      .from(agentSessionsV2)
      .where(eq(agentSessionsV2.id, sessionId))
      .limit(1);
    return row ?? null;
  }

  /** 사용자 세션 목록 (최신순) */
  async listSessions(
    userId: string,
    limit: number = 20,
  ): Promise<AgentSessionV2[]> {
    return this.db
      .select()
      .from(agentSessionsV2)
      .where(eq(agentSessionsV2.userId, userId))
      .orderBy(desc(sql`rowid`))
      .limit(limit);
  }

  /** 토큰 누적: input + output을 기존 값에 합산 */
  async updateTokenCount(
    sessionId: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    const totalNew = inputTokens + outputTokens;
    await this.db
      .update(agentSessionsV2)
      .set({
        tokenCount: sql`${agentSessionsV2.tokenCount} + ${totalNew}`,
      })
      .where(eq(agentSessionsV2.id, sessionId));
  }

  /** 현재 활성(endedAt 없는) 세션 조회 */
  async getActiveSession(userId: string): Promise<AgentSessionV2 | null> {
    const [row] = await this.db
      .select()
      .from(agentSessionsV2)
      .where(
        and(
          eq(agentSessionsV2.userId, userId),
          isNull(agentSessionsV2.endedAt),
        ),
      )
      .orderBy(desc(sql`rowid`))
      .limit(1);
    return row ?? null;
  }
}
