/**
 * collab-worker 알림 서비스 테스트
 *
 * 대상: collab-worker/src/notification.ts
 * - sendNotification — D1 INSERT + 에러 처리
 * - notifySignalRouted — Topic 멤버별 알림 일괄 전송
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "collab-worker/src/types";
import { sendNotification, notifySignalRouted } from "collab-worker/src/notification";

// ─── D1 Mock ─────────────────────────────────────────────────────

function createMockDb() {
  const mockRun = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
  const mockAll = vi.fn().mockResolvedValue({ results: [] });
  const mockFirst = vi.fn().mockResolvedValue(null);
  const mockBind = vi.fn().mockReturnValue({
    first: mockFirst,
    all: mockAll,
    run: mockRun,
  });
  const mockPrepare = vi.fn().mockReturnValue({
    bind: mockBind,
    first: mockFirst,
    all: mockAll,
    run: mockRun,
  });
  return {
    prepare: mockPrepare,
    _bind: mockBind,
    _all: mockAll,
    _first: mockFirst,
    _run: mockRun,
  };
}

function createMockEnv(overrides?: Partial<Env>): Env {
  return {
    DB: createMockDb() as unknown as D1Database,
    ANTHROPIC_API_KEY: "test-key",
    OPENAI_API_KEY: "test-key",
    CRON_SECRET: "test-cron-secret",
    FF_PIPELINE_BRIDGE: "true",
    FF_MEMORY_LIFECYCLE: "true",
    ...overrides,
  };
}

function getDb(env: Env) {
  return env.DB as unknown as ReturnType<typeof createMockDb>;
}

// ─── sendNotification 테스트 ─────────────────────────────────────

describe("sendNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("D1 INSERT 호출 (user_id, type, title, body, metadata)", async () => {
    const env = createMockEnv();
    const db = getDb(env);

    await sendNotification(env, {
      userId: "user-1",
      type: "signal_routed",
      title: "새 시그널",
      body: "3개의 시그널이 라우팅되었습니다.",
      metadata: { topicId: "t1", signalCount: 3 },
    });

    expect(db.prepare).toHaveBeenCalledTimes(1);
    const sql = db.prepare.mock.calls[0][0] as string;
    expect(sql).toContain("INSERT INTO notification_queue");

    expect(db._bind).toHaveBeenCalledWith(
      "user-1",
      "signal_routed",
      "새 시그널",
      "3개의 시그널이 라우팅되었습니다.",
      JSON.stringify({ topicId: "t1", signalCount: 3 }),
    );
    expect(db._run).toHaveBeenCalledTimes(1);
  });

  it("metadata 없으면 null 바인딩", async () => {
    const env = createMockEnv();
    const db = getDb(env);

    await sendNotification(env, {
      userId: "user-1",
      type: "briefing_ready",
      title: "브리핑",
      body: "일간 브리핑이 준비되었습니다.",
    });

    expect(db._bind).toHaveBeenCalledWith(
      "user-1",
      "briefing_ready",
      "브리핑",
      "일간 브리핑이 준비되었습니다.",
      null,
    );
  });

  it("DB 에러 시 예외 안 던짐 (console.error 호출)", async () => {
    const env = createMockEnv();
    const db = getDb(env);
    db._run.mockRejectedValue(new Error("DB 에러"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // 예외가 던져지지 않아야 함
    await expect(
      sendNotification(env, {
        userId: "user-1",
        type: "signal_routed",
        title: "테스트",
        body: "테스트 알림",
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    const errorMsg = consoleSpy.mock.calls[0][0] as string;
    expect(errorMsg).toContain("전송 실패");
    expect(errorMsg).toContain("user-1");

    consoleSpy.mockRestore();
  });
});

// ─── notifySignalRouted 테스트 ─────────────────────────────────

describe("notifySignalRouted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Topic 멤버 2명 → sendNotification 2회 호출", async () => {
    const db = createMockDb();
    // topic_members 조회: owner, editor 2명
    db._all.mockResolvedValueOnce({
      results: [
        { user_id: "user-1" },
        { user_id: "user-2" },
      ],
    });

    const env = createMockEnv({ DB: db as unknown as D1Database });
    await notifySignalRouted(env, "topic-1", 5);

    // SELECT (멤버 조회) + INSERT × 2 (알림 전송)
    expect(db.prepare).toHaveBeenCalledTimes(3);

    // 첫 번째 prepare: SELECT
    const selectSql = db.prepare.mock.calls[0][0] as string;
    expect(selectSql).toContain("SELECT user_id FROM topic_members");
    expect(selectSql).toContain("owner");
    expect(selectSql).toContain("editor");

    // 두 번째, 세 번째 prepare: INSERT INTO notification_queue
    const insertSql1 = db.prepare.mock.calls[1][0] as string;
    const insertSql2 = db.prepare.mock.calls[2][0] as string;
    expect(insertSql1).toContain("INSERT INTO notification_queue");
    expect(insertSql2).toContain("INSERT INTO notification_queue");
  });

  it("Topic 멤버 0명 → sendNotification 0회 호출", async () => {
    const db = createMockDb();
    // topic_members 조회: 0명
    db._all.mockResolvedValueOnce({ results: [] });

    const env = createMockEnv({ DB: db as unknown as D1Database });
    await notifySignalRouted(env, "topic-1", 3);

    // SELECT만 호출 (INSERT 없음)
    expect(db.prepare).toHaveBeenCalledTimes(1);
    const sql = db.prepare.mock.calls[0][0] as string;
    expect(sql).toContain("SELECT user_id FROM topic_members");
  });

  it("viewer 역할은 알림 안 받음 (owner, editor만)", async () => {
    const db = createMockDb();
    // DB 쿼리에 role IN ('owner', 'editor') 조건이 있으므로
    // viewer는 조회 결과에 포함되지 않음
    db._all.mockResolvedValueOnce({
      results: [{ user_id: "owner-1" }], // viewer는 결과에 없음
    });

    const env = createMockEnv({ DB: db as unknown as D1Database });
    await notifySignalRouted(env, "topic-1", 2);

    // SELECT의 bind에 topic_id가 전달되었는지 확인
    expect(db._bind).toHaveBeenCalled();
    const firstBindArgs = db._bind.mock.calls[0];
    expect(firstBindArgs[0]).toBe("topic-1");

    // SQL에 role 필터 확인
    const selectSql = db.prepare.mock.calls[0][0] as string;
    expect(selectSql).toContain("role IN ('owner', 'editor')");

    // owner-1에게만 알림 (viewer 제외)
    // prepare: SELECT(1) + INSERT(1) = 2
    expect(db.prepare).toHaveBeenCalledTimes(2);
  });
});
