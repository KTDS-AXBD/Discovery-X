/**
 * ScoringService 단위 테스트 (실 DB 기반)
 * 대상: app/lib/services/scoring.service.ts
 *
 * 메서드 목록:
 * 1. submitScore     — 개별 스코어 입력 (UPSERT)
 * 2. getScoresByCell — cellId 기반 조회
 * 3. getMyScores     — userId 기반 조회
 * 4. calculateConsensus — 합의 스코어 계산
 * 5. confirmConsensus   — 합의 확정
 * 6. getConfig / updateConfig — 설정 관리
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "tests/helpers/db";
import type { DB } from "~/db";
import { ScoringService } from "~/features/matrix/service/scoring.service";
import {
  industries,
  functions,
  matrixCells,
} from "~/features/matrix/db/schema";
import { users, tenants, tenantMembers } from "~/db/schema";
import type { IndividualScoreInput } from "~/features/matrix/types";

// ── 상수 ──
const TEAM_ID = "t-scoring-test";
const USER_A = "user-score-a";
const USER_B = "user-score-b";
const IND_ID = "ind-score-1";
const FN_ID = "fn-score-1";
const CELL_ID = `${IND_ID}_${FN_ID}`;
const PERIOD = "2026-02";

/** 기본 스코어 입력 헬퍼 (모두 3.0 기준) */
function makeInput(
  overrides?: Partial<IndividualScoreInput>,
): IndividualScoreInput {
  return {
    strategicFit: 3.0,
    profitability: 3.0,
    marketScalability: 3.0,
    brandImpact: 3.0,
    roiExpectation: 3.0,
    feasibility: 3.0,
    techDifficulty: 3.0,
    referenceExists: 3.0,
    resourceAvailable: 3.0,
    riskLevel: 3.0,
    ...overrides,
  };
}

let db: TestDB;
let service: ScoringService;

beforeEach(() => {
  db = createTestDb();
  service = new ScoringService(db as unknown as DB);

  // ── 기본 데이터 세팅 ──
  db.insert(users)
    .values([
      { id: USER_A, email: "scorea@test.com", name: "스코어A", role: "admin" },
      { id: USER_B, email: "scoreb@test.com", name: "스코어B", role: "user" },
    ])
    .run();

  db.insert(tenants)
    .values([
      {
        id: TEAM_ID,
        name: "Scoring Test",
        slug: "scoring-test",
        ownerUserId: USER_A,
      },
    ])
    .run();

  db.insert(tenantMembers)
    .values([
      { id: "tm-sc-a", tenantId: TEAM_ID, userId: USER_A },
      { id: "tm-sc-b", tenantId: TEAM_ID, userId: USER_B },
    ])
    .run();

  db.insert(industries)
    .values([
      {
        id: IND_ID,
        teamId: TEAM_ID,
        name: "테스트산업",
        strategicWeight: 1.0,
        displayOrder: 1,
      },
    ])
    .run();

  db.insert(functions)
    .values([
      {
        id: FN_ID,
        teamId: TEAM_ID,
        name: "테스트기능",
        category: "hybrid",
        displayOrder: 1,
      },
    ])
    .run();

  db.insert(matrixCells)
    .values([
      {
        id: CELL_ID,
        teamId: TEAM_ID,
        industryId: IND_ID,
        functionId: FN_ID,
        createdBy: USER_A,
      },
    ])
    .run();
});

