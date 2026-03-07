/**
 * Agent 인사이트 추출 테스트
 *
 * 테스트 대상:
 * - findDiscoveryIdFromConversation: tool_use 메시지에서 discoveryId 추출
 * - extractAndSaveInsights: LLM 응답 → Evidence 후보 저장
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import {
  findDiscoveryIdFromConversation,
  extractAndSaveInsights,
} from "~/features/chat/agent/executor-stream";
import {
  users,
  discoveries,
  conversations,
  messages,
  evidence,
} from "~/db";
import { eq } from "drizzle-orm";
import type { DB } from "~/db";

// ─── callLLM mock ────────────────────────────────────────────────────────

vi.mock("~/lib/ai", () => ({
  callLLM: vi.fn(),
  callLLMStream: vi.fn(),
  parseSSEStream: vi.fn(),
}));

import { callLLM } from "~/lib/ai";
const mockCallLLM = vi.mocked(callLLM);

// ─── 헬퍼 ──────────────────────────────────────────────────────────────

function asDB(db: TestDB) {
  return db as unknown as DB;
}

const TEST_USER_ID = "test-user-1";
const SYSTEM_AGENT_ID = "system-agent";
const TEST_DISCOVERY_ID = "disc-1";
const TEST_CONV_ID = "conv-1";

async function seedBaseData(db: TestDB) {
  // system-agent는 마이그레이션 0005에서 이미 생성됨
  await db.insert(users).values({ id: TEST_USER_ID, email: "test@test.com", name: "Test User" });

  await db.insert(discoveries).values({
    id: TEST_DISCOVERY_ID,
    title: "테스트 디스커버리",
    seedSummary: "요약",
    sourceType: "article",
    ownerId: TEST_USER_ID,
  });

  await db.insert(conversations).values({
    id: TEST_CONV_ID,
    userId: TEST_USER_ID,
  });
}

// ─── 테스트 ─────────────────────────────────────────────────────────────

describe("findDiscoveryIdFromConversation", () => {
  let db: TestDB;

  beforeEach(async () => {
    db = createTestDb();
    await seedBaseData(db);
  });

  it("tool_use 메시지의 toolInput에서 discoveryId를 추출한다", async () => {
    await db.insert(messages).values({
      id: "msg-1",
      conversationId: TEST_CONV_ID,
      role: "tool_use",
      content: "",
      toolName: "get_discovery",
      toolInput: { discoveryId: TEST_DISCOVERY_ID, action: "read" },
    });

    const result = await findDiscoveryIdFromConversation(asDB(db), TEST_CONV_ID);
    expect(result).toBe(TEST_DISCOVERY_ID);
  });

  it("discoveryId가 없는 tool_use 메시지만 있으면 null을 반환한다", async () => {
    await db.insert(messages).values({
      id: "msg-2",
      conversationId: TEST_CONV_ID,
      role: "tool_use",
      content: "",
      toolName: "search",
      toolInput: { query: "test" },
    });

    const result = await findDiscoveryIdFromConversation(asDB(db), TEST_CONV_ID);
    expect(result).toBeNull();
  });

  it("tool_use 메시지가 없으면 null을 반환한다", async () => {
    await db.insert(messages).values({
      id: "msg-3",
      conversationId: TEST_CONV_ID,
      role: "user",
      content: "안녕하세요",
    });

    const result = await findDiscoveryIdFromConversation(asDB(db), TEST_CONV_ID);
    expect(result).toBeNull();
  });

  it("여러 tool_use 중 첫 번째 discoveryId를 반환한다", async () => {
    await db.insert(messages).values([
      {
        id: "msg-4",
        conversationId: TEST_CONV_ID,
        role: "tool_use",
        content: "",
        toolName: "search",
        toolInput: { query: "test" },
      },
      {
        id: "msg-5",
        conversationId: TEST_CONV_ID,
        role: "tool_use",
        content: "",
        toolName: "update_discovery",
        toolInput: { discoveryId: "disc-first" },
      },
    ]);

    const result = await findDiscoveryIdFromConversation(asDB(db), TEST_CONV_ID);
    expect(result).toBe("disc-first");
  });
});

describe("extractAndSaveInsights", () => {
  let db: TestDB;

  beforeEach(async () => {
    db = createTestDb();
    await seedBaseData(db);
    vi.clearAllMocks();
  });

  it("LLM 응답이 정상이면 Evidence 후보가 저장된다", async () => {
    mockCallLLM.mockResolvedValueOnce({
      id: "msg-1",
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            insights: [
              { content: "국내 AI 시장 규모가 2025년 10조원을 돌파할 전망이다", type: "DATA", strength: "B" },
              { content: "내부 고객 만족도 조사에서 AI 도입 의향이 78%로 나타났다", type: "USER", strength: "C" },
            ],
          }),
        },
      ],
      model: "claude-haiku-4-5-20251001",
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    await extractAndSaveInsights(
      asDB(db),
      TEST_CONV_ID,
      TEST_DISCOVERY_ID,
      "대화 내용 텍스트",
      { ANTHROPIC_API_KEY: "test-key" },
    );

    const rows = await db
      .select()
      .from(evidence)
      .where(eq(evidence.discoveryId, TEST_DISCOVERY_ID));

    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe("DATA");
    expect(rows[0].strength).toBe("B");
    expect(rows[0].reliabilityLabel).toBe("hypothesis");
    expect(rows[0].createdById).toBe(SYSTEM_AGENT_ID);
    expect(rows[1].type).toBe("USER");
  });

  it("빈 insights 배열이면 Evidence가 생성되지 않는다", async () => {
    mockCallLLM.mockResolvedValueOnce({
      id: "msg-1",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: JSON.stringify({ insights: [] }) }],
      model: "claude-haiku-4-5-20251001",
      stop_reason: "end_turn",
      usage: { input_tokens: 50, output_tokens: 10 },
    });

    await extractAndSaveInsights(
      asDB(db),
      TEST_CONV_ID,
      TEST_DISCOVERY_ID,
      "대화 내용",
      { ANTHROPIC_API_KEY: "test-key" },
    );

    const rows = await db.select().from(evidence);
    expect(rows).toHaveLength(0);
  });

  it("LLM 응답이 유효하지 않은 JSON이면 무시한다", async () => {
    mockCallLLM.mockResolvedValueOnce({
      id: "msg-1",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "이것은 JSON이 아닙니다" }],
      model: "claude-haiku-4-5-20251001",
      stop_reason: "end_turn",
      usage: { input_tokens: 50, output_tokens: 10 },
    });

    await extractAndSaveInsights(
      asDB(db),
      TEST_CONV_ID,
      TEST_DISCOVERY_ID,
      "대화 내용",
      { ANTHROPIC_API_KEY: "test-key" },
    );

    const rows = await db.select().from(evidence);
    expect(rows).toHaveLength(0);
  });

  it("최대 3개까지만 Evidence를 생성한다", async () => {
    mockCallLLM.mockResolvedValueOnce({
      id: "msg-1",
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            insights: [
              { content: "인사이트 1 — 충분히 긴 내용입니다", type: "DATA", strength: "B" },
              { content: "인사이트 2 — 충분히 긴 내용입니다", type: "USER", strength: "C" },
              { content: "인사이트 3 — 충분히 긴 내용입니다", type: "ASSUMPTION", strength: "D" },
              { content: "인사이트 4 — 이건 무시되어야 합니다", type: "REF", strength: "B" },
            ],
          }),
        },
      ],
      model: "claude-haiku-4-5-20251001",
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 80 },
    });

    await extractAndSaveInsights(
      asDB(db),
      TEST_CONV_ID,
      TEST_DISCOVERY_ID,
      "대화 내용",
      { ANTHROPIC_API_KEY: "test-key" },
    );

    const rows = await db.select().from(evidence);
    expect(rows).toHaveLength(3);
  });

  it("10자 미만의 짧은 인사이트는 무시한다", async () => {
    mockCallLLM.mockResolvedValueOnce({
      id: "msg-1",
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            insights: [
              { content: "짧음", type: "DATA", strength: "B" },
              { content: "이건 충분히 긴 인사이트 내용입니다", type: "USER", strength: "C" },
            ],
          }),
        },
      ],
      model: "claude-haiku-4-5-20251001",
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    await extractAndSaveInsights(
      asDB(db),
      TEST_CONV_ID,
      TEST_DISCOVERY_ID,
      "대화 내용",
      { ANTHROPIC_API_KEY: "test-key" },
    );

    const rows = await db.select().from(evidence);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("이건 충분히 긴 인사이트 내용입니다");
  });

  it("callLLM에 올바른 파라미터를 전달한다", async () => {
    mockCallLLM.mockResolvedValueOnce({
      id: "msg-1",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: JSON.stringify({ insights: [] }) }],
      model: "claude-haiku-4-5-20251001",
      stop_reason: "end_turn",
      usage: { input_tokens: 50, output_tokens: 10 },
    });

    const env = { ANTHROPIC_API_KEY: "my-key" };
    await extractAndSaveInsights(
      asDB(db),
      TEST_CONV_ID,
      TEST_DISCOVERY_ID,
      "대화 내용 텍스트",
      env,
    );

    expect(mockCallLLM).toHaveBeenCalledOnce();
    const [apiKey, request, ctx] = mockCallLLM.mock.calls[0];
    expect(apiKey).toBe("my-key");
    expect(request.model).toBe("claude-haiku-4-5-20251001");
    expect(request.temperature).toBe(0.1);
    expect(request.max_tokens).toBe(500);
    expect(ctx).toEqual({ env });
  });
});
