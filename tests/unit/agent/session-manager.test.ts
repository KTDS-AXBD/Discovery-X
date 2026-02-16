/**
 * SessionManager 테스트
 *
 * 테스트 대상:
 * - createSession: 새 세션 생성 + ID 반환
 * - endSession: endedAt + summary 저장
 * - getSession: 존재하는/없는 세션 조회
 * - listSessions: 최신순 정렬, limit
 * - updateTokenCount: 토큰 누적
 * - getActiveSession: 활성 세션 반환, 없으면 null
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { SessionManager } from "~/lib/agent/session-manager";
import { agentSessionsV2 } from "~/db/schema-v2";
import { eq } from "drizzle-orm";
import type { DB } from "~/db";

// ─── 헬퍼 ──────────────────────────────────────────────────────────────

function asDB(db: TestDB) {
  return db as unknown as DB;
}

// ─── 테스트 ─────────────────────────────────────────────────────────────

describe("SessionManager", () => {
  let db: TestDB;
  let sm: SessionManager;

  beforeEach(() => {
    db = createTestDb();
    sm = new SessionManager(asDB(db));
  });

  // ─── createSession ───────────────────────────────────────────────────

  describe("createSession", () => {
    it("새 세션을 생성하고 UUID를 반환한다", async () => {
      const id = await sm.createSession("user-1");

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("생성된 세션은 DB에 저장된다", async () => {
      const id = await sm.createSession("user-1");

      const [row] = await db
        .select()
        .from(agentSessionsV2)
        .where(eq(agentSessionsV2.id, id));

      expect(row).toBeDefined();
      expect(row.userId).toBe("user-1");
      expect(row.tokenCount).toBe(0);
      expect(row.tokenCost).toBe(0.0);
      expect(row.endedAt).toBeNull();
      expect(row.summary).toBeNull();
    });

    it("서로 다른 세션은 고유 ID를 갖는다", async () => {
      const id1 = await sm.createSession("user-1");
      const id2 = await sm.createSession("user-1");

      expect(id1).not.toBe(id2);
    });
  });

  // ─── endSession ──────────────────────────────────────────────────────

  describe("endSession", () => {
    it("endedAt을 설정한다", async () => {
      const id = await sm.createSession("user-1");

      await sm.endSession(id);

      const session = await sm.getSession(id);
      expect(session?.endedAt).toBeDefined();
      expect(session?.endedAt).not.toBeNull();
    });

    it("summary를 함께 저장한다", async () => {
      const id = await sm.createSession("user-1");

      await sm.endSession(id, "테스트 세션 요약");

      const session = await sm.getSession(id);
      expect(session?.summary).toBe("테스트 세션 요약");
      expect(session?.endedAt).not.toBeNull();
    });

    it("summary 없이 종료할 수 있다", async () => {
      const id = await sm.createSession("user-1");

      await sm.endSession(id);

      const session = await sm.getSession(id);
      expect(session?.summary).toBeNull();
      expect(session?.endedAt).not.toBeNull();
    });
  });

  // ─── getSession ──────────────────────────────────────────────────────

  describe("getSession", () => {
    it("존재하는 세션을 반환한다", async () => {
      const id = await sm.createSession("user-1");

      const session = await sm.getSession(id);

      expect(session).not.toBeNull();
      expect(session?.id).toBe(id);
      expect(session?.userId).toBe("user-1");
    });

    it("존재하지 않는 세션은 null을 반환한다", async () => {
      const session = await sm.getSession("non-existent-id");

      expect(session).toBeNull();
    });
  });

  // ─── listSessions ────────────────────────────────────────────────────

  describe("listSessions", () => {
    it("사용자의 세션을 최신순으로 반환한다", async () => {
      await sm.createSession("user-1");
      await sm.createSession("user-1");
      await sm.createSession("user-1");

      const sessions = await sm.listSessions("user-1");

      expect(sessions).toHaveLength(3);
      // 최신순 (started_at DESC) — 마지막 생성된 게 먼저
      for (let i = 0; i < sessions.length - 1; i++) {
        expect(sessions[i].startedAt.getTime()).toBeGreaterThanOrEqual(
          sessions[i + 1].startedAt.getTime(),
        );
      }
    });

    it("limit로 반환 개수를 제한한다", async () => {
      await sm.createSession("user-1");
      await sm.createSession("user-1");
      await sm.createSession("user-1");

      const sessions = await sm.listSessions("user-1", 2);

      expect(sessions).toHaveLength(2);
    });

    it("다른 사용자의 세션은 포함하지 않는다", async () => {
      await sm.createSession("user-1");
      await sm.createSession("user-2");

      const sessions = await sm.listSessions("user-1");

      expect(sessions).toHaveLength(1);
      expect(sessions[0].userId).toBe("user-1");
    });

    it("세션이 없으면 빈 배열을 반환한다", async () => {
      const sessions = await sm.listSessions("user-1");

      expect(sessions).toEqual([]);
    });
  });

  // ─── updateTokenCount ────────────────────────────────────────────────

  describe("updateTokenCount", () => {
    it("토큰을 누적한다", async () => {
      const id = await sm.createSession("user-1");

      await sm.updateTokenCount(id, 100, 200);

      const session = await sm.getSession(id);
      expect(session?.tokenCount).toBe(300);
    });

    it("여러 번 호출 시 누적 합산된다", async () => {
      const id = await sm.createSession("user-1");

      await sm.updateTokenCount(id, 100, 200);
      await sm.updateTokenCount(id, 50, 75);

      const session = await sm.getSession(id);
      expect(session?.tokenCount).toBe(425); // 300 + 125
    });

    it("0 토큰 업데이트는 값을 변경하지 않는다", async () => {
      const id = await sm.createSession("user-1");

      await sm.updateTokenCount(id, 0, 0);

      const session = await sm.getSession(id);
      expect(session?.tokenCount).toBe(0);
    });
  });

  // ─── getActiveSession ────────────────────────────────────────────────

  describe("getActiveSession", () => {
    it("활성(endedAt 없는) 세션을 반환한다", async () => {
      const id = await sm.createSession("user-1");

      const active = await sm.getActiveSession("user-1");

      expect(active).not.toBeNull();
      expect(active?.id).toBe(id);
      expect(active?.endedAt).toBeNull();
    });

    it("종료된 세션만 있으면 null을 반환한다", async () => {
      const id = await sm.createSession("user-1");
      await sm.endSession(id);

      const active = await sm.getActiveSession("user-1");

      expect(active).toBeNull();
    });

    it("활성 세션이 없으면 null을 반환한다", async () => {
      const active = await sm.getActiveSession("user-1");

      expect(active).toBeNull();
    });

    it("여러 활성 세션 중 가장 최근 것을 반환한다", async () => {
      await sm.createSession("user-1");
      const latestId = await sm.createSession("user-1");

      const active = await sm.getActiveSession("user-1");

      expect(active?.id).toBe(latestId);
    });

    it("다른 사용자의 활성 세션은 반환하지 않는다", async () => {
      await sm.createSession("user-2");

      const active = await sm.getActiveSession("user-1");

      expect(active).toBeNull();
    });
  });
});
