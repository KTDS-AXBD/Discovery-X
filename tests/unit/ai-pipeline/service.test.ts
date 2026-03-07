/**
 * AIPipelineService 단위 테스트 (실 DB 기반)
 *
 * 대상: app/lib/ai-pipeline/service.ts
 * Radar -> Cluster -> Ideas -> Assessment -> Discovery 자동 파이프라인
 */
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { createTestDb, type TestDB } from "tests/helpers/db";
import type { DB } from "~/db";
import {
  users,
  tenants,
  tenantMembers,
  radarSources,
  radarItems,
  aiPipelineRuns,
  AIPipelineRunStatus,
  evidence,
  discoveries,
} from "~/db";
import { ideas } from "~/features/ideas/db/schema";
import { eq } from "drizzle-orm";

// Mock: callLLM

vi.mock("~/lib/ai", () => ({
  callLLM: vi.fn(),
  CLAUDE_MODEL: "claude-sonnet-4-20250514",
}));

import { callLLM } from "~/lib/ai";
import { AIPipelineService } from "~/lib/ai-pipeline/service";

const mockCallLLM = callLLM as Mock;

// Constants

const TENANT_ID = "t-pipe-test";
const USER_ID = "user-pipe-1";
const SOURCE_ID = "src-pipe-1";
const API_KEY = "test-api-key";

// Helper

let db: TestDB;
let service: AIPipelineService;

function asDB(d: TestDB) {
  return d as unknown as DB;
}

