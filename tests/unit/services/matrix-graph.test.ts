/**
 * MatrixGraphService 단위 테스트
 * 대상: app/lib/services/matrix-graph.service.ts (~426 lines)
 *
 * 메서드 목록:
 *  1. cellToJsonLdNode(cell, industryName, functionName) — 순수 함수
 *  2. industryToJsonLdNode(industry) — 순수 함수
 *  3. functionToJsonLdNode(func) — 순수 함수
 *  4. buildTeamMatrixGraph(teamId) — 팀 전체 Matrix → JSON-LD Graph 빌드
 *  5. syncCellToGraph(cellId) — 단일 Cell 변경 시 Graph 동기화
 *  6. getMatrixGraph(teamId) — 팀 Matrix Graph 조회
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { MatrixGraphService } from "~/lib/services/matrix-graph.service";
import {
  industries,
  functions,
  matrixCells,
  consensusScores,
  cellTopicMap,
} from "~/features/matrix/db/schema";
import type {
  Industry,
  MatrixCell,
  Function as MatrixFunction,
} from "~/features/matrix/db/schema";
import { topics } from "~/db/schema-v2";
import { users, tenants } from "~/db/schema";

let db: ReturnType<typeof createTestDb>;
let service: MatrixGraphService;

const TEAM_ID = "team-mx-graph";
const USER_ID = "user-mx-graph";
const IND_1 = "ind-energy";
const IND_2 = "ind-logistics";
const FN_1 = "fn-sap-billing";
const FN_2 = "fn-ai-forecast";
const CELL_1 = `${IND_1}_${FN_1}`;
const CELL_2 = `${IND_2}_${FN_2}`;
const TOPIC_1 = "topic-carbon";

beforeAll(() => {
  db = createTestDb();
  service = new MatrixGraphService(db as unknown as DB);

  const now = new Date();

  // 사용자 + 테넌트
  db.insert(users)
    .values([{ id: USER_ID, email: "mx@test.com", name: "MX 테스터", role: "admin" }])
    .run();
  db.insert(tenants)
    .values([{ id: TEAM_ID, name: "MX Test Team", slug: "mx-test", ownerUserId: USER_ID }])
    .run();

  // Industry (X축)
  db.insert(industries)
    .values([
      {
        id: IND_1, teamId: TEAM_ID, name: "에너지", nameEn: "Energy",
        description: "에너지 산업군", displayOrder: 1, strategicWeight: 3.5,
        isActive: 1, createdAt: now, updatedAt: now,
      },
      {
        id: IND_2, teamId: TEAM_ID, name: "물류", nameEn: "Logistics",
        displayOrder: 2, strategicWeight: 2.0,
        isActive: 1, createdAt: now, updatedAt: now,
      },
    ])
    .run();

  // Function (Y축)
  db.insert(functions)
    .values([
      {
        id: FN_1, teamId: TEAM_ID, name: "SAP 과금", nameEn: "SAP Billing",
        category: "sap_based", displayOrder: 1,
        isActive: 1, createdAt: now, updatedAt: now,
      },
      {
        id: FN_2, teamId: TEAM_ID, name: "AI 예측", nameEn: "AI Forecast",
        description: "수요 예측", category: "ai_service", displayOrder: 2,
        isActive: 1, createdAt: now, updatedAt: now,
      },
    ])
    .run();

  // Cell (교차점)
  db.insert(matrixCells)
    .values([
      {
        id: CELL_1, teamId: TEAM_ID, industryId: IND_1, functionId: FN_1,
        timeHorizon: "short", pipelineStage: "activity", status: "active",
        description: "에너지×SAP 과금", priority: 3, createdBy: USER_ID,
        createdAt: now, updatedAt: now,
      },
      {
        id: CELL_2, teamId: TEAM_ID, industryId: IND_2, functionId: FN_2,
        timeHorizon: "mid", pipelineStage: "signal", status: "watching",
        priority: 1, createdBy: USER_ID,
        createdAt: now, updatedAt: now,
      },
    ])
    .run();

  // Topic
  db.insert(topics)
    .values([
      {
        id: TOPIC_1, teamId: TEAM_ID, name: "탄소 배출",
        status: "active", createdBy: USER_ID, createdAt: now, updatedAt: now,
      },
    ])
    .run();

  // Cell-Topic 매핑
  db.insert(cellTopicMap)
    .values([
      { cellId: CELL_1, topicId: TOPIC_1, relevance: 0.9, linkedBy: USER_ID, createdAt: now },
    ])
    .run();

  // Consensus Score
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  db.insert(consensusScores)
    .values([
      {
        cellId: CELL_1, scorePeriod: period,
        clevelScore: 4.0, executionScore: 3.5, compositeScore: 3.75,
        status: "confirmed", participantCount: 3,
        createdAt: now, updatedAt: now,
      },
    ])
    .run();
});

// ─── 순수 함수 테스트 ─────────────────────────────────────────────

describe("cellToJsonLdNode", () => {
  const now = new Date();
  const cell: MatrixCell = {
    id: "ind1_fn1", teamId: "t1", industryId: "ind1", functionId: "fn1",
    timeHorizon: "short", pipelineStage: "activity", status: "active",
    description: "테스트 셀", revenuePotential: null, revenueUnit: "krw_100m",
    ownerId: null, priority: 3, tags: null, createdBy: "u1",
    createdAt: now, updatedAt: now,
  };

  it("기본 JSON-LD 노드 구조를 반환", () => {
    const node = service.cellToJsonLdNode(cell, "에너지", "물류");
    expect(node["@id"]).toBe("mx:cell/ind1_fn1");
    expect(node["@type"]).toBe("mx:Cell");
    expect(node.name).toBe("에너지 × 물류");
    expect(node.industryId).toBe("mx:industry/ind1");
    expect(node.functionId).toBe("mx:function/fn1");
    expect(node.timeHorizon).toBe("short");
    expect(node.pipelineStage).toBe("activity");
    expect(node.status).toBe("active");
    expect(node.createdAt).toBe(now.toISOString());
  });

  it("relatedTo에 industry, function, horizon 참조 포함", () => {
    const node = service.cellToJsonLdNode(cell, "에너지", "물류");
    expect(node.relatedTo).toEqual([
      "mx:industry/ind1",
      "mx:function/fn1",
      "mx:horizon/short",
    ]);
  });

  it("description이 있으면 노드에 포함", () => {
    const node = service.cellToJsonLdNode(cell, "에너지", "물류");
    expect(node.description).toBe("테스트 셀");
  });

  it("priority가 null이면 노드에 포함하지 않음", () => {
    const noP = { ...cell, priority: null };
    const node = service.cellToJsonLdNode(noP, "에너지", "물류");
    expect(node.priority).toBeUndefined();
  });

  it("description이 null이면 노드에 포함하지 않음", () => {
    const noDesc = { ...cell, description: null };
    const node = service.cellToJsonLdNode(noDesc, "에너지", "물류");
    expect(node.description).toBeUndefined();
  });
});

describe("industryToJsonLdNode", () => {
  const now = new Date();
  const ind: Industry = {
    id: "ind-test", teamId: "t1", name: "테스트 산업", nameEn: "Test Industry",
    description: "산업 설명", displayOrder: 1, strategicWeight: 4.0,
    icon: null, isActive: 1, createdAt: now, updatedAt: now,
  };

  it("기본 JSON-LD 노드 구조를 반환", () => {
    const node = service.industryToJsonLdNode(ind);
    expect(node["@id"]).toBe("mx:industry/ind-test");
    expect(node["@type"]).toBe("mx:Industry");
    expect(node.name).toBe("테스트 산업");
    expect(node.strategicWeight).toBe(4.0);
    expect(node.createdAt).toBe(now.toISOString());
  });

  it("nameEn과 description이 있으면 포함", () => {
    const node = service.industryToJsonLdNode(ind);
    expect(node.nameEn).toBe("Test Industry");
    expect(node.description).toBe("산업 설명");
  });

  it("nameEn이 null이면 포함하지 않음", () => {
    const noEn = { ...ind, nameEn: null };
    const node = service.industryToJsonLdNode(noEn);
    expect(node.nameEn).toBeUndefined();
  });
});

describe("functionToJsonLdNode", () => {
  const now = new Date();
  const fn: MatrixFunction = {
    id: "fn-test", teamId: "t1", name: "테스트 기능", nameEn: "Test Func",
    description: "기능 설명", category: "ai_service", displayOrder: 1,
    isActive: 1, createdAt: now, updatedAt: now,
  };

  it("기본 JSON-LD 노드 구조를 반환", () => {
    const node = service.functionToJsonLdNode(fn);
    expect(node["@id"]).toBe("mx:function/fn-test");
    expect(node["@type"]).toBe("mx:Function");
    expect(node.name).toBe("테스트 기능");
    expect(node.category).toBe("ai_service");
  });

  it("description이 null이면 포함하지 않음", () => {
    const noDesc = { ...fn, description: null };
    const node = service.functionToJsonLdNode(noDesc);
    expect(node.description).toBeUndefined();
  });
});

// ─── DB 연동 테스트 ───────────────────────────────────────────────

describe("buildTeamMatrixGraph", () => {
  it("팀 전체 Matrix를 JSON-LD Graph로 빌드", async () => {
    const record = await service.buildTeamMatrixGraph(TEAM_ID);
    expect(record).toBeDefined();
    expect(record.scopeType).toBe("org");
    expect(record.scopeId).toBe(TEAM_ID);
    expect(record.version).toBe(1);

    const graph = record.jsonld;
    expect(graph["@context"]).toBeDefined();
    expect(Array.isArray(graph["@graph"])).toBe(true);
  });

  it("Industry/Function/Cell/TimeHorizon 노드를 모두 포함", async () => {
    const record = await service.buildTeamMatrixGraph(TEAM_ID);
    const nodes = record.jsonld["@graph"];
    const types = nodes.map((n) => n["@type"]);

    expect(types).toContain("mx:Industry");
    expect(types).toContain("mx:Function");
    expect(types).toContain("mx:Cell");
    expect(types).toContain("mx:TimeHorizon");
  });

  it("TimeHorizon 노드 3개 (short/mid/long) 포함", async () => {
    const record = await service.buildTeamMatrixGraph(TEAM_ID);
    const horizonNodes = record.jsonld["@graph"].filter(
      (n) => n["@type"] === "mx:TimeHorizon",
    );
    expect(horizonNodes).toHaveLength(3);
    const ids = horizonNodes.map((n) => n["@id"]);
    expect(ids).toContain("mx:horizon/short");
    expect(ids).toContain("mx:horizon/mid");
    expect(ids).toContain("mx:horizon/long");
  });

  it("Consensus Score가 있는 Cell에 Score 노드가 추가됨", async () => {
    const record = await service.buildTeamMatrixGraph(TEAM_ID);
    const scoreNodes = record.jsonld["@graph"].filter(
      (n) => n["@type"] === "mx:Score",
    );
    expect(scoreNodes.length).toBeGreaterThanOrEqual(1);

    const scoreNode = scoreNodes.find((n) =>
      (n["@id"] as string).startsWith(`mx:score/${CELL_1}/`),
    );
    expect(scoreNode).toBeDefined();
    expect(scoreNode!.compositeScore).toBe(3.75);
    expect(scoreNode!.clevelScore).toBe(4.0);
    expect(scoreNode!.executionScore).toBe(3.5);
  });

  it("Cell-Topic 링크가 있는 Cell에 linkedTopic 포함", async () => {
    const record = await service.buildTeamMatrixGraph(TEAM_ID);
    const cellNode = record.jsonld["@graph"].find(
      (n) => n["@id"] === `mx:cell/${CELL_1}`,
    );
    expect(cellNode).toBeDefined();
    expect(cellNode!.linkedTopic).toEqual([`dx:topic/${TOPIC_1}`]);
  });

  it("기존 Graph가 있으면 업데이트 (버전 증가)", async () => {
    // 첫 번째 빌드 (이전 테스트에서 이미 생성됨)
    const first = await service.getMatrixGraph(TEAM_ID);
    expect(first).not.toBeNull();
    const firstVersion = first!.version;

    // 두 번째 빌드
    const second = await service.buildTeamMatrixGraph(TEAM_ID);
    expect(second.version).toBe(firstVersion + 1);
  });
});

describe("getMatrixGraph", () => {
  it("존재하는 팀의 Graph를 반환", async () => {
    const record = await service.getMatrixGraph(TEAM_ID);
    expect(record).not.toBeNull();
    expect(record!.scopeType).toBe("org");
    expect(record!.scopeId).toBe(TEAM_ID);
  });

  it("존재하지 않는 팀은 null 반환", async () => {
    const record = await service.getMatrixGraph("nonexistent-team");
    expect(record).toBeNull();
  });
});

describe("syncCellToGraph", () => {
  it("기존 Graph에 단일 Cell을 동기화 (노드 교체)", async () => {
    // Graph가 이미 존재하는 상태
    const before = await service.getMatrixGraph(TEAM_ID);
    expect(before).not.toBeNull();
    const prevVersion = before!.version;

    const record = await service.syncCellToGraph(CELL_1);
    expect(record.version).toBe(prevVersion + 1);

    // CELL_1 노드가 존재
    const cellNode = record.jsonld["@graph"].find(
      (n) => n["@id"] === `mx:cell/${CELL_1}`,
    );
    expect(cellNode).toBeDefined();
    expect(cellNode!["@type"]).toBe("mx:Cell");
  });

  it("Topic 링크도 포함하여 동기화", async () => {
    const record = await service.syncCellToGraph(CELL_1);
    const cellNode = record.jsonld["@graph"].find(
      (n) => n["@id"] === `mx:cell/${CELL_1}`,
    );
    expect(cellNode!.linkedTopic).toEqual([`dx:topic/${TOPIC_1}`]);
  });

  it("최신 Consensus Score도 포함", async () => {
    const record = await service.syncCellToGraph(CELL_1);
    const cellNode = record.jsonld["@graph"].find(
      (n) => n["@id"] === `mx:cell/${CELL_1}`,
    );
    expect(cellNode!.compositeScore).toBe(3.75);

    const scoreNodes = record.jsonld["@graph"].filter(
      (n) =>
        n["@type"] === "mx:Score" &&
        (n["@id"] as string).startsWith(`mx:score/${CELL_1}/`),
    );
    expect(scoreNodes.length).toBeGreaterThanOrEqual(1);
  });

  it("존재하지 않는 Cell이면 에러 발생", async () => {
    await expect(
      service.syncCellToGraph("nonexistent-cell"),
    ).rejects.toThrow("Cell not found");
  });
});
