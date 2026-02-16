import { eq, and } from "drizzle-orm";
import type { DB } from "~/db";
import { topics, topicMembers } from "~/db/schema-v2";
import type { Topic } from "~/db/schema-v2";
import { users } from "~/db/schema";

// ============================================================================
// Types
// ============================================================================

interface CreateTopicInput {
  teamId: string;
  name: string;
  description?: string;
  createdBy: string;
}

interface UpdateTopicInput {
  name?: string;
  description?: string;
}

interface TopicMemberWithUser {
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: Date;
}

interface TopicDetail {
  topic: Topic;
  members: TopicMemberWithUser[];
}

type TopicRole = "owner" | "editor" | "viewer";

// ============================================================================
// Service
// ============================================================================

export class TopicService {
  constructor(private db: DB) {}

  /**
   * Topic 목록 조회
   */
  async list(
    teamId: string,
    opts?: { status?: string; limit?: number },
  ): Promise<Topic[]> {
    const conditions = [eq(topics.teamId, teamId)];
    if (opts?.status) {
      conditions.push(eq(topics.status, opts.status));
    }

    const result = await this.db
      .select()
      .from(topics)
      .where(and(...conditions))
      .limit(opts?.limit ?? 50);

    return result;
  }

  /**
   * Topic 상세 조회 (멤버 포함)
   */
  async getById(id: string): Promise<TopicDetail | null> {
    const topic = await this.db.query.topics.findFirst({
      where: eq(topics.id, id),
    });
    if (!topic) return null;

    const members = await this.getMembers(id);
    return { topic, members };
  }

  /**
   * Topic 생성 — 생성자를 owner로 자동 추가
   */
  async create(data: CreateTopicInput): Promise<Topic> {
    const id = crypto.randomUUID();

    await this.db.insert(topics).values({
      id,
      teamId: data.teamId,
      name: data.name,
      description: data.description ?? null,
      createdBy: data.createdBy,
    });

    // 생성자를 owner로 자동 추가
    await this.db.insert(topicMembers).values({
      topicId: id,
      userId: data.createdBy,
      role: "owner",
    });

    const created = await this.db.query.topics.findFirst({
      where: eq(topics.id, id),
    });
    return created!;
  }

  /**
   * Topic 수정 (name, description)
   */
  async update(id: string, data: UpdateTopicInput): Promise<Topic> {
    const existing = await this.db.query.topics.findFirst({
      where: eq(topics.id, id),
    });
    if (!existing) {
      throw new Error(`Topic을 찾을 수 없습니다: ${id}`);
    }

    await this.db
      .update(topics)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        updatedAt: new Date(),
      })
      .where(eq(topics.id, id));

    const updated = await this.db.query.topics.findFirst({
      where: eq(topics.id, id),
    });
    return updated!;
  }

  /**
   * Topic 아카이브 (status → 'archived')
   */
  async archive(id: string): Promise<void> {
    const existing = await this.db.query.topics.findFirst({
      where: eq(topics.id, id),
    });
    if (!existing) {
      throw new Error(`Topic을 찾을 수 없습니다: ${id}`);
    }

    await this.db
      .update(topics)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(topics.id, id));
  }

  // ============================================================================
  // 멤버 관리
  // ============================================================================

  /**
   * 멤버 추가
   */
  async addMember(
    topicId: string,
    userId: string,
    role: TopicRole = "editor",
  ): Promise<void> {
    await this.db.insert(topicMembers).values({
      topicId,
      userId,
      role,
    });
  }

  /**
   * 멤버 제거
   */
  async removeMember(topicId: string, userId: string): Promise<void> {
    await this.db
      .delete(topicMembers)
      .where(
        and(
          eq(topicMembers.topicId, topicId),
          eq(topicMembers.userId, userId),
        ),
      );
  }

  /**
   * 멤버 역할 변경
   */
  async updateMemberRole(
    topicId: string,
    userId: string,
    role: TopicRole,
  ): Promise<void> {
    await this.db
      .update(topicMembers)
      .set({ role })
      .where(
        and(
          eq(topicMembers.topicId, topicId),
          eq(topicMembers.userId, userId),
        ),
      );
  }

  /**
   * 멤버 목록 조회 (users JOIN)
   */
  async getMembers(topicId: string): Promise<TopicMemberWithUser[]> {
    const rows = await this.db
      .select({
        userId: topicMembers.userId,
        name: users.name,
        email: users.email,
        role: topicMembers.role,
        joinedAt: topicMembers.joinedAt,
      })
      .from(topicMembers)
      .innerJoin(users, eq(topicMembers.userId, users.id))
      .where(eq(topicMembers.topicId, topicId));

    return rows;
  }
}