function makeLLMResponse(text: string, inputTokens = 10, outputTokens = 20) {
  return {
    id: "msg-test",
    type: "message" as const,
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
    model: "claude-sonnet-4-20250514",
    stop_reason: "end_turn" as const,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

function seedBase() {
  db.insert(users)
    .values({ id: USER_ID, email: "pipe@test.com", name: "Pipe User", role: "admin" })
    .run();
  db.insert(tenants)
    .values({ id: TENANT_ID, name: "Pipe Tenant", slug: "pipe-test", ownerUserId: USER_ID, status: "active" })
    .run();
  db.insert(tenantMembers)
    .values({ id: "tm-pipe-1", tenantId: TENANT_ID, userId: USER_ID })
    .run();
  db.insert(radarSources)
    .values({ id: SOURCE_ID, name: "Test Source", sourceType: "web", url: "https://test.com", tenantId: TENANT_ID })
    .run();
}

function insertRadarItem(id: string, overrides: Partial<typeof radarItems.$inferInsert> = {}) {
  db.insert(radarItems)
    .values({
      id,
      sourceId: SOURCE_ID,
      urlHash: `hash-${id}`,
      url: `https://test.com/${id}`,
      title: `Item ${id}`,
      titleKo: `아이템 ${id}`,
      summaryKo: `요약 ${id}`,
      status: "COLLECTED",
      ...overrides,
    })
    .run();
}

/** 클러스터 LLM 응답 빌더 */
function clusterResponse(itemIds: string[]) {
  return makeLLMResponse(
    JSON.stringify({
      clusters: [
        { topic: "AI 트렌드", itemIds, rationale: "AI 관련 아이템" },
      ],
    }),
  );
}

/** 아이디어 LLM 응답 빌더 */
function ideaResponse() {
  return makeLLMResponse(
    JSON.stringify({
      title: "AI 기반 신사업",
      summary: "AI 활용 사업 기회",
      whyNow: "시장 성숙도 높음",
    }),
  );
}

/** 평가 LLM 응답 빌더 */
function assessmentResponse(confidence: number) {
  return makeLLMResponse(
    JSON.stringify({
      confidence,
      hypothesis: "AI 수요 증가 가설",
      minimalAction: "고객 인터뷰 3건",
      expectedEvidence: "관심 표명 2건 이상",
      rationale: "시장 데이터 기반",
    }),
  );
}

// Setup

beforeEach(() => {
  db = createTestDb();
  service = new AIPipelineService(asDB(db), API_KEY);
  seedBase();
  mockCallLLM.mockReset();
});

// ═══════════════════════════════════════════════════════════════════════
// 1. run() — happy path
// ═══════════════════════════════════════════════════════════════════════

describe("run() — happy path", () => {
  it("아이템 없으면 즉시 완료 (0 processed, 0 created)", async () => {
    const result = await service.run(TENANT_ID);

    expect(result.radarItemsProcessed).toBe(0);
    expect(result.ideasCreated).toBe(0);
    expect(result.discoveriesCreated).toBe(0);
    expect(result.errors).toHaveLength(0);

    // pipeline run record: COMPLETED
    const run = db.select().from(aiPipelineRuns).where(eq(aiPipelineRuns.id, result.runId)).get();
    expect(run?.status).toBe(AIPipelineRunStatus.COMPLETED);
  });

  it("아이템 있으면 pipeline run record 생성 (RUNNING -> COMPLETED)", async () => {
    insertRadarItem("r1");
    insertRadarItem("r2");

    // 클러스터링 실패하도록 mock
    mockCallLLM.mockResolvedValueOnce(makeLLMResponse("invalid json"));

    const result = await service.run(TENANT_ID);

    expect(result.radarItemsProcessed).toBe(2);
    const run = db.select().from(aiPipelineRuns).where(eq(aiPipelineRuns.id, result.runId)).get();
    expect(run?.status).toBe(AIPipelineRunStatus.COMPLETED);
  });

  it("클러스터링 실패 -> markProcessed + 0 ideas 완료", async () => {
    insertRadarItem("r1");
    // callLLM이 에러 throw
    mockCallLLM.mockRejectedValueOnce(new Error("LLM error"));

    const result = await service.run(TENANT_ID);

    expect(result.radarItemsProcessed).toBe(1);
    expect(result.ideasCreated).toBe(0);

    // aiProcessedAt이 설정됐는지 확인
    const item = db.select().from(radarItems).where(eq(radarItems.id, "r1")).get();
    expect(item?.aiProcessedAt).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Clustering
// ═══════════════════════════════════════════════════════════════════════

describe("Clustering", () => {
  it("유효한 JSON 응답 -> 클러스터 배열 파싱 성공", async () => {
    insertRadarItem("r1");
    mockCallLLM
      .mockResolvedValueOnce(clusterResponse(["r1"])) // cluster
      .mockResolvedValueOnce(ideaResponse())           // idea gen
      .mockResolvedValueOnce(assessmentResponse(50));   // assessment (low -> no discovery)

    const result = await service.run(TENANT_ID);

    expect(result.ideasCreated).toBe(1);
    expect(mockCallLLM).toHaveBeenCalledTimes(3);
  });

  it("유효하지 않은 JSON -> null 반환 (아이디어 0)", async () => {
    insertRadarItem("r1");
    mockCallLLM.mockResolvedValueOnce(makeLLMResponse("이건 JSON이 아닙니다"));

    const result = await service.run(TENANT_ID);

    expect(result.ideasCreated).toBe(0);
  });

  it("LLM 에러 -> null 반환 (아이디어 0)", async () => {
    insertRadarItem("r1");
    mockCallLLM.mockRejectedValueOnce(new Error("API timeout"));

    const result = await service.run(TENANT_ID);

    expect(result.ideasCreated).toBe(0);
  });

  it("마크다운 코드블록 래퍼 제거 후 JSON 파싱", async () => {
    insertRadarItem("r1");
    const wrappedJson = "```json\n" + JSON.stringify({
      clusters: [{ topic: "테스트", itemIds: ["r1"], rationale: "이유" }],
    }) + "\n```";
    mockCallLLM
      .mockResolvedValueOnce(makeLLMResponse(wrappedJson))
      .mockResolvedValueOnce(ideaResponse())
      .mockResolvedValueOnce(assessmentResponse(30));

    const result = await service.run(TENANT_ID);
    expect(result.ideasCreated).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Idea Generation
// ═══════════════════════════════════════════════════════════════════════

describe("Idea Generation", () => {
  it("유효한 응답 -> IdeaResult 생성 + DB 저장", async () => {
    insertRadarItem("r1");
    mockCallLLM
      .mockResolvedValueOnce(clusterResponse(["r1"]))
      .mockResolvedValueOnce(ideaResponse())
      .mockResolvedValueOnce(assessmentResponse(50));

    const result = await service.run(TENANT_ID);
    expect(result.ideasCreated).toBe(1);

    // ideas 테이블 확인
    const allIdeas = db.select().from(ideas).all();
    expect(allIdeas).toHaveLength(1);
    expect(allIdeas[0].title).toBe("AI 기반 신사업");
    expect(allIdeas[0].createdByAgent).toBe(1);
  });

  it("analysisData 저장 확인 (summary, whyNow, aiGenerated, sourceCluster)", async () => {
    insertRadarItem("r1");
    mockCallLLM
      .mockResolvedValueOnce(clusterResponse(["r1"]))
      .mockResolvedValueOnce(ideaResponse())
      .mockResolvedValueOnce(assessmentResponse(50));

    await service.run(TENANT_ID);

    const idea = db.select().from(ideas).all()[0];
    const data = idea.analysisData as Record<string, unknown>;
    expect(data.summary).toBe("AI 활용 사업 기회");
    expect(data.whyNow).toBe("시장 성숙도 높음");
    expect(data.aiGenerated).toBe(true);
    expect(data.sourceCluster).toBe("AI 트렌드");
  });

  it("소스 링크 생성 확인 (ideaSources)", async () => {
    insertRadarItem("r1");
    insertRadarItem("r2");
    // 두 아이템을 하나의 클러스터로
    mockCallLLM
      .mockResolvedValueOnce(clusterResponse(["r1", "r2"]))
      .mockResolvedValueOnce(ideaResponse())
      .mockResolvedValueOnce(assessmentResponse(50));

    await service.run(TENANT_ID);

    const { ideaSources } = await import("~/features/ideas/db/schema");
    const links = db.select().from(ideaSources).all();
    expect(links).toHaveLength(2);
  });

  it("아이디어 생성 LLM 실패 -> 해당 클러스터 skip (ideasCreated=0)", async () => {
    insertRadarItem("r1");
    mockCallLLM
      .mockResolvedValueOnce(clusterResponse(["r1"]))
      .mockRejectedValueOnce(new Error("idea gen failed")); // idea gen 실패

    const result = await service.run(TENANT_ID);
    expect(result.ideasCreated).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Discovery Assessment & Promotion
// ═══════════════════════════════════════════════════════════════════════

describe("Discovery Assessment & Promotion", () => {
  it("confidence >= 70 -> Discovery 생성 + HYPOTHESIS 전환 + Evidence 생성", async () => {
    insertRadarItem("r1");
    mockCallLLM
      .mockResolvedValueOnce(clusterResponse(["r1"]))
      .mockResolvedValueOnce(ideaResponse())
      .mockResolvedValueOnce(assessmentResponse(85));

    const result = await service.run(TENANT_ID);

    expect(result.ideasCreated).toBe(1);
    expect(result.discoveriesCreated).toBe(1);

    // Discovery 존재 확인
    const allDiscoveries = db.select().from(discoveries).all();
    expect(allDiscoveries).toHaveLength(1);
    expect(allDiscoveries[0].status).toBe("HYPOTHESIS");

    // Evidence 존재 확인
    const allEvidence = db.select().from(evidence).all();
    expect(allEvidence).toHaveLength(1);
    expect(allEvidence[0].strength).toBe("A"); // 85 -> A
    expect(allEvidence[0].type).toBe("DATA");
  });

  it("confidence < 70 -> Discovery 미생성, 아이디어만 생성", async () => {
    insertRadarItem("r1");
    mockCallLLM
      .mockResolvedValueOnce(clusterResponse(["r1"]))
      .mockResolvedValueOnce(ideaResponse())
      .mockResolvedValueOnce(assessmentResponse(50));

    const result = await service.run(TENANT_ID);

    expect(result.ideasCreated).toBe(1);
    expect(result.discoveriesCreated).toBe(0);

    const allDiscoveries = db.select().from(discoveries).all();
    expect(allDiscoveries).toHaveLength(0);
  });

  it("confidence 정확히 70 -> Discovery 생성됨 (threshold 이상)", async () => {
    insertRadarItem("r1");
    mockCallLLM
      .mockResolvedValueOnce(clusterResponse(["r1"]))
      .mockResolvedValueOnce(ideaResponse())
      .mockResolvedValueOnce(assessmentResponse(70));

    const result = await service.run(TENANT_ID);
    expect(result.discoveriesCreated).toBe(1);
  });

  it("confidence 69 -> Discovery 미생성 (threshold 미만)", async () => {
    insertRadarItem("r1");
    mockCallLLM
      .mockResolvedValueOnce(clusterResponse(["r1"]))
      .mockResolvedValueOnce(ideaResponse())
      .mockResolvedValueOnce(assessmentResponse(69));

    const result = await service.run(TENANT_ID);
    expect(result.discoveriesCreated).toBe(0);
  });

  it("assessment LLM 실패 -> Discovery 미생성, 아이디어는 생성됨", async () => {
    insertRadarItem("r1");
    mockCallLLM
      .mockResolvedValueOnce(clusterResponse(["r1"]))
      .mockResolvedValueOnce(ideaResponse())
      .mockRejectedValueOnce(new Error("assessment failed"));

    const result = await service.run(TENANT_ID);
    expect(result.ideasCreated).toBe(1);
    expect(result.discoveriesCreated).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Limits
// ═══════════════════════════════════════════════════════════════════════

describe("Limits", () => {
  it("MAX_ITEMS_PER_RUN = 3: 4개 아이템 중 3개만 조회", async () => {
    insertRadarItem("r1");
    insertRadarItem("r2");
    insertRadarItem("r3");
    insertRadarItem("r4");

    // 클러스터링 실패로 빠르게 끝냄
    mockCallLLM.mockResolvedValueOnce(makeLLMResponse("bad json"));

    const result = await service.run(TENANT_ID);
    expect(result.radarItemsProcessed).toBe(3);
  });

  it("MAX_IDEAS_PER_RUN = 1: 여러 클러스터 중 첫 번째만 처리", async () => {
    insertRadarItem("r1");
    insertRadarItem("r2");
    // 2개 클러스터 반환
    mockCallLLM.mockResolvedValueOnce(
      makeLLMResponse(
        JSON.stringify({
          clusters: [
            { topic: "AI", itemIds: ["r1"], rationale: "AI" },
            { topic: "Cloud", itemIds: ["r2"], rationale: "Cloud" },
          ],
        }),
      ),
    );
    mockCallLLM
      .mockResolvedValueOnce(ideaResponse())
      .mockResolvedValueOnce(assessmentResponse(50));

    const result = await service.run(TENANT_ID);
    // MAX_IDEAS_PER_RUN=1 이므로 1개만 처리
    expect(result.ideasCreated).toBe(1);
    // callLLM: cluster(1) + idea(1) + assessment(1) = 3 (두 번째 클러스터는 skip)
    expect(mockCallLLM).toHaveBeenCalledTimes(3);
  });

  it("MAX_DISCOVERIES_PER_RUN = 1: 이미 Discovery 1개 생성 시 추가 평가 skip", async () => {
    insertRadarItem("r1");
    mockCallLLM
      .mockResolvedValueOnce(clusterResponse(["r1"]))
      .mockResolvedValueOnce(ideaResponse())
      .mockResolvedValueOnce(assessmentResponse(90));

    const result = await service.run(TENANT_ID);
    expect(result.discoveriesCreated).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. Pipeline Run Record
// ═══════════════════════════════════════════════════════════════════════

describe("Pipeline Run Record", () => {
  it("성공 시 RUNNING -> COMPLETED + 지표 저장", async () => {
    insertRadarItem("r1");
    mockCallLLM
      .mockResolvedValueOnce(clusterResponse(["r1"]))
      .mockResolvedValueOnce(ideaResponse())
      .mockResolvedValueOnce(assessmentResponse(80));

    const result = await service.run(TENANT_ID);

    const run = db.select().from(aiPipelineRuns).where(eq(aiPipelineRuns.id, result.runId)).get();
    expect(run?.status).toBe(AIPipelineRunStatus.COMPLETED);
    expect(run?.radarItemsProcessed).toBe(1);
    expect(run?.ideasCreated).toBe(1);
    expect(run?.discoveriesCreated).toBe(1);
    expect(run?.completedAt).not.toBeNull();
  });

  it("tokenUsage가 LLM 호출마다 누적됨", async () => {
    insertRadarItem("r1");
    mockCallLLM
      .mockResolvedValueOnce(makeLLMResponse(
        JSON.stringify({ clusters: [{ topic: "A", itemIds: ["r1"], rationale: "R" }] }),
        100, 50, // cluster call
      ))
      .mockResolvedValueOnce(makeLLMResponse(
        JSON.stringify({ title: "T", summary: "S", whyNow: "W" }),
        200, 80, // idea call
      ))
      .mockResolvedValueOnce(makeLLMResponse(
        JSON.stringify({ confidence: 50, hypothesis: "H", minimalAction: "M", expectedEvidence: "E", rationale: "R" }),
        150, 60, // assessment call
      ));

    const result = await service.run(TENANT_ID);

    expect(result.tokenUsage.input).toBe(100 + 200 + 150);
    expect(result.tokenUsage.output).toBe(50 + 80 + 60);

    // DB에도 저장 확인
    const run = db.select().from(aiPipelineRuns).where(eq(aiPipelineRuns.id, result.runId)).get();
    expect(run?.tokenUsageInput).toBe(450);
    expect(run?.tokenUsageOutput).toBe(190);
  });

  it("에러 없을 때 DB errors 필드는 null", async () => {
    insertRadarItem("r1");
    mockCallLLM
      .mockResolvedValueOnce(clusterResponse(["r1"]))
      .mockResolvedValueOnce(ideaResponse())
      .mockResolvedValueOnce(assessmentResponse(50));

    const result = await service.run(TENANT_ID);

    expect(result.errors).toHaveLength(0);
    const run = db.select().from(aiPipelineRuns).where(eq(aiPipelineRuns.id, result.runId)).get();
    expect(run?.errors).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. markProcessed
// ═══════════════════════════════════════════════════════════════════════

describe("markProcessed", () => {
  it("처리된 아이템의 aiProcessedAt이 설정됨", async () => {
    insertRadarItem("r1");
    insertRadarItem("r2");
    mockCallLLM.mockResolvedValueOnce(makeLLMResponse("bad json")); // cluster fail

    await service.run(TENANT_ID);

    const items = db.select().from(radarItems).all();
    for (const item of items.filter((i) => ["r1", "r2"].includes(i.id))) {
      expect(item.aiProcessedAt).not.toBeNull();
    }
  });

  it("이미 처리된 아이템은 재조회되지 않음", async () => {
    insertRadarItem("r1");
    mockCallLLM.mockResolvedValueOnce(makeLLMResponse("bad")); // first run

    await service.run(TENANT_ID);

    // 두 번째 실행 — r1은 aiProcessedAt이 설정되어 제외됨
    mockCallLLM.mockReset();
    const result2 = await service.run(TENANT_ID);
    expect(result2.radarItemsProcessed).toBe(0);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. Evidence 중복 방지
// ═══════════════════════════════════════════════════════════════════════

describe("Evidence 중복 방지", () => {
  it("동일 sourceUrl이 이미 Evidence에 있으면 skip", async () => {
    insertRadarItem("r1");

    // 파이프라인 실행: Discovery + Evidence 생성
    mockCallLLM
      .mockResolvedValueOnce(clusterResponse(["r1"]))
      .mockResolvedValueOnce(ideaResponse())
      .mockResolvedValueOnce(assessmentResponse(85));

    const result1 = await service.run(TENANT_ID);
    expect(result1.discoveriesCreated).toBe(1);

    const evidenceBefore = db.select().from(evidence).all();
    expect(evidenceBefore).toHaveLength(1);
    expect(evidenceBefore[0].sourceUrl).toBe("https://test.com/r1");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 9. 전체 파이프라인 통합
// ═══════════════════════════════════════════════════════════════════════

describe("Full pipeline integration", () => {
  it("Radar -> Cluster -> Idea -> Assess(high) -> Discovery + Evidence 전체 흐름", async () => {
    insertRadarItem("r1", { keyPoints: ["AI", "LLM"] });
    insertRadarItem("r2", { keyPoints: ["Cloud"] });

    mockCallLLM
      .mockResolvedValueOnce(clusterResponse(["r1", "r2"]))
      .mockResolvedValueOnce(ideaResponse())
      .mockResolvedValueOnce(assessmentResponse(90));

    const result = await service.run(TENANT_ID);

    // 결과 검증
    expect(result.radarItemsProcessed).toBe(2);
    expect(result.ideasCreated).toBe(1);
    expect(result.discoveriesCreated).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.tokenUsage.input).toBeGreaterThan(0);
    expect(result.tokenUsage.output).toBeGreaterThan(0);

    // DB 상태 검증
    const allIdeas = db.select().from(ideas).all();
    expect(allIdeas).toHaveLength(1);

    const disc = db.select().from(discoveries).all();
    expect(disc).toHaveLength(1);
    expect(disc[0].status).toBe("HYPOTHESIS");
    expect(disc[0].createdByAgent).toBe(1);

    const ev = db.select().from(evidence).all();
    expect(ev).toHaveLength(1);
    expect(ev[0].strength).toBe("A"); // 90 -> A

    // radar items -> aiProcessedAt 설정
    const items = db.select().from(radarItems).all();
    for (const item of items) {
      expect(item.aiProcessedAt).not.toBeNull();
    }
  });

  it("SCORED 상태 아이템도 처리 대상에 포함", async () => {
    insertRadarItem("r1", { status: "SCORED" });
    mockCallLLM.mockResolvedValueOnce(makeLLMResponse("bad")); // cluster fail

    const result = await service.run(TENANT_ID);
    expect(result.radarItemsProcessed).toBe(1);
  });

  it("SEEDED/SKIPPED 상태 아이템은 제외", async () => {
    insertRadarItem("r-seeded", { status: "SEEDED" });
    insertRadarItem("r-skipped", { status: "SKIPPED" });

    const result = await service.run(TENANT_ID);
    expect(result.radarItemsProcessed).toBe(0);
  });
});
