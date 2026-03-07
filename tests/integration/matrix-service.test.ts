import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../helpers/db";
import { users, topics } from "~/db";
import { MatrixService } from "~/features/matrix/service/matrix.service";
import { ScoringService } from "~/features/matrix/service/scoring.service";
import type { IndividualScoreInput } from "~/features/matrix/types";

// ─── 테스트용 상수 ──────────────────────────────────────────────────────

const TEAM_ID = "team1";
const PERIOD = "2026-02";

function makeScoreInput(overrides?: Partial<IndividualScoreInput>): IndividualScoreInput {
  return {
    strategicFit: 4.0,
    profitability: 3.5,
    marketScalability: 4.0,
    brandImpact: 3.0,
    roiExpectation: 3.5,
    feasibility: 4.0,
    techDifficulty: 2.0,
    referenceExists: 3.5,
    resourceAvailable: 4.0,
    riskLevel: 2.0,
    ...overrides,
  };
}

describe("MatrixService", () => {
  let db: TestDB;
  let matrixSvc: MatrixService;

  beforeEach(() => {
    db = createTestDb();
    matrixSvc = new MatrixService(db as never);

    // 시드 데이터
    db.insert(users)
      .values([
        { id: "u1", email: "u1@test.com", name: "User 1", role: "user" },
        { id: "u2", email: "u2@test.com", name: "User 2", role: "user" },
      ])
      .run();
  });

  // ─── Industry CRUD ───────────────────────────────────────────────────

  describe("getIndustries", () => {
    it("산업 목록을 displayOrder 순으로 조회한다", async () => {
      await matrixSvc.createIndustry(TEAM_ID, {
        id: "ind-b",
        name: "헬스케어",
        displayOrder: 2,
      });
      await matrixSvc.createIndustry(TEAM_ID, {
        id: "ind-a",
        name: "자동차",
        displayOrder: 1,
      });

      const list = await matrixSvc.getIndustries(TEAM_ID);

      expect(list).toHaveLength(2);
      expect(list[0].name).toBe("자동차");
      expect(list[1].name).toBe("헬스케어");
    });

    it("비활성 산업은 제외된다", async () => {
      const ind = await matrixSvc.createIndustry(TEAM_ID, {
        id: "ind-x",
        name: "레거시",
      });
      await matrixSvc.updateIndustry("ind-x", { isActive: 0 });

      const list = await matrixSvc.getIndustries(TEAM_ID);
      expect(list).toHaveLength(0);
    });
  });

  // ─── Function CRUD ───────────────────────────────────────────────────

  describe("getFunctions", () => {
    it("기능 목록을 displayOrder 순으로 조회한다", async () => {
      await matrixSvc.createFunction(TEAM_ID, {
        id: "fn-b",
        name: "AI 서비스",
        category: "ai_service",
        displayOrder: 2,
      });
      await matrixSvc.createFunction(TEAM_ID, {
        id: "fn-a",
        name: "컨설팅",
        category: "sap_based",
        displayOrder: 1,
      });

      const list = await matrixSvc.getFunctions(TEAM_ID);

      expect(list).toHaveLength(2);
      expect(list[0].name).toBe("컨설팅");
      expect(list[1].name).toBe("AI 서비스");
    });
  });

  // ─── Cell CRUD ───────────────────────────────────────────────────────

  describe("createCell / getCell", () => {
    beforeEach(async () => {
      await matrixSvc.createIndustry(TEAM_ID, { id: "ind-auto", name: "자동차" });
      await matrixSvc.createFunction(TEAM_ID, {
        id: "fn-ai",
        name: "AI 서비스",
        category: "ai_service",
      });
    });

    it("Cell을 생성한다 (industry+function 교차)", async () => {
      const cell = await matrixSvc.createCell({
        teamId: TEAM_ID,
        industryId: "ind-auto",
        functionId: "fn-ai",
        createdBy: "u1",
      });

      expect(cell).not.toBeNull();
      expect(cell!.id).toBe("ind-auto_fn-ai");
      expect(cell!.status).toBe("active");
      expect(cell!.timeHorizon).toBe("short");
    });

    it("Cell 상세 조회 시 industry/function 이름이 포함된다", async () => {
      await matrixSvc.createCell({
        teamId: TEAM_ID,
        industryId: "ind-auto",
        functionId: "fn-ai",
        createdBy: "u1",
      });

      const detail = await matrixSvc.getCell("ind-auto_fn-ai");

      expect(detail).not.toBeNull();
      expect(detail!.industryName).toBe("자동차");
      expect(detail!.functionName).toBe("AI 서비스");
    });

    it("존재하지 않는 Cell은 null을 반환한다", async () => {
      const result = await matrixSvc.getCell("nonexistent");
      expect(result).toBeNull();
    });
  });

  // ─── Heatmap ─────────────────────────────────────────────────────────

  describe("getHeatmapData", () => {
    it("히트맵 데이터를 period 기준으로 반환한다", async () => {
      await matrixSvc.createIndustry(TEAM_ID, { id: "ind-1", name: "산업A" });
      await matrixSvc.createFunction(TEAM_ID, {
        id: "fn-1",
        name: "기능A",
        category: "hybrid",
      });
      await matrixSvc.createCell({
        teamId: TEAM_ID,
        industryId: "ind-1",
        functionId: "fn-1",
        createdBy: "u1",
      });

      const heatmap = await matrixSvc.getHeatmapData(TEAM_ID, PERIOD);

      expect(heatmap.industries).toHaveLength(1);
      expect(heatmap.functions).toHaveLength(1);
      expect(heatmap.cells).toHaveLength(1);
      expect(heatmap.period).toBe(PERIOD);
      // consensus 스코어가 없으므로 null
      expect(heatmap.cells[0].compositeScore).toBeNull();
    });
  });

  // ─── Cell-Topic 연결 ─────────────────────────────────────────────────

  describe("linkCellToTopic", () => {
    beforeEach(async () => {
      await matrixSvc.createIndustry(TEAM_ID, { id: "ind-1", name: "산업A" });
      await matrixSvc.createFunction(TEAM_ID, {
        id: "fn-1",
        name: "기능A",
        category: "hybrid",
      });
      await matrixSvc.createCell({
        teamId: TEAM_ID,
        industryId: "ind-1",
        functionId: "fn-1",
        createdBy: "u1",
      });

      db.insert(topics)
        .values({
          id: "t1",
          teamId: TEAM_ID,
          name: "AI Research",
          createdBy: "u1",
        })
        .run();
    });

    it("Cell-Topic 연결을 생성한다", async () => {
      const link = await matrixSvc.linkCellToTopic(
        "ind-1_fn-1",
        "t1",
        "u1",
        0.8,
        "높은 관련성",
      );

      expect(link).not.toBeNull();
      expect(link!.cellId).toBe("ind-1_fn-1");
      expect(link!.topicId).toBe("t1");
      expect(link!.relevance).toBe(0.8);
      expect(link!.note).toBe("높은 관련성");
    });

    it("연결된 Topic 목록을 조회한다", async () => {
      await matrixSvc.linkCellToTopic("ind-1_fn-1", "t1", "u1");

      const cellTopics = await matrixSvc.getCellTopics("ind-1_fn-1");

      expect(cellTopics).toHaveLength(1);
      expect(cellTopics[0].topicName).toBe("AI Research");
    });
  });
});

