/**
 * executor-stream 스트리밍 코어 단위 테스트
 *
 * 테스트 대상:
 * - createAgentStreamResponse: SSE 스트림 생성 + 도구 호출 루프 + 인용/라벨
 * - 내부: consumeClaudeStream, sendToolResults, flushSessionMemory
 *
 * 이미 커버됨 (agent-insight-extraction.test.ts):
 * - findDiscoveryIdFromConversation, extractAndSaveInsights
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import type { DB } from "~/db";
import { users, conversations } from "~/db";

// ─── Mocks ──────────────────────────────────────────────────────────────

vi.mock("~/lib/ai", async () => {
  const actual = await vi.importActual<typeof import("~/lib/ai")>("~/lib/ai");
  return {
    callLLM: vi.fn(),
    callLLMStream: vi.fn(),
    parseSSEStream: vi.fn(),
    BudgetBlockedError: actual.BudgetBlockedError,
  };
});

vi.mock("~/features/chat/agent/context-builder", () => ({
  buildConversationContext: vi.fn().mockResolvedValue([
    { role: "user", content: "hello" },
  ]),
}));

vi.mock("~/features/chat/agent/system-prompt", () => ({
  buildSystemPrompt: vi.fn().mockReturnValue("default system prompt"),
  buildIdeaSystemPrompt: vi.fn().mockReturnValue("idea system prompt"),
}));

vi.mock("~/features/chat/agent/tool-registry", () => ({
  getToolsForAutonomyLevel: vi.fn().mockReturnValue([]),
  IDEA_TOOLS: [{ name: "idea_tool", description: "idea", input_schema: { type: "object", properties: {} } }],
}));

vi.mock("~/features/chat/agent/agent-utils", () => ({
  sendBudgetWarning: vi.fn(),
  addSummaryHeader: vi.fn((text: string) => text),
}));

const mockBuildPrompt = vi.fn().mockResolvedValue({ systemPrompt: "soul prompt" });
vi.mock("~/features/chat/agent/soul-engine", () => ({
  SoulEngine: class { buildPrompt = mockBuildPrompt; },
}));

const mockUpdateTokenCount = vi.fn();
vi.mock("~/features/chat/agent/session-manager", () => ({
  SessionManager: class { constructor(_db: unknown) {} updateTokenCount = mockUpdateTokenCount; },
}));

const mockAddDailyLog = vi.fn();
vi.mock("~/features/chat/agent/memory-lifecycle", () => ({
  MemoryLifecycle: class { constructor(_db: unknown) {} addDailyLog = mockAddDailyLog; },
}));

vi.mock("~/features/chat/agent/agent-pipeline", () => ({
  prepareAgentPipeline: vi.fn().mockResolvedValue({
    modelId: "claude-sonnet-4-20250514",
    autonomyLevel: 1,
    agentCfg: {},
    sourceContext: null,
  }),
  processToolBlocks: vi.fn().mockResolvedValue([]),
  saveAndFinalize: vi.fn(),
  MAX_TOOL_ROUNDS: 5,
}));

vi.mock("~/features/chat/agent/citation-builder", () => ({
  extractCitationsFromToolResults: vi.fn().mockReturnValue([]),
  buildCitationBlock: vi.fn().mockReturnValue(null),
}));

import { callLLMStream, parseSSEStream } from "~/lib/ai";
import { buildSystemPrompt, buildIdeaSystemPrompt } from "~/features/chat/agent/system-prompt";
import { SoulEngine } from "~/features/chat/agent/soul-engine";
import { prepareAgentPipeline, processToolBlocks, saveAndFinalize } from "~/features/chat/agent/agent-pipeline";
import { extractCitationsFromToolResults, buildCitationBlock } from "~/features/chat/agent/citation-builder";
import { createAgentStreamResponse } from "~/features/chat/agent/executor-stream";

const mockCallLLMStream = vi.mocked(callLLMStream);
const mockParseSSE = vi.mocked(parseSSEStream);
const mockPrepare = vi.mocked(prepareAgentPipeline);
const mockProcessTools = vi.mocked(processToolBlocks);
const mockSave = vi.mocked(saveAndFinalize);
const mockExtractCitations = vi.mocked(extractCitationsFromToolResults);
const mockBuildCitation = vi.mocked(buildCitationBlock);

// ─── Helpers ────────────────────────────────────────────────────────────

function asDB(db: TestDB) {
  return db as unknown as DB;
}

/** parseSSEStream 모킹: async iterable 반환 */
function mockSSEEvents(events: Array<Record<string, unknown>>) {
  async function* gen() {
    for (const e of events) yield e;
  }
  mockParseSSE.mockReturnValue(gen() as unknown as ReturnType<typeof parseSSEStream>);
  // callLLMStream은 빈 ReadableStream 반환 (parseSSEStream이 소비)
  mockCallLLMStream.mockResolvedValue(
    new ReadableStream({ start(c) { c.close(); } }),
  );
}

