import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "tests/helpers/db";
import { buildConversationContext } from "~/features/chat/agent/context-builder";
import { conversations, messages, users, tenants, tenantMembers } from "~/db";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

let db: TestDB;
const TENANT_ID = "tenant-test-001";
const USER_ID = "user-ctx-001";
const CONV_ID = "conv-ctx-001";

let msgSeq = 0;
function msgId() {
  return `msg-ctx-${String(++msgSeq).padStart(3, "0")}`;
}

async function seedBasics() {
  await db.insert(users).values({ id: USER_ID, email: "ctx@test.com", name: "Tester", role: "ADMIN" });
  await db.insert(tenants).values({ id: TENANT_ID, name: "Test Tenant", slug: "test-tenant", plan: "free", status: "active", ownerUserId: USER_ID });
  await db.insert(tenantMembers).values({ id: "tm-ctx-001", tenantId: TENANT_ID, userId: USER_ID, role: "admin" });
  await db.insert(conversations).values({ id: CONV_ID, userId: USER_ID, tenantId: TENANT_ID, title: "Test Conv" });
}

async function insertMsg(role: string, content: string, toolName?: string, toolInput?: Record<string, unknown>) {
  await db.insert(messages).values({
    id: msgId(),
    conversationId: CONV_ID,
    role,
    content,
    toolName: toolName ?? null,
    toolInput: toolInput ?? null,
  });
}

beforeEach(() => {
  db = createTestDb();
  msgSeq = 0;
});

// ---------------------------------------------------------------------------
// buildConversationContext
// ---------------------------------------------------------------------------

