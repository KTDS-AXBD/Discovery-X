import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  callClaude,
  callClaudeStream,
  parseSSEStream,
  CLAUDE_MODEL,
  type ClaudeRequest,
  type ClaudeResponse,
} from "~/features/chat/agent/claude-client";

// ---------------------------------------------------------------------------
// fetch mock
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, body = "error"): Response {
  return new Response(body, { status, headers: {} });
}

const API_KEY = "test-key";

const baseRequest: ClaudeRequest = {
  max_tokens: 1024,
  messages: [{ role: "user", content: "hello" }],
};

const sampleResponse: ClaudeResponse = {
  id: "msg_123",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "Hi!" }],
  model: CLAUDE_MODEL,
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 5 },
};

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// callClaude
// ---------------------------------------------------------------------------

describe("callClaude", () => {
  it("정상 응답 반환", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(sampleResponse));
    const result = await callClaude(API_KEY, baseRequest);
    expect(result).toEqual(sampleResponse);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("기본 모델 사용 (model 미지정 시 CLAUDE_MODEL)", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(sampleResponse));
    await callClaude(API_KEY, baseRequest);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe(CLAUDE_MODEL);
  });

  it("명시적 model 전달 시 해당 모델 사용", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(sampleResponse));
    await callClaude(API_KEY, { ...baseRequest, model: "claude-opus-4-20250514" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("claude-opus-4-20250514");
  });

  it("temperature 전달", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(sampleResponse));
    await callClaude(API_KEY, { ...baseRequest, temperature: 0.7 });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.7);
  });

  it("temperature 미지정 시 body에 포함되지 않음", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(sampleResponse));
    await callClaude(API_KEY, baseRequest);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("temperature");
  });

  it("stream: false로 전송", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(sampleResponse));
    await callClaude(API_KEY, baseRequest);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.stream).toBe(false);
  });

  it("API 헤더 올바르게 전송", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(sampleResponse));
    await callClaude(API_KEY, baseRequest);

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["x-api-key"]).toBe(API_KEY);
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("비재시도 상태코드(400) 즉시 에러", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(400, "bad request"));
    await expect(callClaude(API_KEY, baseRequest)).rejects.toThrow("Claude API error 400");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("429 재시도 후 성공", async () => {
    // Mock retry-after header to minimize wait
    const rateLimitResp = new Response("rate limited", {
      status: 429,
      headers: { "retry-after": "0" },
    });
    mockFetch
      .mockResolvedValueOnce(rateLimitResp)
      .mockResolvedValueOnce(jsonResponse(sampleResponse));

    const result = await callClaude(API_KEY, baseRequest);
    expect(result).toEqual(sampleResponse);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("429 최대 재시도 초과 시 에러", async () => {
    // Use retry-after: 0 to speed up retries
    const makeRateLimitResp = () =>
      new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });

    mockFetch.mockImplementation(() => Promise.resolve(makeRateLimitResp()));

    await expect(callClaude(API_KEY, baseRequest)).rejects.toThrow("Claude API error 429");
    // initial + 3 retries = 4 calls
    expect(mockFetch).toHaveBeenCalledTimes(4);
  }, 10_000);

  it("timeout(AbortError) 시 재시도 후 성공", async () => {
    vi.useFakeTimers();
    const abortError = new DOMException("The operation was aborted", "AbortError");
    mockFetch
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(jsonResponse(sampleResponse));

    const promise = callClaude(API_KEY, baseRequest);
    // AbortError retry delay: 1000ms * 2^0 = 1000ms
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await promise;
    expect(result).toEqual(sampleResponse);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// callClaudeStream
// ---------------------------------------------------------------------------

describe("callClaudeStream", () => {
  it("body 반환", async () => {
    const stream = new ReadableStream();
    mockFetch.mockResolvedValueOnce(
      new Response(stream, { status: 200 })
    );
    const result = await callClaudeStream(API_KEY, baseRequest);
    expect(result).toBeInstanceOf(ReadableStream);
  });

  it("body 없으면 에러", async () => {
    // Response with null body
    const resp = new Response(null, { status: 200 });
    Object.defineProperty(resp, "body", { value: null });
    mockFetch.mockResolvedValueOnce(resp);
    await expect(callClaudeStream(API_KEY, baseRequest)).rejects.toThrow(
      "No response body from Claude API"
    );
  });

  it("stream: true로 전송", async () => {
    const stream = new ReadableStream();
    mockFetch.mockResolvedValueOnce(new Response(stream, { status: 200 }));
    await callClaudeStream(API_KEY, baseRequest);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseSSEStream
// ---------------------------------------------------------------------------

function createSSEStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const text = lines.join("\n") + "\n";
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

describe("parseSSEStream", () => {
  it("정상 이벤트 파싱", async () => {
    const event = { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } };
    const stream = createSSEStream([`data: ${JSON.stringify(event)}`]);

    const events = [];
    for await (const e of parseSSEStream(stream)) {
      events.push(e);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event);
  });

  it("[DONE] 시 종료", async () => {
    const event1 = { type: "content_block_delta", delta: { text: "Hi" } };
    const event2 = { type: "content_block_delta", delta: { text: "!" } };
    const stream = createSSEStream([
      `data: ${JSON.stringify(event1)}`,
      `data: [DONE]`,
      `data: ${JSON.stringify(event2)}`,
    ]);

    const events = [];
    for await (const e of parseSSEStream(stream)) {
      events.push(e);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event1);
  });

  it("잘못된 JSON 스킵", async () => {
    const validEvent = { type: "message_start" };
    const stream = createSSEStream([
      `data: {invalid json`,
      `data: ${JSON.stringify(validEvent)}`,
    ]);

    const events = [];
    for await (const e of parseSSEStream(stream)) {
      events.push(e);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(validEvent);
  });

  it("빈 줄 무시", async () => {
    const event = { type: "ping" };
    const stream = createSSEStream([
      "",
      `data: ${JSON.stringify(event)}`,
      "",
    ]);

    const events = [];
    for await (const e of parseSSEStream(stream)) {
      events.push(e);
    }

    expect(events).toHaveLength(1);
  });

  it("복수 이벤트 순서대로 파싱", async () => {
    const e1 = { type: "message_start", message: { id: "msg_1" } };
    const e2 = { type: "content_block_start", content_block: { type: "text" } };
    const e3 = { type: "content_block_delta", delta: { text: "hello" } };
    const stream = createSSEStream([
      `data: ${JSON.stringify(e1)}`,
      `data: ${JSON.stringify(e2)}`,
      `data: ${JSON.stringify(e3)}`,
    ]);

    const events = [];
    for await (const e of parseSSEStream(stream)) {
      events.push(e);
    }

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("message_start");
    expect(events[1].type).toBe("content_block_start");
    expect(events[2].type).toBe("content_block_delta");
  });

  it("청크 분할 시에도 정상 파싱", async () => {
    const event = { type: "content_block_delta", delta: { text: "world" } };
    const fullLine = `data: ${JSON.stringify(event)}\n`;
    const encoder = new TextEncoder();

    // Split in the middle
    const mid = Math.floor(fullLine.length / 2);
    const chunk1 = encoder.encode(fullLine.slice(0, mid));
    const chunk2 = encoder.encode(fullLine.slice(mid));

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk1);
        controller.enqueue(chunk2);
        controller.close();
      },
    });

    const events = [];
    for await (const e of parseSSEStream(stream)) {
      events.push(e);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event);
  });
});
