import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../helpers/db";
import { users, conversations } from "~/db";
import { agentMemoryV2 } from "~/db/schema-v2";
import { tokenUsageLogs } from "~/db/token-usage-schema";
import {
  TokenBudgetManager,
  USER_MEMORY_BUDGET,
  MONTHLY_LLM_BUDGET,
} from "~/lib/cost/token-budget";

describe("TokenBudgetManager", () => {
  let db: TestDB;
  let manager: TokenBudgetManager;

  beforeEach(() => {
    db = createTestDb();
    manager = new TokenBudgetManager(db as never);

    // 기본 사용자 시드
    db.insert(users)
      .values({ id: "u1", email: "u1@test.com", name: "User 1" })
      .run();
  });

  // ─── getMemoryTokenCount ──────────────────────────────────────────

  it("활성 메모리 토큰 합계를 계산한다", async () => {
    db.insert(agentMemoryV2)
      .values([
        {
          userId: "u1",
          memoryType: "daily_log",
          content: "test1",
          tokenCount: 500,
          importance: 0.5,
        },
        {
          userId: "u1",
          memoryType: "long_term",
          content: "test2",
          tokenCount: 300,
          importance: 0.8,
        },
      ])
      .run();

    const count = await manager.getMemoryTokenCount("u1");
    expect(count).toBe(800);
  });

  it("아카이브된 레코드는 합계에서 제외한다", async () => {
    db.insert(agentMemoryV2)
      .values([
        {
          userId: "u1",
          memoryType: "daily_log",
          content: "active",
          tokenCount: 500,
          importance: 0.5,
        },
        {
          userId: "u1",
          memoryType: "daily_log",
          content: "archived",
          tokenCount: 300,
          importance: 0.3,
          archivedAt: new Date(),
        },
      ])
      .run();

    const count = await manager.getMemoryTokenCount("u1");
    expect(count).toBe(500);
  });

  it("데이터 없으면 0을 반환한다", async () => {
    const count = await manager.getMemoryTokenCount("u1");
    expect(count).toBe(0);
  });

  // ─── getMonthlyUsage (conversations JOIN) ─────────────────────────

  it("이번 달 LLM 사용량을 conversations JOIN으로 계산한다", async () => {
    db.insert(conversations)
      .values({ id: "c1", userId: "u1", title: "test conv" })
      .run();

    db.insert(tokenUsageLogs)
      .values({
        id: "tul1",
        conversationId: "c1",
        model: "claude-3",
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      })
      .run();

    const usage = await manager.getMonthlyUsage("u1");
    expect(usage).toBe(1500);
  });

  it("다른 사용자의 토큰은 합산하지 않는다", async () => {
    db.insert(users)
      .values({ id: "u2", email: "u2@test.com", name: "User 2" })
      .run();

    db.insert(conversations)
      .values([
        { id: "c1", userId: "u1", title: "conv1" },
        { id: "c2", userId: "u2", title: "conv2" },
      ])
      .run();

    db.insert(tokenUsageLogs)
      .values([
        {
          id: "tul1",
          conversationId: "c1",
          model: "claude-3",
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
        },
        {
          id: "tul2",
          conversationId: "c2",
          model: "claude-3",
          inputTokens: 2000,
          outputTokens: 1000,
          totalTokens: 3000,
        },
      ])
      .run();

    const usage = await manager.getMonthlyUsage("u1");
    expect(usage).toBe(1500);
  });

  // ─── checkBudget ──────────────────────────────────────────────────

  it("예산 내이면 memoryOk=true, monthlyOk=true를 반환한다", async () => {
    const status = await manager.checkBudget("u1");

    expect(status.memoryOk).toBe(true);
    expect(status.monthlyOk).toBe(true);
    expect(status.memoryUsed).toBe(0);
    expect(status.monthlyUsed).toBe(0);
    expect(status.memoryLimit).toBe(USER_MEMORY_BUDGET);
    expect(status.monthlyLimit).toBe(MONTHLY_LLM_BUDGET);
    expect(status.resetDate).toBeInstanceOf(Date);
  });

  // ─── isLLMCallAllowed ─────────────────────────────────────────────

  it("예상 토큰 포함 시 한도 초과를 판단한다", async () => {
    const allowed = await manager.isLLMCallAllowed("u1", 1_000_000);
    expect(allowed).toBe(true);

    const denied = await manager.isLLMCallAllowed("u1", 3_000_000);
    expect(denied).toBe(false);
  });

  // ─── isOverBudget ─────────────────────────────────────────────────

  it("예산 내이면 false를 반환한다", async () => {
    const over = await manager.isOverBudget("u1");
    expect(over).toBe(false);
  });

  // ─── 상수 export 확인 ─────────────────────────────────────────────

  it("예산 상수가 올바르게 export된다", () => {
    expect(USER_MEMORY_BUDGET).toBe(100_000);
    expect(MONTHLY_LLM_BUDGET).toBe(2_000_000);
  });
});