// ============================================================================
// ScoringService
// ============================================================================

describe("ScoringService", () => {
  let db: TestDB;
  let matrixSvc: MatrixService;
  let scoringSvc: ScoringService;

  beforeEach(async () => {
    db = createTestDb();
    matrixSvc = new MatrixService(db as never);
    scoringSvc = new ScoringService(db as never);

    // 시드 데이터
    db.insert(users)
      .values([
        { id: "u1", email: "u1@test.com", name: "User 1", role: "user" },
        { id: "u2", email: "u2@test.com", name: "User 2", role: "user" },
        { id: "u3", email: "u3@test.com", name: "User 3", role: "user" },
      ])
      .run();

    // industry + function + cell
    await matrixSvc.createIndustry(TEAM_ID, {
      id: "ind-auto",
      name: "자동차",
      strategicWeight: 1.5,
    });
    await matrixSvc.createFunction(TEAM_ID, {
      id: "fn-ai",
      name: "AI 서비스",
      category: "ai_service",
    });
    await matrixSvc.createCell({
      teamId: TEAM_ID,
      industryId: "ind-auto",
      functionId: "fn-ai",
      createdBy: "u1",
    });
  });

  // ─── submitScore ─────────────────────────────────────────────────────

  describe("submitScore", () => {
    it("개인 스코어를 제출한다 (10항목)", async () => {
      const score = await scoringSvc.submitScore(
        "ind-auto_fn-ai",
        "u1",
        PERIOD,
        makeScoreInput(),
      );

      expect(score.cellId).toBe("ind-auto_fn-ai");
      expect(score.scoredBy).toBe("u1");
      expect(score.scorePeriod).toBe(PERIOD);
      expect(score.strategicFit).toBe(4.0);
      expect(score.techDifficulty).toBe(2.0);
    });

    it("C-Level/Execution 평균이 자동 계산된다", async () => {
      const input = makeScoreInput({
        strategicFit: 5.0,
        profitability: 5.0,
        marketScalability: 5.0,
        brandImpact: 5.0,
        roiExpectation: 5.0,
        feasibility: 5.0,
        techDifficulty: 1.0, // 역수: 6 - 1 = 5
        referenceExists: 5.0,
        resourceAvailable: 5.0,
        riskLevel: 1.0, // 역수: 6 - 1 = 5
      });

      const score = await scoringSvc.submitScore(
        "ind-auto_fn-ai",
        "u1",
        PERIOD,
        input,
      );

      // C-Level: (5+5+5+5+5)/5 = 5.0
      expect(score.clevelAvg).toBe(5.0);
      // Execution: (5+(6-1)+5+5+(6-1))/5 = (5+5+5+5+5)/5 = 5.0
      expect(score.executionAvg).toBe(5.0);
    });

    it("같은 사용자가 같은 기간에 다시 제출하면 UPSERT된다", async () => {
      await scoringSvc.submitScore(
        "ind-auto_fn-ai",
        "u1",
        PERIOD,
        makeScoreInput({ strategicFit: 3.0 }),
      );

      const updated = await scoringSvc.submitScore(
        "ind-auto_fn-ai",
        "u1",
        PERIOD,
        makeScoreInput({ strategicFit: 5.0 }),
      );

      expect(updated.strategicFit).toBe(5.0);

      // DB에 레코드 1개만 존재 확인
      const scores = await scoringSvc.getScoresByCell("ind-auto_fn-ai", PERIOD);
      expect(scores).toHaveLength(1);
    });
  });

  // ─── calculateConsensus ──────────────────────────────────────────────

  describe("calculateConsensus", () => {
    it("합의 스코어를 가중 평균으로 계산한다", async () => {
      await scoringSvc.submitScore(
        "ind-auto_fn-ai",
        "u1",
        PERIOD,
        makeScoreInput(),
      );
      await scoringSvc.submitScore(
        "ind-auto_fn-ai",
        "u2",
        PERIOD,
        makeScoreInput({ strategicFit: 5.0, feasibility: 5.0 }),
      );

      const consensus = await scoringSvc.calculateConsensus(
        "ind-auto_fn-ai",
        PERIOD,
      );

      expect(consensus).not.toBeNull();
      expect(consensus!.cellId).toBe("ind-auto_fn-ai");
      expect(consensus!.status).toBe("draft");
      expect(consensus!.participantCount).toBe(2);
      expect(consensus!.compositeScore).toBeGreaterThan(0);
      expect(consensus!.compositeScore).toBeLessThanOrEqual(5.0);
    });

    it("스코어가 없으면 null을 반환한다", async () => {
      const result = await scoringSvc.calculateConsensus(
        "ind-auto_fn-ai",
        PERIOD,
      );
      expect(result).toBeNull();
    });
  });

  // ─── confirmConsensus ────────────────────────────────────────────────

  describe("confirmConsensus", () => {
    it("최소 인원 충족 시 합의를 확정한다", async () => {
      // 2명 스코어 제출 (기본 minVotersForConfirm = 2)
      await scoringSvc.submitScore(
        "ind-auto_fn-ai",
        "u1",
        PERIOD,
        makeScoreInput(),
      );
      await scoringSvc.submitScore(
        "ind-auto_fn-ai",
        "u2",
        PERIOD,
        makeScoreInput(),
      );
      await scoringSvc.calculateConsensus("ind-auto_fn-ai", PERIOD);

      const confirmed = await scoringSvc.confirmConsensus(
        "ind-auto_fn-ai",
        PERIOD,
        "u1",
        "전략적 중요도 확인",
      );

      expect(confirmed).not.toBeNull();
      expect(confirmed!.status).toBe("confirmed");
      expect(confirmed!.confirmedBy).toBe("u1");
      expect(confirmed!.rationale).toBe("전략적 중요도 확인");
    });

    it("최소 인원 미달 시 에러를 던진다", async () => {
      // 1명만 제출 (최소 2명 필요)
      await scoringSvc.submitScore(
        "ind-auto_fn-ai",
        "u1",
        PERIOD,
        makeScoreInput(),
      );
      await scoringSvc.calculateConsensus("ind-auto_fn-ai", PERIOD);

      await expect(
        scoringSvc.confirmConsensus("ind-auto_fn-ai", PERIOD, "u1"),
      ).rejects.toThrow("최소 2명의 참여자가 필요합니다");
    });
  });

  // ─── recalculateAll ──────────────────────────────────────────────────

  describe("recalculateAll", () => {
    it("팀 내 활성 Cell 전체를 배치 재계산한다", async () => {
      // 추가 Cell 생성
      await matrixSvc.createIndustry(TEAM_ID, { id: "ind-health", name: "헬스케어" });
      await matrixSvc.createCell({
        teamId: TEAM_ID,
        industryId: "ind-health",
        functionId: "fn-ai",
        createdBy: "u1",
      });

      // 두 Cell에 스코어 입력
      await scoringSvc.submitScore("ind-auto_fn-ai", "u1", PERIOD, makeScoreInput());
      await scoringSvc.submitScore("ind-health_fn-ai", "u1", PERIOD, makeScoreInput());

      const result = await scoringSvc.recalculateAll(TEAM_ID, PERIOD);

      expect(result.processed).toBe(2);
      expect(result.updated).toBe(2);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ─── getScoreChanges ─────────────────────────────────────────────────

  describe("getScoreChanges", () => {
    it("지정 시각 이후 변동된 스코어를 조회한다", async () => {
      const before = new Date(Date.now() - 60000); // 1분 전

      await scoringSvc.submitScore("ind-auto_fn-ai", "u1", PERIOD, makeScoreInput());
      await scoringSvc.calculateConsensus("ind-auto_fn-ai", PERIOD);

      const changes = await scoringSvc.getScoreChanges(TEAM_ID, before);

      expect(changes).toHaveLength(1);
      expect(changes[0].cellId).toBe("ind-auto_fn-ai");
      expect(changes[0].industryName).toBe("자동차");
      expect(changes[0].functionName).toBe("AI 서비스");
      expect(typeof changes[0].compositeScore).toBe("number");
    });

    it("변동이 없으면 빈 배열을 반환한다", async () => {
      const future = new Date(Date.now() + 3600000); // 1시간 후
      const changes = await scoringSvc.getScoreChanges(TEAM_ID, future);
      expect(changes).toHaveLength(0);
    });
  });
});