describe("ScoringService", () => {
  // ══════════════════════════════════════════════
  // 1. submitScore
  // ══════════════════════════════════════════════
  describe("submitScore", () => {
    it("신규 스코어 INSERT — clevelAvg/executionAvg 자동 계산", async () => {
      const result = await service.submitScore(
        CELL_ID,
        USER_A,
        PERIOD,
        makeInput(),
      );

      // clevelAvg = (3+3+3+3+3)/5 = 3.0
      expect(result.clevelAvg).toBeCloseTo(3.0);
      // executionAvg = (3 + (6-3) + 3 + 3 + (6-3))/5 = 3.0
      expect(result.executionAvg).toBeCloseTo(3.0);
      expect(result.cellId).toBe(CELL_ID);
      expect(result.scoredBy).toBe(USER_A);
      expect(result.scorePeriod).toBe(PERIOD);
    });

    it("동일 (cellId, scoredBy, period) UPSERT → 기존 값 업데이트", async () => {
      await service.submitScore(CELL_ID, USER_A, PERIOD, makeInput());

      const updated = await service.submitScore(
        CELL_ID,
        USER_A,
        PERIOD,
        makeInput({ strategicFit: 5.0, profitability: 4.0 }),
      );

      expect(updated.strategicFit).toBe(5.0);
      expect(updated.profitability).toBe(4.0);
      // clevelAvg = (5+4+3+3+3)/5 = 3.6
      expect(updated.clevelAvg).toBeCloseTo(3.6);
    });

    it("note 필드 null 허용", async () => {
      const result = await service.submitScore(
        CELL_ID,
        USER_A,
        PERIOD,
        makeInput(),
      );
      expect(result.note).toBeNull();
    });

    it("반환값에 id, createdAt 포함", async () => {
      const result = await service.submitScore(
        CELL_ID,
        USER_A,
        PERIOD,
        makeInput(),
      );

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe("number");
      expect(result.createdAt).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════
  // 2. getScoresByCell / getMyScores
  // ══════════════════════════════════════════════
  describe("getScoresByCell / getMyScores", () => {
    it("cellId로 조회 — 여러 사용자 스코어 반환", async () => {
      await service.submitScore(CELL_ID, USER_A, PERIOD, makeInput());
      await service.submitScore(
        CELL_ID,
        USER_B,
        PERIOD,
        makeInput({ strategicFit: 4.0 }),
      );

      const scores = await service.getScoresByCell(CELL_ID);

      expect(scores).toHaveLength(2);
      const scorers = scores.map((s) => s.scoredBy);
      expect(scorers).toContain(USER_A);
      expect(scorers).toContain(USER_B);
    });

    it("period 필터 적용", async () => {
      await service.submitScore(CELL_ID, USER_A, "2026-01", makeInput());
      await service.submitScore(CELL_ID, USER_A, "2026-02", makeInput());

      const jan = await service.getScoresByCell(CELL_ID, "2026-01");
      expect(jan).toHaveLength(1);
      expect(jan[0].scorePeriod).toBe("2026-01");
    });

    it("getMyScores — userId 기반 조회", async () => {
      await service.submitScore(CELL_ID, USER_A, PERIOD, makeInput());
      await service.submitScore(CELL_ID, USER_B, PERIOD, makeInput());

      const myScores = await service.getMyScores(USER_A);

      expect(myScores).toHaveLength(1);
      expect(myScores[0].scoredBy).toBe(USER_A);
    });
  });

  // ══════════════════════════════════════════════
  // 3. calculateConsensus
  // ══════════════════════════════════════════════
  describe("calculateConsensus", () => {
    it("스코어 2개 → 합의 스코어 계산 (clevelScore, executionScore, compositeScore)", async () => {
      // USER_A: all 3.0 → clevelAvg=3.0, executionAvg=3.0
      await service.submitScore(CELL_ID, USER_A, PERIOD, makeInput());
      // USER_B: strategicFit=5, profitability=5 → clevelAvg=3.8
      await service.submitScore(
        CELL_ID,
        USER_B,
        PERIOD,
        makeInput({ strategicFit: 5.0, profitability: 5.0 }),
      );

      const consensus = await service.calculateConsensus(CELL_ID, PERIOD);

      expect(consensus).not.toBeNull();
      expect(consensus!.cellId).toBe(CELL_ID);
      expect(consensus!.scorePeriod).toBe(PERIOD);
      expect(consensus!.participantCount).toBe(2);
      expect(consensus!.status).toBe("draft");
      // clevelScore = avg(3.0, 3.8) = 3.4
      expect(consensus!.clevelScore).toBeCloseTo(3.4);
      // executionScore = avg(3.0, 3.0) = 3.0
      expect(consensus!.executionScore).toBeCloseTo(3.0);
      // compositeScore = 3.4*0.4 + 3.0*0.4 + 0*0.2 = 2.56 (* 1.0 indWeight)
      expect(consensus!.compositeScore).toBeCloseTo(2.56);
    });

    it("compositeScore CLAMP(1.0, 5.0) 검증", async () => {
      // 높은 strategicWeight 산업 추가
      const highIndId = "ind-high-weight";
      const highCellId = `${highIndId}_${FN_ID}`;

      db.insert(industries)
        .values([
          {
            id: highIndId,
            teamId: TEAM_ID,
            name: "고가중산업",
            strategicWeight: 2.0,
            displayOrder: 2,
          },
        ])
        .run();

      db.insert(matrixCells)
        .values([
          {
            id: highCellId,
            teamId: TEAM_ID,
            industryId: highIndId,
            functionId: FN_ID,
            createdBy: USER_A,
          },
        ])
        .run();

      // 최고점 입력: clevelAvg=5.0, executionAvg=5.0
      const maxInput = makeInput({
        strategicFit: 5,
        profitability: 5,
        marketScalability: 5,
        brandImpact: 5,
        roiExpectation: 5,
        feasibility: 5,
        techDifficulty: 1,
        referenceExists: 5,
        resourceAvailable: 5,
        riskLevel: 1,
      });
      await service.submitScore(highCellId, USER_A, PERIOD, maxInput);
      await service.submitScore(highCellId, USER_B, PERIOD, maxInput);

      const consensus = await service.calculateConsensus(highCellId, PERIOD);

      // rawComposite = 5*0.4 + 5*0.4 + 0*0.2 = 4.0
      // * strategicWeight 2.0 = 8.0 → CLAMP to 5.0
      expect(consensus!.compositeScore).toBe(5.0);
    });

    it("기존 합의 있으면 UPDATE (draft 유지)", async () => {
      // 첫 계산
      await service.submitScore(CELL_ID, USER_A, PERIOD, makeInput());
      const first = await service.calculateConsensus(CELL_ID, PERIOD);
      expect(first!.status).toBe("draft");

      // 두 번째 스코어 추가 후 재계산
      await service.submitScore(
        CELL_ID,
        USER_B,
        PERIOD,
        makeInput({ strategicFit: 5.0 }),
      );
      const second = await service.calculateConsensus(CELL_ID, PERIOD);

      expect(second!.status).toBe("draft");
      expect(second!.participantCount).toBe(2);
      // ID 동일 → UPDATE 확인
      expect(second!.id).toBe(first!.id);
    });

    it("confirmed 상태에서 재계산 시 revised로 변경", async () => {
      // 2명 스코어 → 합의 → 확정
      await service.submitScore(CELL_ID, USER_A, PERIOD, makeInput());
      await service.submitScore(CELL_ID, USER_B, PERIOD, makeInput());
      await service.calculateConsensus(CELL_ID, PERIOD);
      await service.confirmConsensus(CELL_ID, PERIOD, USER_A);

      // 재계산 → revised
      const revised = await service.calculateConsensus(CELL_ID, PERIOD);
      expect(revised!.status).toBe("revised");
    });
  });

  // ══════════════════════════════════════════════
  // 4. confirmConsensus
  // ══════════════════════════════════════════════
  describe("confirmConsensus", () => {
    it("최소 투표자 수 미달 시 에러 (minVotersForConfirm=2, participantCount=1)", async () => {
      await service.submitScore(CELL_ID, USER_A, PERIOD, makeInput());
      await service.calculateConsensus(CELL_ID, PERIOD);

      await expect(
        service.confirmConsensus(CELL_ID, PERIOD, USER_A),
      ).rejects.toThrow("최소 2명의 참여자가 필요합니다");
    });

    it("정상 확정 — status=confirmed, confirmedBy/confirmedAt 기록", async () => {
      await service.submitScore(CELL_ID, USER_A, PERIOD, makeInput());
      await service.submitScore(CELL_ID, USER_B, PERIOD, makeInput());
      await service.calculateConsensus(CELL_ID, PERIOD);

      const confirmed = await service.confirmConsensus(
        CELL_ID,
        PERIOD,
        USER_A,
        "합의 완료",
      );

      expect(confirmed).not.toBeNull();
      expect(confirmed!.status).toBe("confirmed");
      expect(confirmed!.confirmedBy).toBe(USER_A);
      expect(confirmed!.confirmedAt).toBeDefined();
      expect(confirmed!.rationale).toBe("합의 완료");
    });
  });

  // ══════════════════════════════════════════════
  // 5. getConfig / updateConfig
  // ══════════════════════════════════════════════
  describe("getConfig / updateConfig", () => {
    it("설정 없으면 DEFAULT_WEIGHTS 반환", async () => {
      const config = await service.getConfig(TEAM_ID);

      expect(config.weightClevel).toBe(0.4);
      expect(config.weightExecution).toBe(0.4);
      expect(config.weightSignal).toBe(0.2);
      expect(config.signalDecayDays).toBe(90);
      expect(config.minSignalsForAdjust).toBe(3);
      expect(config.maxSignalAdjustment).toBe(2.0);
      expect(config.applyIndustryWeight).toBe(true);
      expect(config.minVotersForConfirm).toBe(2);
      expect(config.deviationAlertThreshold).toBe(1.5);
    });

    it("updateConfig → getConfig 반영 확인", async () => {
      await service.updateConfig(TEAM_ID, "weight_clevel", 0.5, USER_A);
      await service.updateConfig(TEAM_ID, "weight_execution", 0.3, USER_A);

      const config = await service.getConfig(TEAM_ID);

      expect(config.weightClevel).toBe(0.5);
      expect(config.weightExecution).toBe(0.3);
      // 변경하지 않은 값은 기본값 유지
      expect(config.weightSignal).toBe(0.2);
    });
  });
});