/** ReadableStream<Uint8Array>을 소비하여 SSE data 이벤트 파싱 */
async function consumeStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Array<Record<string, unknown>>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const events: Array<Record<string, unknown>> = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (part.startsWith("data: ")) {
        try { events.push(JSON.parse(part.slice(6))); } catch { /* skip */ }
      }
    }
  }
  if (buffer.startsWith("data: ")) {
    try { events.push(JSON.parse(buffer.slice(6))); } catch { /* skip */ }
  }
  return events;
}

// ─── 텍스트만 반환하는 기본 SSE 이벤트 시퀀스 ─────────────────────────

function textOnlySSEEvents(text = "안녕하세요") {
  return [
    { type: "message_start", message: { usage: { input_tokens: 10 } } },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    },
    { type: "content_block_delta", delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
  ];
}

// ─── Test Setup ─────────────────────────────────────────────────────────

const USER_ID = "test-user-es";
const CONV_ID = "conv-es-1";

let db: TestDB;

beforeEach(async () => {
  db = createTestDb();
  vi.clearAllMocks();

  await db.insert(users).values({ id: USER_ID, email: "es@test.com", name: "ES User" });
  await db.insert(conversations).values({ id: CONV_ID, userId: USER_ID });

  // 기본 모킹 리셋
  mockPrepare.mockResolvedValue({
    modelId: "claude-sonnet-4-20250514",
    autonomyLevel: 1,
    agentCfg: {} as never,
    sourceContext: null,
  });
  mockSave.mockResolvedValue(undefined);
  mockProcessTools.mockResolvedValue([]);
  mockExtractCitations.mockReturnValue([]);
  mockBuildCitation.mockReturnValue(null as unknown as string);
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe("createAgentStreamResponse", () => {
  describe("텍스트 응답 (도구 미사용)", () => {
    it("text_delta + done 이벤트를 올바른 순서로 emit한다", async () => {
      mockSSEEvents(textOnlySSEEvents("Hello"));

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "hi");
      const events = await consumeStream(stream);

      const types = events.map((e) => e.type);
      expect(types).toContain("text_delta");
      expect(types).toContain("done");
      expect(types.indexOf("text_delta")).toBeLessThan(types.indexOf("done"));
    });

    it("텍스트 내용이 text_delta에 포함된다", async () => {
      mockSSEEvents(textOnlySSEEvents("테스트 응답"));

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "hi");
      const events = await consumeStream(stream);

      const textDeltas = events.filter((e) => e.type === "text_delta");
      expect(textDeltas.length).toBeGreaterThanOrEqual(1);
      expect(textDeltas.some((e) => e.content === "테스트 응답")).toBe(true);
    });

    it("done 이벤트에 tokensUsed가 포함된다", async () => {
      mockSSEEvents(textOnlySSEEvents("Hi"));

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "hi");
      const events = await consumeStream(stream);

      const done = events.find((e) => e.type === "done");
      expect(done).toBeDefined();
      expect(done!.tokensUsed).toEqual({ input: 10, output: 5 });
    });

    it("saveAndFinalize가 호출된다", async () => {
      mockSSEEvents(textOnlySSEEvents("응답"));

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "hi");
      await consumeStream(stream);

      expect(mockSave).toHaveBeenCalledOnce();
      expect(mockSave.mock.calls[0][1]).toBe(CONV_ID);
    });
  });

  describe("일반 지식 기반 답변 라벨", () => {
    it("도구 미사용 + citation 없으면 라벨이 추가된다", async () => {
      mockSSEEvents(textOnlySSEEvents("일반 답변"));

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "hi");
      const events = await consumeStream(stream);

      const textDeltas = events.filter((e) => e.type === "text_delta");
      const hasLabel = textDeltas.some(
        (e) => typeof e.content === "string" && e.content.includes("일반 지식 기반 답변"),
      );
      expect(hasLabel).toBe(true);
    });

    it("이미 라벨이 포함된 텍스트면 중복 추가하지 않는다", async () => {
      mockSSEEvents([
        { type: "message_start", message: { usage: { input_tokens: 10 } } },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "답변 일반 지식 기반 답변" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
      ]);

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "hi");
      const events = await consumeStream(stream);

      const labelEvents = events.filter(
        (e) => e.type === "text_delta" && typeof e.content === "string" && e.content.includes("일반 지식 기반 답변"),
      );
      // 원래 텍스트에 1개만 (추가 라벨 없음)
      expect(labelEvents).toHaveLength(1);
    });
  });

  describe("인용 블록", () => {
    it("도구 결과에서 citation이 있으면 citation 블록을 추가한다", async () => {
      // 1라운드: tool_use → 2라운드: text
      const toolEvents = [
        { type: "message_start", message: { usage: { input_tokens: 10 } } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "get_discovery" } },
        { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: '{"id":"d1"}' } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5 } },
      ];
      const textEvents = textOnlySSEEvents("분석 결과");

      // 첫 호출: tool_use, 두 번째: text
      let callCount = 0;
      mockCallLLMStream.mockImplementation(async () => new ReadableStream({ start(c) { c.close(); } }));
      mockParseSSE
        .mockReturnValueOnce((async function* () { for (const e of toolEvents) yield e; })() as never)
        .mockReturnValueOnce((async function* () { for (const e of textEvents) yield e; })() as never);

      mockProcessTools.mockResolvedValue([
        { name: "get_discovery", input: { id: "d1" }, result: '{"title":"Test"}' },
      ]);
      mockExtractCitations.mockReturnValue([{ entity: "Test", type: "discovery" }] as never);
      mockBuildCitation.mockReturnValue("\n\n📎 참조: Test (discovery)");

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "분석해줘");
      const events = await consumeStream(stream);

      const citationEvent = events.find(
        (e) => e.type === "text_delta" && typeof e.content === "string" && e.content.includes("📎 참조"),
      );
      expect(citationEvent).toBeDefined();
    });
  });

  describe("도구 호출 루프", () => {
    it("도구 호출 시 tool_start + tool_call 이벤트를 emit한다", async () => {
      const toolEvents = [
        { type: "message_start", message: { usage: { input_tokens: 10 } } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "list_discoveries" } },
        { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "{}" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5 } },
      ];
      const textEvents = textOnlySSEEvents("결과입니다");

      mockCallLLMStream.mockResolvedValue(new ReadableStream({ start(c) { c.close(); } }));
      mockParseSSE
        .mockReturnValueOnce((async function* () { for (const e of toolEvents) yield e; })() as never)
        .mockReturnValueOnce((async function* () { for (const e of textEvents) yield e; })() as never);

      mockProcessTools.mockResolvedValue([
        { name: "list_discoveries", input: {}, result: '[]' },
      ]);

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "목록");
      const events = await consumeStream(stream);

      expect(events.some((e) => e.type === "tool_start")).toBe(true);
      expect(events.some((e) => e.type === "tool_call" && e.name === "list_discoveries")).toBe(true);
    });

    it("MAX_TOOL_ROUNDS 도달 시 제한 메시지를 출력한다", async () => {
      const toolEvents = [
        { type: "message_start", message: { usage: { input_tokens: 5 } } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "test_tool" } },
        { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "{}" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 3 } },
      ];

      // 5번 반복 (MAX_TOOL_ROUNDS=5)
      mockCallLLMStream.mockResolvedValue(new ReadableStream({ start(c) { c.close(); } }));
      for (let i = 0; i < 5; i++) {
        mockParseSSE.mockReturnValueOnce(
          (async function* () { for (const e of toolEvents) yield e; })() as never,
        );
      }
      mockProcessTools.mockResolvedValue([
        { name: "test_tool", input: {}, result: '"ok"' },
      ]);

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "loop");
      const events = await consumeStream(stream);

      const limitMsg = events.find(
        (e) => e.type === "text_delta" && typeof e.content === "string" && e.content.includes("도구 호출 제한"),
      );
      expect(limitMsg).toBeDefined();
    });
  });

  describe("purpose 분기", () => {
    it("analysis purpose: buildIdeaSystemPrompt 사용", async () => {
      mockSSEEvents(textOnlySSEEvents("아이디어 응답"));

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "hi", undefined, "analysis");
      await consumeStream(stream);

      expect(vi.mocked(buildIdeaSystemPrompt)).toHaveBeenCalled();
      expect(vi.mocked(buildSystemPrompt)).not.toHaveBeenCalled();
    });

    it("graph projection 모드: SoulEngine.buildPrompt 호출", async () => {
      mockSSEEvents(textOnlySSEEvents("soul 응답"));

      const stream = createAgentStreamResponse(
        asDB(db), "key", CONV_ID, "hi", undefined, "chat",
        { env: { ANTHROPIC_API_KEY: "k" }, sessionId: "s1", userId: "u1" },
      );
      await consumeStream(stream);

      expect(mockBuildPrompt).toHaveBeenCalled();
    });

    it("기본 purpose: buildSystemPrompt 사용", async () => {
      mockSSEEvents(textOnlySSEEvents("기본 응답"));

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "hi");
      await consumeStream(stream);

      expect(vi.mocked(buildSystemPrompt)).toHaveBeenCalled();
    });
  });

  describe("세션 메모리 flush", () => {
    it("sessionId가 있으면 SessionManager.updateTokenCount 호출", async () => {
      mockSSEEvents(textOnlySSEEvents("응답"));

      const stream = createAgentStreamResponse(
        asDB(db), "key", CONV_ID, "hi", undefined, "chat",
        { sessionId: "sess-1", env: { ANTHROPIC_API_KEY: "k" }, userId: "u1" },
      );
      await consumeStream(stream);

      expect(mockUpdateTokenCount).toHaveBeenCalledWith("sess-1", 10, 5);
    });

    it("userId + env가 있으면 MemoryLifecycle.addDailyLog 호출", async () => {
      mockSSEEvents(textOnlySSEEvents("응답"));

      const stream = createAgentStreamResponse(
        asDB(db), "key", CONV_ID, "hi", undefined, "chat",
        { userId: "u1", env: { ANTHROPIC_API_KEY: "k" }, sessionId: "s1" },
      );
      await consumeStream(stream);

      expect(mockAddDailyLog).toHaveBeenCalledWith("u1", expect.any(String), "conversation");
    });
  });

  describe("에러 처리", () => {
    it("API 에러 (429) → retryable error 이벤트", async () => {
      mockCallLLMStream.mockRejectedValue(new Error("API rate limit 429"));

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "hi");
      const events = await consumeStream(stream);

      const errEvent = events.find((e) => e.type === "error");
      expect(errEvent).toBeDefined();
      expect(errEvent!.errorType).toBe("api_error");
      expect(errEvent!.retryable).toBe(true);
    });

    it("API 에러 (overloaded) → retryable error 이벤트", async () => {
      mockCallLLMStream.mockRejectedValue(new Error("Claude is overloaded"));

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "hi");
      const events = await consumeStream(stream);

      const errEvent = events.find((e) => e.type === "error");
      expect(errEvent!.errorType).toBe("api_error");
      expect(errEvent!.retryable).toBe(true);
    });

    it("일반 에러 → internal_error, retryable=false", async () => {
      mockCallLLMStream.mockRejectedValue(new Error("Unknown failure"));

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "hi");
      const events = await consumeStream(stream);

      const errEvent = events.find((e) => e.type === "error");
      expect(errEvent).toBeDefined();
      expect(errEvent!.errorType).toBe("internal_error");
      expect(errEvent!.retryable).toBe(false);
      expect(errEvent!.suggestion).toContain("새 대화를 시작");
    });

    it("non-Error 예외 → 기본 에러 메시지", async () => {
      mockCallLLMStream.mockRejectedValue("string error");

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "hi");
      const events = await consumeStream(stream);

      const errEvent = events.find((e) => e.type === "error");
      expect(errEvent!.message).toBe("알 수 없는 오류가 발생했습니다.");
    });
  });

  describe("tenantId 전달", () => {
    it("saveAndFinalize에 tenantId가 전달된다", async () => {
      mockSSEEvents(textOnlySSEEvents("응답"));

      const stream = createAgentStreamResponse(asDB(db), "key", CONV_ID, "hi", "tenant-1");
      await consumeStream(stream);

      expect(mockSave).toHaveBeenCalledOnce();
      const opts = mockSave.mock.calls[0][3];
      expect(opts.tenantId).toBe("tenant-1");
    });
  });
});