describe("buildConversationContext", () => {
  it("빈 대화 → 빈 배열", async () => {
    await seedBasics();
    const result = await buildConversationContext(db as never, CONV_ID);
    expect(result).toEqual([]);
  });

  it("user/assistant 메시지 정상 변환", async () => {
    await seedBasics();
    await insertMsg("user", "안녕하세요");
    await insertMsg("assistant", "반갑습니다!");

    const result = await buildConversationContext(db as never, CONV_ID);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "user", content: "안녕하세요" });
    expect(result[1]).toEqual({ role: "assistant", content: "반갑습니다!" });
  });

  it("tool_use 메시지 그룹핑 (연속 tool_use → 단일 assistant)", async () => {
    await seedBasics();
    await insertMsg("user", "검색해줘");
    await insertMsg("tool_use", "검색 중...", "list_discoveries", { stage: "IDEA_CARD" });
    await insertMsg("tool_use", "추가 검색", "get_metrics", { type: "all" });

    const result = await buildConversationContext(db as never, CONV_ID);
    // user + 1 grouped assistant
    expect(result).toHaveLength(2);
    expect(result[1].role).toBe("assistant");
    expect(Array.isArray(result[1].content)).toBe(true);

    const blocks = result[1].content as Array<{ type: string; name?: string }>;
    const toolUseBlocks = blocks.filter((b) => b.type === "tool_use");
    expect(toolUseBlocks).toHaveLength(2);
    expect(toolUseBlocks[0].name).toBe("list_discoveries");
    expect(toolUseBlocks[1].name).toBe("get_metrics");
  });

  it("tool_result 메시지 그룹핑 (연속 tool_result → 단일 user)", async () => {
    await seedBasics();
    await insertMsg("user", "검색");
    await insertMsg("tool_use", "", "list_discoveries", { stage: "IDEA_CARD" });
    await insertMsg("tool_result", '{"discoveries":[]}', "list_discoveries");
    await insertMsg("tool_result", '{"metrics":{}}', "get_metrics");

    const result = await buildConversationContext(db as never, CONV_ID);
    // user + assistant(tool_use) + user(tool_results)
    expect(result).toHaveLength(3);
    expect(result[2].role).toBe("user");
    expect(Array.isArray(result[2].content)).toBe(true);

    const blocks = result[2].content as Array<{ type: string }>;
    expect(blocks.filter((b) => b.type === "tool_result")).toHaveLength(2);
  });

  it("orphaned tool_result 스킵", async () => {
    await seedBasics();
    // tool_result without preceding tool_use
    await insertMsg("tool_result", '{"data":"orphan"}', "some_tool");
    await insertMsg("user", "다음 질문");
    await insertMsg("assistant", "답변");

    const result = await buildConversationContext(db as never, CONV_ID);
    // orphaned tool_result skipped → user + assistant
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "user", content: "다음 질문" });
  });

  it("summaryThreshold 초과 시 요약 삽입", async () => {
    await seedBasics();
    // default config: summaryThreshold=30, keepFirst=5, keepLast=25
    // Need 30+ messages to trigger
    for (let i = 0; i < 35; i++) {
      if (i % 2 === 0) {
        await insertMsg("user", `질문 ${i}`);
      } else {
        await insertMsg("assistant", `답변 ${i}`);
      }
    }

    const result = await buildConversationContext(db as never, CONV_ID);
    // Should contain a summary message pair somewhere
    const summaryMsg = result.find(
      (m) => typeof m.content === "string" && m.content.includes("[컨텍스트 요약:")
    );
    expect(summaryMsg).toBeDefined();
    expect(summaryMsg!.role).toBe("user");

    // Summary acknowledgement
    const ackIdx = result.findIndex(
      (m) => typeof m.content === "string" && m.content.includes("이전 대화 내용을 참고하겠습니다")
    );
    expect(ackIdx).toBeGreaterThan(-1);
    expect(result[ackIdx].role).toBe("assistant");
  });

  it("요약 텍스트에 도구 호출 카운트 포함", async () => {
    await seedBasics();
    // Create messages where some in the "skipped" range are tool_use
    // keepFirst=5, so messages 5~(n-25) are skipped
    for (let i = 0; i < 5; i++) {
      await insertMsg(i % 2 === 0 ? "user" : "assistant", `초반 ${i}`);
    }
    // These will be in skipped range
    for (let i = 0; i < 10; i++) {
      await insertMsg("tool_use", `검색`, "list_discoveries", { q: `test${i}` });
    }
    // Fill enough to trigger threshold
    for (let i = 0; i < 25; i++) {
      await insertMsg(i % 2 === 0 ? "user" : "assistant", `후반 ${i}`);
    }

    const result = await buildConversationContext(db as never, CONV_ID);
    const summary = result.find(
      (m) => typeof m.content === "string" && m.content.includes("도구 호출:")
    );
    expect(summary).toBeDefined();
    expect(summary!.content).toContain("list_discoveries(10)");
  });

  it("요약 텍스트에 사용자 요청 포함", async () => {
    await seedBasics();
    // default config: maxMessages=40, summaryThreshold=30, keepFirst=5, keepLast=25
    // Insert exactly 40 messages so all are fetched
    // Skipped range: indices [5, 15) of the fetched 40
    // Put target user message near end of skipped range (index 12-13)
    for (let i = 0; i < 12; i++) {
      await insertMsg(i % 2 === 0 ? "user" : "assistant", `필러 ${i}`);
    }
    // Index 12: this falls in skipped range [5,15) and is among last 3 user msgs
    await insertMsg("user", "데이터를 분석해주세요");
    await insertMsg("assistant", "분석 결과입니다");
    // Fill remaining: 40 - 14 = 26
    for (let i = 0; i < 26; i++) {
      await insertMsg(i % 2 === 0 ? "user" : "assistant", `후반 ${i}`);
    }

    const result = await buildConversationContext(db as never, CONV_ID);
    const summary = result.find(
      (m) => typeof m.content === "string" && m.content.includes("사용자 요청:")
    );
    expect(summary).toBeDefined();
    expect(summary!.content).toContain("데이터를 분석해주세요");
  });

  it("maxMessages 제한 적용", async () => {
    await seedBasics();
    // default maxMessages = 40, insert 50
    for (let i = 0; i < 50; i++) {
      await insertMsg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`);
    }

    const result = await buildConversationContext(db as never, CONV_ID);
    // At most 40 source messages + summary pair if threshold triggered
    // With summary: keepFirst(5) + keepLast(25) + summary pair = 32
    // Without: <= 40
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.length).toBeGreaterThan(0);
  });
});
