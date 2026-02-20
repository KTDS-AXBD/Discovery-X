/**
 * MatrixService 단위 테스트
 * 대상: app/lib/services/matrix.service.ts
 *
 * 메서드 목록:
 * ── Industry CRUD ──
 * 1. getIndustries(teamId)
 * 2. createIndustry(teamId, data)
 * 3. updateIndustry(id, data)
 *
 * ── Function CRUD ──
 * 4. getFunctions(teamId)
 * 5. createFunction(teamId, data)
 * 6. updateFunction(id, data)
 *
 * ── Cell CRUD ──
 * 7. getCells(teamId, filters?)
 * 8. getCell(cellId)
 * 9. createCell(data)
 * 10. updateCell(cellId, data)
 *
 * ── Cell-Topic 연결 ──
 * 11. linkCellToTopic(cellId, topicId, linkedBy, relevance?, note?)
 * 12. unlinkCellFromTopic(cellId, topicId)
 * 13. getCellTopics(cellId)
 * 14. getTopicCells(topicId)
 *
 * ── Heatmap ──
 * 15. getHeatmapData(teamId, period?)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { MatrixService } from "~/lib/services/matrix.service";
import {
  industries,
  functions,
  consensusScores,
} from "~/features/matrix/db/schema";
import { topics } from "~/db/schema-v2";
import { users, tenants, tenantMembers } from "~/db/schema";

let db: ReturnType<typeof createTestDb>;
let service: MatrixService;

const TEAM_ID = "t-matrix-test";
const TEAM_OTHER = "t-matrix-other";
const USER_A = "user-matrix-a";
const USER_B = "user-matrix-b";

// 시드용 Industry / Function ID
const IND_RETAIL = "ind-retail";
const IND_FINTECH = "ind-fintech";
const IND_HEALTH = "ind-health"; // isActive=0 (비활성)

const FN_AI = "fn-ai-service";
const FN_SAP = "fn-sap-erp";
const FN_INACTIVE = "fn-inactive"; // isActive=0

const TOPIC_A = "topic-matrix-a";
const TOPIC_B = "topic-matrix-b";

beforeAll(() => {
  db = createTestDb();
  service = new MatrixService(db as unknown as DB);

  // ── 사용자 & 테넌트 ──
  db.insert(users)
    .values([
      { id: USER_A, email: "matrixa@test.com", name: "매트릭스 A", role: "admin" },
      { id: USER_B, email: "matrixb@test.com", name: "매트릭스 B", role: "user" },
    ])
    .run();

  db.insert(tenants)
    .values([
      { id: TEAM_ID, name: "Matrix Test Team", slug: "matrix-test", ownerUserId: USER_A },
      { id: TEAM_OTHER, name: "Other Team", slug: "matrix-other", ownerUserId: USER_B },
    ])
    .run();

  db.insert(tenantMembers)
    .values([
      { id: "tm-mx-a", tenantId: TEAM_ID, userId: USER_A },
      { id: "tm-mx-b", tenantId: TEAM_ID, userId: USER_B },
    ])
    .run();

  // ── Industries (직접 INSERT — getIndustries 외 테스트의 전제 데이터) ──
  db.insert(industries)
    .values([
      { id: IND_RETAIL, teamId: TEAM_ID, name: "유통/리테일", nameEn: "Retail", displayOrder: 1, strategicWeight: 2.0 },
      { id: IND_FINTECH, teamId: TEAM_ID, name: "핀테크", nameEn: "Fintech", displayOrder: 2, strategicWeight: 1.5 },
      { id: IND_HEALTH, teamId: TEAM_ID, name: "헬스케어", isActive: 0, displayOrder: 3 },
      // 다른 팀 — 격리 확인용
      { id: "ind-other", teamId: TEAM_OTHER, name: "기타산업", displayOrder: 1 },
    ])
    .run();

  // ── Functions ──
  db.insert(functions)
    .values([
      { id: FN_AI, teamId: TEAM_ID, name: "AI 서비스", category: "ai_service", displayOrder: 1 },
      { id: FN_SAP, teamId: TEAM_ID, name: "SAP ERP", category: "sap_based", displayOrder: 2 },
      { id: FN_INACTIVE, teamId: TEAM_ID, name: "비활성 기능", category: "hybrid", isActive: 0, displayOrder: 3 },
      { id: "fn-other", teamId: TEAM_OTHER, name: "기타기능", category: "hybrid", displayOrder: 1 },
    ])
    .run();

  // ── Topics (Cell-Topic 연결 테스트용) ──
  db.insert(topics)
    .values([
      { id: TOPIC_A, teamId: TEAM_ID, name: "AI 트렌드", createdBy: USER_A },
      { id: TOPIC_B, teamId: TEAM_ID, name: "디지털 전환", createdBy: USER_B },
    ])
    .run();
});

// ============================================================================
// 1. Industry CRUD
// ============================================================================

describe("MatrixService", () => {
  describe("Industry CRUD", () => {
    it("getIndustries — 활성(isActive=1) Industry만 displayOrder 정렬로 반환", async () => {
      const result = await service.getIndustries(TEAM_ID);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(IND_RETAIL); // displayOrder=1
      expect(result[1].id).toBe(IND_FINTECH); // displayOrder=2
      // 비활성 제외 확인
      expect(result.find((i) => i.id === IND_HEALTH)).toBeUndefined();
    });

    it("getIndustries — 다른 팀 데이터 격리", async () => {
      const result = await service.getIndustries(TEAM_ID);
      expect(result.find((i) => i.id === "ind-other")).toBeUndefined();
    });

    it("createIndustry — 생성 후 Industry 반환", async () => {
      const created = await service.createIndustry(TEAM_ID, {
        id: "ind-new",
        name: "신규 산업",
        nameEn: "New Industry",
        displayOrder: 10,
        strategicWeight: 3.0,
      });

      expect(created).not.toBeNull();
      expect(created!.id).toBe("ind-new");
      expect(created!.name).toBe("신규 산업");
      expect(created!.teamId).toBe(TEAM_ID);
      expect(created!.strategicWeight).toBe(3.0);
      expect(created!.isActive).toBe(1);
    });

    it("createIndustry — 기본값 적용 (displayOrder=0, strategicWeight=1.0)", async () => {
      const created = await service.createIndustry(TEAM_ID, {
        id: "ind-defaults",
        name: "기본값 산업",
      });

      expect(created!.displayOrder).toBe(0);
      expect(created!.strategicWeight).toBe(1.0);
    });

    it("updateIndustry — 부분 업데이트 성공", async () => {
      const updated = await service.updateIndustry(IND_RETAIL, {
        name: "유통/리테일(수정)",
        strategicWeight: 4.0,
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("유통/리테일(수정)");
      expect(updated!.strategicWeight).toBe(4.0);
      // 변경하지 않은 필드 유지
      expect(updated!.nameEn).toBe("Retail");
    });

    it("updateIndustry — 빈 updates면 null 반환", async () => {
      const result = await service.updateIndustry(IND_RETAIL, {});
      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // 2. Function CRUD
  // ============================================================================

  describe("Function CRUD", () => {
    it("getFunctions — 활성(isActive=1) Function만 displayOrder 정렬로 반환", async () => {
      const result = await service.getFunctions(TEAM_ID);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(FN_AI); // displayOrder=1
      expect(result[1].id).toBe(FN_SAP); // displayOrder=2
      expect(result.find((f) => f.id === FN_INACTIVE)).toBeUndefined();
    });

    it("getFunctions — 다른 팀 데이터 격리", async () => {
      const result = await service.getFunctions(TEAM_ID);
      expect(result.find((f) => f.id === "fn-other")).toBeUndefined();
    });

    it("createFunction — 생성 후 Function 반환", async () => {
      const created = await service.createFunction(TEAM_ID, {
        id: "fn-new",
        name: "신규 기능",
        nameEn: "New Function",
        category: "hybrid",
        displayOrder: 10,
      });

      expect(created).not.toBeNull();
      expect(created!.id).toBe("fn-new");
      expect(created!.name).toBe("신규 기능");
      expect(created!.category).toBe("hybrid");
      expect(created!.isActive).toBe(1);
    });

    it("updateFunction — 부분 업데이트 성공", async () => {
      const updated = await service.updateFunction(FN_AI, {
        name: "AI 서비스(수정)",
        category: "hybrid",
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("AI 서비스(수정)");
      expect(updated!.category).toBe("hybrid");
    });

    it("updateFunction — 빈 updates면 null 반환", async () => {
      const result = await service.updateFunction(FN_SAP, {});
      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // 3. Cell CRUD
  // ============================================================================

  describe("Cell CRUD", () => {
    it("createCell — cellId 자동 생성 (industryId_functionId)", async () => {
      const cell = await service.createCell({
        teamId: TEAM_ID,
        industryId: IND_RETAIL,
        functionId: FN_AI,
        createdBy: USER_A,
      });

      expect(cell).not.toBeNull();
      expect(cell!.id).toBe(`${IND_RETAIL}_${FN_AI}`);
      expect(cell!.teamId).toBe(TEAM_ID);
      expect(cell!.timeHorizon).toBe("short"); // 기본값
      expect(cell!.status).toBe("active"); // 기본값
    });

    it("createCell — 두 번째 Cell 생성", async () => {
      const cell = await service.createCell({
        teamId: TEAM_ID,
        industryId: IND_FINTECH,
        functionId: FN_SAP,
        timeHorizon: "mid",
        status: "watching",
        description: "핀테크 SAP 셀",
        createdBy: USER_B,
      });

      expect(cell!.id).toBe(`${IND_FINTECH}_${FN_SAP}`);
      expect(cell!.timeHorizon).toBe("mid");
      expect(cell!.status).toBe("watching");
      expect(cell!.description).toBe("핀테크 SAP 셀");
    });

    it("getCells — teamId로 전체 조회", async () => {
      const cells = await service.getCells(TEAM_ID);
      expect(cells.length).toBeGreaterThanOrEqual(2);
      expect(cells.every((c) => c.teamId === TEAM_ID)).toBe(true);
    });

    it("getCells — industryId 필터", async () => {
      const cells = await service.getCells(TEAM_ID, { industryId: IND_RETAIL });
      expect(cells.every((c) => c.industryId === IND_RETAIL)).toBe(true);
      expect(cells.length).toBeGreaterThanOrEqual(1);
    });

    it("getCells — status 필터", async () => {
      const cells = await service.getCells(TEAM_ID, { status: "watching" });
      expect(cells.every((c) => c.status === "watching")).toBe(true);
    });

    it("getCells — 복합 필터 (industryId + timeHorizon)", async () => {
      const cells = await service.getCells(TEAM_ID, {
        industryId: IND_FINTECH,
        timeHorizon: "mid",
      });
      expect(cells).toHaveLength(1);
      expect(cells[0].id).toBe(`${IND_FINTECH}_${FN_SAP}`);
    });

    it("getCell — JOIN으로 industryName/functionName 포함", async () => {
      const cell = await service.getCell(`${IND_RETAIL}_${FN_AI}`);

      expect(cell).not.toBeNull();
      expect(cell!.id).toBe(`${IND_RETAIL}_${FN_AI}`);
      // updateIndustry에서 이름이 수정되었으므로 수정된 이름 확인
      expect(cell!.industryName).toBe("유통/리테일(수정)");
      // updateFunction에서 이름이 수정되었으므로 수정된 이름 확인
      expect(cell!.functionName).toBe("AI 서비스(수정)");
    });

    it("getCell — 존재하지 않는 cellId → null", async () => {
      const cell = await service.getCell("non-existent-cell");
      expect(cell).toBeNull();
    });

    it("updateCell — 부분 업데이트 성공", async () => {
      const cellId = `${IND_RETAIL}_${FN_AI}`;
      const updated = await service.updateCell(cellId, {
        timeHorizon: "long",
        priority: 3,
        description: "업데이트된 설명",
      });

      expect(updated).not.toBeNull();
      expect(updated!.timeHorizon).toBe("long");
      expect(updated!.priority).toBe(3);
      expect(updated!.description).toBe("업데이트된 설명");
    });

    it("updateCell — 빈 updates면 null 반환", async () => {
      const result = await service.updateCell(`${IND_RETAIL}_${FN_AI}`, {});
      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // 4. Cell-Topic 연결
  // ============================================================================

  describe("Cell-Topic 연결", () => {
    const CELL_ID = `${IND_RETAIL}_${FN_AI}`;

    it("linkCellToTopic — 기본 연결 (relevance 기본값 1.0)", async () => {
      const link = await service.linkCellToTopic(CELL_ID, TOPIC_A, USER_A);

      expect(link).not.toBeNull();
      expect(link!.cellId).toBe(CELL_ID);
      expect(link!.topicId).toBe(TOPIC_A);
      expect(link!.relevance).toBe(1.0);
      expect(link!.linkedBy).toBe(USER_A);
    });

    it("linkCellToTopic — relevance/note 지정", async () => {
      const link = await service.linkCellToTopic(
        CELL_ID,
        TOPIC_B,
        USER_B,
        0.7,
        "관련도 메모",
      );

      expect(link!.relevance).toBe(0.7);
      expect(link!.note).toBe("관련도 메모");
    });

    it("getCellTopics — JOIN으로 topicName 포함", async () => {
      const cellTopics = await service.getCellTopics(CELL_ID);

      expect(cellTopics).toHaveLength(2);
      const names = cellTopics.map((ct) => ct.topicName);
      expect(names).toContain("AI 트렌드");
      expect(names).toContain("디지털 전환");
    });

    it("getTopicCells — JOIN으로 industryName/functionName 포함", async () => {
      const topicCells = await service.getTopicCells(TOPIC_A);

      expect(topicCells).toHaveLength(1);
      expect(topicCells[0].cellId).toBe(CELL_ID);
      expect(topicCells[0].industryName).toBe("유통/리테일(수정)");
      expect(topicCells[0].functionName).toBe("AI 서비스(수정)");
    });

    it("unlinkCellFromTopic — 연결 해제 후 getCellTopics에서 제외", async () => {
      await service.unlinkCellFromTopic(CELL_ID, TOPIC_B);

      const cellTopics = await service.getCellTopics(CELL_ID);
      expect(cellTopics).toHaveLength(1);
      expect(cellTopics[0].topicId).toBe(TOPIC_A);
    });
  });

  // ============================================================================
  // 5. Heatmap
  // ============================================================================

  describe("Heatmap", () => {
    it("getHeatmapData — industries/functions/cells 포함", async () => {
      const heatmap = await service.getHeatmapData(TEAM_ID);

      // 활성 industries만 (비활성 IND_HEALTH 제외)
      expect(heatmap.industries.length).toBeGreaterThanOrEqual(2);
      expect(heatmap.industries.find((i) => i.id === IND_HEALTH)).toBeUndefined();

      // 활성 functions만 (비활성 FN_INACTIVE 제외)
      expect(heatmap.functions.length).toBeGreaterThanOrEqual(2);
      expect(heatmap.functions.find((f) => f.id === FN_INACTIVE)).toBeUndefined();

      // cells 존재
      expect(heatmap.cells.length).toBeGreaterThanOrEqual(2);

      // period는 YYYY-MM 형식
      expect(heatmap.period).toMatch(/^\d{4}-\d{2}$/);
    });

    it("getHeatmapData — period 지정 시 해당 기간 사용", async () => {
      const heatmap = await service.getHeatmapData(TEAM_ID, "2026-01");
      expect(heatmap.period).toBe("2026-01");
    });

    it("getHeatmapData — consensusScore LEFT JOIN (스코어 없으면 null)", async () => {
      const heatmap = await service.getHeatmapData(TEAM_ID, "2099-01");

      // 미래 기간이라 consensus 없음 → compositeScore=null
      for (const cell of heatmap.cells) {
        expect(cell.compositeScore).toBeNull();
        expect(cell.delta).toBeNull();
      }
    });

    it("getHeatmapData — consensusScore 있을 때 delta 계산", async () => {
      const cellId = `${IND_RETAIL}_${FN_AI}`;
      const period = "2026-03";

      // consensus score 시드
      db.insert(consensusScores)
        .values({
          cellId,
          scorePeriod: period,
          clevelScore: 4.0,
          executionScore: 3.5,
          compositeScore: 3.8,
          prevComposite: 3.0,
          status: "confirmed",
          participantCount: 3,
        })
        .run();

      const heatmap = await service.getHeatmapData(TEAM_ID, period);
      const target = heatmap.cells.find((c) => c.cellId === cellId);

      expect(target).toBeDefined();
      expect(target!.compositeScore).toBe(3.8);
      expect(target!.delta).toBeCloseTo(0.8); // 3.8 - 3.0
      expect(target!.scoreStatus).toBe("confirmed");
    });
  });
});
