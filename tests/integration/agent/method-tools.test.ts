import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import {
  makeUser,
  makeDiscovery,
  makeExperiment,
  makeEvidence,
  makeMethodRun,
  resetFixtureCounter,
} from "../../helpers/fixtures";
import {
  users,
  discoveries,
  experiments,
  evidence,
  methodRuns,
  assumptions,
} from "~/db";
import {
  listMethodPacks,
  recommendMethods,
  startMethodRun,
  completeMethodRun,
  draftGatePackage,
  getGatePackage,
} from "~/features/chat/agent/tools/method-tools";

// method-tools expects DB (D1-based drizzle) but TestDB is better-sqlite3 based
// The drizzle API surface is compatible, so we cast
function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof listMethodPacks>[0];
}

describe("Agent method-tools", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    // system-agent user is already seeded by 0005 migration
  });

  // ─── listMethodPacks ──────────────────────────────────────────────

  describe("listMethodPacks", () => {
    it("전체 목록 반환 (12개)", async () => {
      const result = JSON.parse(await listMethodPacks(asDB(db), {}));

      expect(result.total).toBe(12);
      expect(result.packs).toHaveLength(12);
      expect(result.packs[0].id).toBe("MP-01");
    });

    it("stage 필터 — DISCOVERY에 해당하는 팩만", async () => {
      const result = JSON.parse(
        await listMethodPacks(asDB(db), { stage: "DISCOVERY" })
      );

      // MP-01, MP-02 (Tier-0) + MP-06 (가치 흐름)
      expect(result.total).toBeGreaterThanOrEqual(3);
      const ids = result.packs.map((p: { id: string }) => p.id);
      expect(ids).toContain("MP-01");
      expect(ids).toContain("MP-02");
      expect(ids).toContain("MP-06");
      // MP-03 (IDEA_CARD only) should not be here
      expect(ids).not.toContain("MP-08");
    });

    it("tier 필터 — Tier-0만", async () => {
      const result = JSON.parse(
        await listMethodPacks(asDB(db), { tier: "Tier-0" })
      );

      expect(result.total).toBe(2);
      const ids = result.packs.map((p: { id: string }) => p.id);
      expect(ids).toContain("MP-01");
      expect(ids).toContain("MP-02");
    });
  });

  // ─── recommendMethods ─────────────────────────────────────────────

  describe("recommendMethods", () => {
    it("DISCOVERY 상태에서 Tier-0 우선 추천 (최대 3개)", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "DISCOVERY" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await recommendMethods(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
      expect(result.recommendations.length).toBeLessThanOrEqual(3);
      // Tier-0 should come first
      expect(result.recommendations[0].tier).toBe("Tier-0");
    });

    it("완료된 팩은 추천에서 제외", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "DISCOVERY" });
      db.insert(discoveries).values(disc).run();

      // MP-01 completed run
      db.insert(methodRuns)
        .values(
          makeMethodRun({
            id: "run-1",
            discoveryId: "disc-1",
            methodPackId: "MP-01",
            status: "COMPLETED",
            completedAt: new Date(),
          })
        )
        .run();

      const result = JSON.parse(
        await recommendMethods(asDB(db), { discoveryId: "disc-1" })
      );

      const ids = result.recommendations.map((r: { id: string }) => r.id);
      expect(ids).not.toContain("MP-01");
      expect(result.completedPacks).toContain("MP-01");
    });

    it("실행 중인 팩은 alreadyRunning=true 표시", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "DISCOVERY" });
      db.insert(discoveries).values(disc).run();

      // MP-02 running
      db.insert(methodRuns)
        .values(
          makeMethodRun({
            id: "run-1",
            discoveryId: "disc-1",
            methodPackId: "MP-02",
            status: "RUNNING",
          })
        )
        .run();

      const result = JSON.parse(
        await recommendMethods(asDB(db), { discoveryId: "disc-1" })
      );

      const mp02 = result.recommendations.find(
        (r: { id: string }) => r.id === "MP-02"
      );
      expect(mp02).toBeTruthy();
      expect(mp02.alreadyRunning).toBe(true);
    });

    it("미존재 Discovery → error", async () => {
      const result = JSON.parse(
        await recommendMethods(asDB(db), { discoveryId: "non-existent" })
      );

      expect(result.error).toBeTruthy();
    });
  });

  // ─── startMethodRun ───────────────────────────────────────────────

  describe("startMethodRun", () => {
    it("정상 생성 — RUNNING status, runId, templatePrompt", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "DISCOVERY" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await startMethodRun(asDB(db), {
          discoveryId: "disc-1",
          methodPackId: "MP-01",
        })
      );

      expect(result.success).toBe(true);
      expect(result.runId).toBeTruthy();
      expect(result.templatePrompt).toBeTruthy();
      expect(result.methodPack.id).toBe("MP-01");

      // DB에 RUNNING 상태로 저장됐는지 확인
      const runs = db.select().from(methodRuns).all();
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe("RUNNING");
    });

    it("미존재 Method Pack → error", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "DISCOVERY" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await startMethodRun(asDB(db), {
          discoveryId: "disc-1",
          methodPackId: "MP-99",
        })
      );

      expect(result.error).toBeTruthy();
    });

    it("미존재 Discovery → error", async () => {
      const result = JSON.parse(
        await startMethodRun(asDB(db), {
          discoveryId: "non-existent",
          methodPackId: "MP-01",
        })
      );

      expect(result.error).toBeTruthy();
    });

    it("RUNNING 재개 — 같은 discovery+pack RUNNING 존재 시 templatePrompt와 함께 반환", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "DISCOVERY" });
      db.insert(discoveries).values(disc).run();

      // First run
      db.insert(methodRuns)
        .values(
          makeMethodRun({
            id: "run-1",
            discoveryId: "disc-1",
            methodPackId: "MP-01",
            status: "RUNNING",
          })
        )
        .run();

      const result = JSON.parse(
        await startMethodRun(asDB(db), {
          discoveryId: "disc-1",
          methodPackId: "MP-01",
        })
      );

      expect(result.resumed).toBe(true);
      expect(result.runId).toBe("run-1");
      expect(result.templatePrompt).toBeDefined();
      expect(result.methodPack).toBeDefined();
    });
  });

  // ─── completeMethodRun ────────────────────────────────────────────

  describe("completeMethodRun", () => {
    it("정상 완료 — status=COMPLETED, completedAt", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();
      db.insert(methodRuns)
        .values(
          makeMethodRun({
            id: "run-1",
            discoveryId: "disc-1",
            methodPackId: "MP-01",
            status: "RUNNING",
          })
        )
        .run();

      const result = JSON.parse(
        await completeMethodRun(asDB(db), {
          runId: "run-1",
          structuredOutput: { summary: "분석 완료" },
        })
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("COMPLETED");

      const run = db.query.methodRuns
        .findFirst({ where: eq(methodRuns.id, "run-1") })
        .sync();
      expect(run!.completedAt).toBeTruthy();
    });

    it("structuredOutput 저장 확인", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();
      db.insert(methodRuns)
        .values(
          makeMethodRun({
            id: "run-1",
            discoveryId: "disc-1",
            methodPackId: "MP-01",
            status: "RUNNING",
          })
        )
        .run();

      const output = {
        frictionMap: [{ friction: "느린 프로세스", severity: "high" }],
        kpiCandidates: ["처리 시간", "오류율"],
      };

      await completeMethodRun(asDB(db), {
        runId: "run-1",
        structuredOutput: output,
      });

      const run = db.query.methodRuns
        .findFirst({ where: eq(methodRuns.id, "run-1") })
        .sync();
      const saved = run!.structuredOutput as Record<string, unknown>;
      expect(saved.frictionMap).toBeTruthy();
      expect(saved.kpiCandidates).toBeTruthy();
    });

    it("assumptions 자동 생성 — structuredOutput.assumptions → assumptions 테이블", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();
      db.insert(methodRuns)
        .values(
          makeMethodRun({
            id: "run-1",
            discoveryId: "disc-1",
            methodPackId: "MP-01",
            status: "RUNNING",
          })
        )
        .run();

      await completeMethodRun(asDB(db), {
        runId: "run-1",
        structuredOutput: {
          assumptions: [
            {
              statement: "고객이 월 $50 이상 지불 의향이 있다",
              refutationQuestion: "무료 대안이 있다면?",
            },
            {
              statement: "시장 규모가 연 10% 성장한다",
            },
          ],
        },
      });

      const rows = db
        .select()
        .from(assumptions)
        .where(eq(assumptions.discoveryId, "disc-1"))
        .all();
      expect(rows).toHaveLength(2);
      expect(rows[0].statement).toContain("고객이");
      expect(rows[0].status).toBe("OPEN");
    });

    it("이미 완료된 run 거부", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();
      db.insert(methodRuns)
        .values(
          makeMethodRun({
            id: "run-1",
            discoveryId: "disc-1",
            methodPackId: "MP-01",
            status: "COMPLETED",
            completedAt: new Date(),
          })
        )
        .run();

      const result = JSON.parse(
        await completeMethodRun(asDB(db), {
          runId: "run-1",
          structuredOutput: { summary: "재시도" },
        })
      );

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("COMPLETED");
    });
  });

  // ─── draftGatePackage ─────────────────────────────────────────────

  describe("draftGatePackage", () => {
    it("GATE1 패키지 생성 — scorecard, recommendation 포함", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EVIDENCE_REVIEW" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await draftGatePackage(asDB(db), {
          discoveryId: "disc-1",
          gateType: "GATE1",
        })
      );

      expect(result.success).toBe(true);
      expect(result.packageId).toBeTruthy();
      expect(result.scorecard).toBeTruthy();
      expect(result.recommendation).toBeTruthy();
    });

    it("readinessScore 계산 — 높은 점수 (강한 근거 + 실험 + method run)", async () => {
      const user = makeUser({ id: "user-1" });
      db.insert(users).values(user).run();
      const disc = makeDiscovery({ id: "disc-1", status: "EVIDENCE_REVIEW" });
      db.insert(discoveries).values(disc).run();

      // 강한 근거 2개 (A, B) — 30pt
      db.insert(evidence)
        .values(
          makeEvidence({
            id: "ev-1",
            discoveryId: "disc-1",
            createdById: "user-1",
            strength: "A",
            reliabilityLabel: "confirmed",
            sourceUrl: "https://ex.com",
          })
        )
        .run();
      db.insert(evidence)
        .values(
          makeEvidence({
            id: "ev-2",
            discoveryId: "disc-1",
            createdById: "user-1",
            strength: "B",
            reliabilityLabel: "confirmed",
            sourceUrl: "https://ex2.com",
          })
        )
        .run();

      // 완료된 실험 2개 — 20pt
      db.insert(experiments)
        .values(
          makeExperiment({
            id: "exp-1",
            discoveryId: "disc-1",
            completedAt: new Date(),
          })
        )
        .run();
      db.insert(experiments)
        .values(
          makeExperiment({
            id: "exp-2",
            discoveryId: "disc-1",
            completedAt: new Date(),
          })
        )
        .run();

      // 완료된 method run 2개 — 20pt
      db.insert(methodRuns)
        .values(
          makeMethodRun({
            id: "run-1",
            discoveryId: "disc-1",
            methodPackId: "MP-01",
            status: "COMPLETED",
            completedAt: new Date(),
          })
        )
        .run();
      db.insert(methodRuns)
        .values(
          makeMethodRun({
            id: "run-2",
            discoveryId: "disc-1",
            methodPackId: "MP-02",
            status: "COMPLETED",
            completedAt: new Date(),
          })
        )
        .run();

      const result = JSON.parse(
        await draftGatePackage(asDB(db), {
          discoveryId: "disc-1",
          gateType: "GATE1",
        })
      );

      // 30 (strong) + 10 (confirmed) + 20 (exp) + 20 (runs) + 10 (no assumptions = neutral) = 90
      expect(result.scorecard.readinessScore).toBeGreaterThanOrEqual(70);
      expect(result.recommendation).toContain("GO");
    });

    it("미존재 Discovery → error", async () => {
      const result = JSON.parse(
        await draftGatePackage(asDB(db), {
          discoveryId: "non-existent",
          gateType: "GATE1",
        })
      );

      expect(result.error).toBeTruthy();
    });
  });

  // ─── getGatePackage ───────────────────────────────────────────────

  describe("getGatePackage", () => {
    it("gateType 지정 조회 — 특정 GATE1 패키지 반환", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EVIDENCE_REVIEW" });
      db.insert(discoveries).values(disc).run();

      // 먼저 패키지를 생성
      await draftGatePackage(asDB(db), {
        discoveryId: "disc-1",
        gateType: "GATE1",
      });

      const result = JSON.parse(
        await getGatePackage(asDB(db), {
          discoveryId: "disc-1",
          gateType: "GATE1",
        })
      );

      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].gateType).toBe("GATE1");
      expect(result.packages[0].scorecard).toBeTruthy();
    });

    it("패키지 없을 때 — suggestion 메시지", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "DISCOVERY" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await getGatePackage(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.error).toBeTruthy();
      expect(result.suggestion).toBeTruthy();
      expect(result.suggestion).toContain("draft_gate_package");
    });
  });
});
