import { eq, desc, and } from "drizzle-orm";
import type { DB } from "~/db";
import { agentSessionsV2, conversations } from "~/db";
import { tenantWhere } from "~/lib/query/tenant-scope";

// ============================================================================
// Service
// ============================================================================

export class ChatSessionService {
  constructor(private db: DB) {}

  // ---------- Agent Sessions ----------

  /** 세션 목록 조회 (userId 스코프) */
  async listSessions(userId: string, limit = 20, offset = 0) {
    return this.db
      .select()
      .from(agentSessionsV2)
      .where(eq(agentSessionsV2.userId, userId))
      .orderBy(desc(agentSessionsV2.startedAt))
      .limit(limit)
      .offset(offset);
  }

  /** 세션 + conversation 동시 생성 → { sessionId, conversationId } */
  async createSessionWithConversation(userId: string) {
    const sessionId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const now = new Date();

    await this.db.insert(agentSessionsV2).values({
      id: sessionId,
      userId,
      startedAt: now,
      tokenCount: 0,
      tokenCost: 0,
      summary: null,
    });

    await this.db.insert(conversations).values({
      id: conversationId,
      userId,
      title: `[agent:${sessionId}]`,
      createdAt: now,
      updatedAt: now,
    });

    return { sessionId, conversationId };
  }

  /** agent title 패턴으로 conversation 조회, 없으면 생성 */
  async findOrCreateConversation(userId: string, sessionId: string) {
    const agentTitle = `[agent:${sessionId}]`;

    const conversation = await this.db.query.conversations.findFirst({
      where: and(
        eq(conversations.userId, userId),
        eq(conversations.title, agentTitle),
      ),
    });

    if (conversation) return conversation.id;

    const conversationId = crypto.randomUUID();
    const now = new Date();
    await this.db.insert(conversations).values({
      id: conversationId,
      userId,
      title: agentTitle,
      createdAt: now,
      updatedAt: now,
    });

    return conversationId;
  }

  // ---------- Conversations ----------

  /** conversation 생성 */
  async createConversation(input: {
    userId: string;
    tenantId: string;
    title?: string;
    sourceItemId?: string;
  }) {
    const id = crypto.randomUUID();
    await this.db.insert(conversations).values({
      id,
      userId: input.userId,
      tenantId: input.tenantId,
      title: input.title ?? "새 대화",
      sourceItemId: input.sourceItemId,
    });
    return { id, title: input.title ?? "새 대화" };
  }

  /** conversation 삭제 (소유권 확인 포함) */
  async deleteConversation(
    conversationId: string,
    userId: string,
    tenantId: string,
  ) {
    const conv = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
          eq(conversations.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!conv[0]) return null;

    await this.db
      .delete(conversations)
      .where(eq(conversations.id, conversationId));
    return { success: true };
  }

  /** conversation 목록 조회 (updatedAt desc) */
  async listConversations(userId: string, tenantId: string, limit = 50) {
    return this.db
      .select()
      .from(conversations)
      .where(
        tenantWhere(
          conversations,
          tenantId,
          eq(conversations.userId, userId),
        ),
      )
      .orderBy(desc(conversations.updatedAt))
      .limit(limit);
  }
}
