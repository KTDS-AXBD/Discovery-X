/**
 * processToolBlocks — add_evidence 후처리 테스트
 *
 * add_evidence / complete_experiment 도구 실행 후
 * 생성된 evidence에 conversationId가 연결되는지 검증.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "tests/helpers/db";
import { evidence, conversations, users, discoveries } from "~/db/schema";
import type { DB } from "~/db";

// executeTool 모킹 — 도구 실행 결과를 제어
const mockExecuteTool = vi.hoisted(() => vi.fn());
vi.mock("~/features/chat/agent/tool-handlers", () => ({
  executeTool: mockExecuteTool,
}));

import { processToolBlocks } from "~/features/chat/agent/agent-pipeline";

function asDB(db: TestDB) {
  return db as unknown as DB;
}

let db: TestDB;
const TEST_USER_ID = "test-user-001";
const TEST_DISCOVERY_ID = "test-disc-001";
const TEST_CONVERSATION_ID = "test-conv-001";
const TEST_EVIDENCE_ID = "test-evidence-001";

beforeEach(() => {
  db = createTestDb();
  mockExecuteTool.mockReset();

  // 테스트 시드 데이터 삽입
  db.insert(users).values({
    id: TEST_USER_ID,
    email: "test@example.com",
    name: "Test User",
  }).run();

  db.insert(discoveries).values({
    id: TEST_DISCOVERY_ID,
    title: "테스트 디스커버리",
    seedSummary: "테스트 시드 요약",
    sourceType: "manual",
    ownerId: TEST_USER_ID,
  }).run();

  db.insert(conversations).values({
    id: TEST_CONVERSATION_ID,
    userId: TEST_USER_ID,
  }).run();

  // evidence 레코드 미리 삽입 (add_evidence 도구가 생성한 것을 시뮬레이션)
  db.insert(evidence).values({
    id: TEST_EVIDENCE_ID,
    discoveryId: TEST_DISCOVERY_ID,
    type: "qualitative",
    strength: "strong",
    content: "테스트 증거",
    createdById: TEST_USER_ID,
  }).run();
});

describe("processToolBlocks — evidence conversationId 연결", () => {
  it("add_evidence 도구 실행 후 evidence에 conversationId가 설정된다", async () => {
    mockExecuteTool.mockResolvedValueOnce(
      JSON.stringify({ success: true, evidenceId: TEST_EVIDENCE_ID })
    );

    const toolBlocks = [{
      type: "tool_use" as const,
      id: "tool-1",
      name: "add_evidence",
      input: { discoveryId: TEST_DISCOVERY_ID, type: "qualitative", strength: "strong", content: "증거" },
    }];

    await processToolBlocks(asDB(db), TEST_CONVERSATION_ID, toolBlocks, "", 3);

    const rows = db.select({ conversationId: evidence.conversationId })
      .from(evidence)
      .where(eq(evidence.id, TEST_EVIDENCE_ID))
      .all();

    expect(rows[0]?.conversationId).toBe(TEST_CONVERSATION_ID);
  });

  it("add_evidence가 아닌 도구 실행 시 evidence 업데이트가 발생하지 않는다", async () => {
    mockExecuteTool.mockResolvedValueOnce(
      JSON.stringify({ success: true })
    );

    const toolBlocks = [{
      type: "tool_use" as const,
      id: "tool-2",
      name: "get_discovery",
      input: { discoveryId: TEST_DISCOVERY_ID },
    }];

    await processToolBlocks(asDB(db), TEST_CONVERSATION_ID, toolBlocks, "", 3);

    const rows = db.select({ conversationId: evidence.conversationId })
      .from(evidence)
      .where(eq(evidence.id, TEST_EVIDENCE_ID))
      .all();

    expect(rows[0]?.conversationId).toBeNull();
  });

  it("도구 결과 파싱 실패 시 에러 없이 진행된다", async () => {
    mockExecuteTool.mockResolvedValueOnce("not-valid-json");

    const toolBlocks = [{
      type: "tool_use" as const,
      id: "tool-3",
      name: "add_evidence",
      input: { discoveryId: TEST_DISCOVERY_ID, type: "qualitative", strength: "strong", content: "증거" },
    }];

    // 에러 없이 완료되어야 함
    const results = await processToolBlocks(asDB(db), TEST_CONVERSATION_ID, toolBlocks, "", 3);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("add_evidence");
  });

  it("complete_experiment 도구 실행 후에도 evidence에 conversationId가 설정된다", async () => {
    mockExecuteTool.mockResolvedValueOnce(
      JSON.stringify({ success: true, evidenceId: TEST_EVIDENCE_ID })
    );

    const toolBlocks = [{
      type: "tool_use" as const,
      id: "tool-4",
      name: "complete_experiment",
      input: { experimentId: "exp-001", resultSummary: "실험 결과" },
    }];

    await processToolBlocks(asDB(db), TEST_CONVERSATION_ID, toolBlocks, "", 3);

    const rows = db.select({ conversationId: evidence.conversationId })
      .from(evidence)
      .where(eq(evidence.id, TEST_EVIDENCE_ID))
      .all();

    expect(rows[0]?.conversationId).toBe(TEST_CONVERSATION_ID);
  });
});
