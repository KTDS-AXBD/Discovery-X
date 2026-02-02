import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, makeDiscovery, makeExperiment, makeEvidence, resetFixtureCounter } from "../../helpers/fixtures";
import {
  users,
  discoveries,
  experiments,
  evidence,
  eventLogs,
  stages,
} from "~/db/schema";
import {
  createDiscovery,
  updateDiscovery,
  promoteDiscovery,
  transitionStage,
  addExperiment,
  completeExperiment,
  addEvidence,
  decideGate,
  decideHold,
  decideDrop,
  requestExtension,
  getStageInfo,
  validateEvidence,
} from "~/lib/agent/tools/discovery-tools";

// discovery-tools expects DB (D1-based drizzle) but TestDB is better-sqlite3 based
// The drizzle API surface is compatible, so we cast
function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof createDiscovery>[0];
}

describe("Agent discovery-tools", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
    // system-agent user is already seeded by 0005 migration
  });

  // ─── createDiscovery ───────────────────────────────────────────────

  describe("createDiscovery", () => {
    it("creates a discovery with DISCOVERY status", async () => {
      const result = JSON.parse(
        await createDiscovery(asDB(db), {
          title: "AI 시장 분석",
          seedSummary: "LLM 시장의 급성장 관찰",
          sourceType: "article",
        })
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("DISCOVERY");
      expect(result.discoveryId).toBeTruthy();

      const row = db.select().from(discoveries).all();
      expect(row).toHaveLength(1);
      expect(row[0].status).toBe("DISCOVERY");
      expect(row[0].createdByAgent).toBe(1);
    });

    it("sets createdByAgent flag", async () => {
      await createDiscovery(asDB(db), {
        title: "Test",
        seedSummary: "Summary",
        sourceType: "article",
      });

      const row = db.select().from(discoveries).all();
      expect(row[0].createdByAgent).toBe(1);
    });

    it("logs created event", async () => {
      const result = JSON.parse(
        await createDiscovery(asDB(db), {
          title: "Test",
          seedSummary: "Summary",
          sourceType: "issue",
        })
      );

      const logs = db
        .select()
        .from(eventLogs)
        .where(eq(eventLogs.discoveryId, result.discoveryId))
        .all();
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe("created");
    });
  });

  // ─── updateDiscovery ──────────────────────────────────────────────

  describe("updateDiscovery", () => {
    it("updates title in DISCOVERY status", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "DISCOVERY" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await updateDiscovery(asDB(db), {
          discoveryId: "disc-1",
          title: "Updated Title",
        })
      );

      expect(result.success).toBe(true);
      const row = db.query.discoveries.findFirst({ where: eq(discoveries.id, "disc-1") }).sync();
      expect(row!.title).toBe("Updated Title");
    });

    it("allows update in IDEA_CARD status", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "IDEA_CARD" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await updateDiscovery(asDB(db), {
          discoveryId: "disc-1",
          seedSummary: "Updated summary",
        })
      );

      expect(result.success).toBe(true);
    });

    it("rejects update in HYPOTHESIS status", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "HYPOTHESIS" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await updateDiscovery(asDB(db), {
          discoveryId: "disc-1",
          title: "Nope",
        })
      );

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("HYPOTHESIS");
    });

    it("returns error for non-existent discovery", async () => {
      const result = JSON.parse(
        await updateDiscovery(asDB(db), {
          discoveryId: "non-existent",
          title: "Nope",
        })
      );

      expect(result.error).toBeTruthy();
    });
  });

  // ─── promoteDiscovery ─────────────────────────────────────────────

  describe("promoteDiscovery", () => {
    it("promotes DISCOVERY to IDEA_CARD", async () => {
      const user = makeUser({ id: "user-1" });
      const disc = makeDiscovery({ id: "disc-1", status: "DISCOVERY" });
      db.insert(users).values(user).run();
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await promoteDiscovery(asDB(db), {
          discoveryId: "disc-1",
          ownerId: "user-1",
          hypothesis: "LLM이 AX 시장을 변화시킬 것",
          minimalAction: "시장 규모 데스크 리서치",
          deadline: "2026-03-01",
          expectedEvidence: "시장 규모 보고서",
        })
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("IDEA_CARD");
      expect(result.dueDate).toBeTruthy();
      expect(result.experimentId).toBeTruthy();
    });

    it("sets dueDate (createdAt + 28 days)", async () => {
      const user = makeUser({ id: "user-1" });
      const disc = makeDiscovery({
        id: "disc-1",
        status: "DISCOVERY",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      });
      db.insert(users).values(user).run();
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await promoteDiscovery(asDB(db), {
          discoveryId: "disc-1",
          ownerId: "user-1",
          hypothesis: "H",
          minimalAction: "A",
          deadline: "2026-03-01",
          expectedEvidence: "E",
        })
      );

      expect(result.dueDate).toContain("2026-01-29");
    });

    it("creates first experiment", async () => {
      const user = makeUser({ id: "user-1" });
      const disc = makeDiscovery({ id: "disc-1", status: "DISCOVERY" });
      db.insert(users).values(user).run();
      db.insert(discoveries).values(disc).run();

      await promoteDiscovery(asDB(db), {
        discoveryId: "disc-1",
        ownerId: "user-1",
        hypothesis: "H",
        minimalAction: "A",
        deadline: "2026-03-01",
        expectedEvidence: "E",
      });

      const exps = db.select().from(experiments).where(eq(experiments.discoveryId, "disc-1")).all();
      expect(exps).toHaveLength(1);
      expect(exps[0].hypothesis).toBe("H");
    });

    it("rejects non-DISCOVERY status", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "IDEA_CARD" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await promoteDiscovery(asDB(db), {
          discoveryId: "disc-1",
          ownerId: "user-1",
          hypothesis: "H",
          minimalAction: "A",
          deadline: "2026-03-01",
          expectedEvidence: "E",
        })
      );

      expect(result.error).toBeTruthy();
    });

    it("rejects without owner", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "DISCOVERY" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await promoteDiscovery(asDB(db), {
          discoveryId: "disc-1",
          ownerId: "",
          hypothesis: "H",
          minimalAction: "A",
          deadline: "2026-03-01",
          expectedEvidence: "E",
        })
      );

      expect(result.error).toBeTruthy();
    });
  });

  // ─── transitionStage ──────────────────────────────────────────────

  describe("transitionStage", () => {
    it("transitions IDEA_CARD to HYPOTHESIS", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "IDEA_CARD" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await transitionStage(asDB(db), {
          discoveryId: "disc-1",
          toStatus: "HYPOTHESIS",
          rationale: "가설 수립 준비 완료",
        })
      );

      expect(result.success).toBe(true);
      expect(result.fromStatus).toBe("IDEA_CARD");
      expect(result.toStatus).toBe("HYPOTHESIS");
    });

    it("rejects invalid transition", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "DISCOVERY" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await transitionStage(asDB(db), {
          discoveryId: "disc-1",
          toStatus: "SPRINT",
        })
      );

      expect(result.error).toBeTruthy();
    });

    it("allows HOLD transition from any active stage", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await transitionStage(asDB(db), {
          discoveryId: "disc-1",
          toStatus: "HOLD",
        })
      );

      expect(result.success).toBe(true);
      expect(result.toStatus).toBe("HOLD");
    });

    it("rejects transition from terminal HANDOFF", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "HANDOFF" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await transitionStage(asDB(db), {
          discoveryId: "disc-1",
          toStatus: "SPRINT",
        })
      );

      expect(result.error).toBeTruthy();
    });

    it("rejects transition from terminal DROP", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "DROP" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await transitionStage(asDB(db), {
          discoveryId: "disc-1",
          toStatus: "DISCOVERY",
        })
      );

      expect(result.error).toBeTruthy();
    });

    it("updates stageUpdatedAt on transition", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "IDEA_CARD" });
      db.insert(discoveries).values(disc).run();

      await transitionStage(asDB(db), {
        discoveryId: "disc-1",
        toStatus: "HYPOTHESIS",
      });

      const row = db.query.discoveries.findFirst({ where: eq(discoveries.id, "disc-1") }).sync();
      expect(row!.stageUpdatedAt).toBeTruthy();
    });
  });

  // ─── addExperiment / completeExperiment ────────────────────────────

  describe("addExperiment", () => {
    it("adds experiment to discovery", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await addExperiment(asDB(db), {
          discoveryId: "disc-1",
          hypothesis: "테스트 가설",
          minimalAction: "테스트 행동",
          deadline: "2026-03-01",
          expectedEvidence: "예상 근거",
        })
      );

      expect(result.success).toBe(true);
      expect(result.experimentId).toBeTruthy();
    });

    it("enforces 2 experiment limit", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();

      db.insert(experiments).values(makeExperiment({ id: "exp-1", discoveryId: "disc-1" })).run();
      db.insert(experiments).values(makeExperiment({ id: "exp-2", discoveryId: "disc-1" })).run();

      const result = JSON.parse(
        await addExperiment(asDB(db), {
          discoveryId: "disc-1",
          hypothesis: "H3",
          minimalAction: "A3",
          deadline: "2026-03-01",
          expectedEvidence: "E3",
        })
      );

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("2개");
    });

    it("logs experiment_added event", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await addExperiment(asDB(db), {
          discoveryId: "disc-1",
          hypothesis: "H",
          minimalAction: "A",
          deadline: "2026-03-01",
          expectedEvidence: "E",
        })
      );

      const logs = db
        .select()
        .from(eventLogs)
        .where(eq(eventLogs.discoveryId, "disc-1"))
        .all();
      const addedLog = logs.find((l) => l.eventType === "experiment_added");
      expect(addedLog).toBeTruthy();
    });
  });

  describe("completeExperiment", () => {
    it("completes an active experiment", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();
      db.insert(experiments)
        .values(makeExperiment({ id: "exp-1", discoveryId: "disc-1" }))
        .run();

      const result = JSON.parse(
        await completeExperiment(asDB(db), {
          experimentId: "exp-1",
          resultSummary: "가설 검증 완료. 긍정적 결과.",
        })
      );

      expect(result.success).toBe(true);

      const exp = db.query.experiments.findFirst({ where: eq(experiments.id, "exp-1") }).sync();
      expect(exp!.completedAt).toBeTruthy();
      expect(exp!.resultSummary).toBe("가설 검증 완료. 긍정적 결과.");
    });

    it("rejects completing already completed experiment", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();
      db.insert(experiments)
        .values(makeExperiment({ id: "exp-1", discoveryId: "disc-1", completedAt: new Date() }))
        .run();

      const result = JSON.parse(
        await completeExperiment(asDB(db), {
          experimentId: "exp-1",
          resultSummary: "중복 완료 시도",
        })
      );

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("이미 완료");
    });

    it("returns error for non-existent experiment", async () => {
      const result = JSON.parse(
        await completeExperiment(asDB(db), {
          experimentId: "non-existent",
          resultSummary: "결과",
        })
      );

      expect(result.error).toBeTruthy();
    });
  });

  // ─── addEvidence ──────────────────────────────────────────────────

  describe("addEvidence", () => {
    beforeEach(() => {
      const disc = makeDiscovery({ id: "disc-1", status: "EVIDENCE_REVIEW" });
      db.insert(discoveries).values(disc).run();
    });

    it("adds evidence with v3 fields", async () => {
      const result = JSON.parse(
        await addEvidence(asDB(db), {
          discoveryId: "disc-1",
          type: "DATA",
          strength: "A",
          content: "A".repeat(200),
          reliabilityLabel: "confirmed",
          sourceUrl: "https://example.com/report",
          publishedOrObservedDate: "2026-01-15",
        })
      );

      expect(result.success).toBe(true);
      expect(result.warning).toBeNull();

      const row = db.select().from(evidence).all();
      expect(row[0].reliabilityLabel).toBe("confirmed");
      expect(row[0].sourceUrl).toBe("https://example.com/report");
    });

    it("warns when content is under 200 chars", async () => {
      const result = JSON.parse(
        await addEvidence(asDB(db), {
          discoveryId: "disc-1",
          type: "DATA",
          strength: "B",
          content: "Short content",
          reliabilityLabel: "reported",
          sourceUrl: "https://example.com",
        })
      );

      expect(result.success).toBe(true);
      expect(result.warning).toBeTruthy();
      expect(result.warning).toContain("200자");
    });

    it("throws on invalid reliability label", async () => {
      await expect(
        addEvidence(asDB(db), {
          discoveryId: "disc-1",
          type: "DATA",
          strength: "B",
          content: "content",
          reliabilityLabel: "invalid_label",
          sourceUrl: "https://example.com",
        })
      ).rejects.toThrow("잘못된 신뢰도 라벨");
    });

    it("throws on missing source", async () => {
      await expect(
        addEvidence(asDB(db), {
          discoveryId: "disc-1",
          type: "DATA",
          strength: "B",
          content: "content",
          reliabilityLabel: "reported",
          // no sourceUrl, no linkOrAttachment
        })
      ).rejects.toThrow("출처 URL");
    });

    it("accepts linkOrAttachment as source alternative", async () => {
      const result = JSON.parse(
        await addEvidence(asDB(db), {
          discoveryId: "disc-1",
          type: "REF",
          strength: "C",
          content: "C".repeat(200),
          reliabilityLabel: "hypothesis",
          linkOrAttachment: "https://docs.google.com/report",
        })
      );

      expect(result.success).toBe(true);
    });
  });

  // ─── decideGate ───────────────────────────────────────────────────

  describe("decideGate", () => {
    it("transitions EVIDENCE_REVIEW to GATE1", async () => {
      const user = makeUser({ id: "user-1" });
      db.insert(users).values(user).run();
      const disc = makeDiscovery({ id: "disc-1", status: "EVIDENCE_REVIEW" });
      db.insert(discoveries).values(disc).run();

      // Add strong evidence to avoid warning
      db.insert(evidence)
        .values(
          makeEvidence({
            id: "ev-1",
            discoveryId: "disc-1",
            createdById: "user-1",
            strength: "A",
            reliabilityLabel: "confirmed",
            sourceUrl: "https://ex.com",
            publishedOrObservedDate: "2026-01-01",
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
            reliabilityLabel: "reported",
            sourceUrl: "https://ex2.com",
            publishedOrObservedDate: "2026-01-02",
          })
        )
        .run();

      const result = JSON.parse(
        await decideGate(asDB(db), {
          discoveryId: "disc-1",
          decisionRationale: "근거 충분, Gate 1 통과",
        })
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("GATE1");
    });

    it("transitions SPRINT to GATE2", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "SPRINT" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await decideGate(asDB(db), {
          discoveryId: "disc-1",
          decisionRationale: "스프린트 완료, Gate 2 진행",
        })
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("GATE2");
    });

    it("warns with insufficient strong evidence", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EVIDENCE_REVIEW" });
      db.insert(discoveries).values(disc).run();

      // Only weak evidence
      const user = makeUser({ id: "user-1" });
      db.insert(users).values(user).run();
      db.insert(evidence)
        .values(
          makeEvidence({
            id: "ev-1",
            discoveryId: "disc-1",
            createdById: "user-1",
            strength: "D",
          })
        )
        .run();

      const result = JSON.parse(
        await decideGate(asDB(db), {
          discoveryId: "disc-1",
          decisionRationale: "결정",
        })
      );

      expect(result.success).toBe(true);
      expect(result.warning).toBeTruthy();
    });

    it("returns error for non-existent discovery", async () => {
      const result = JSON.parse(
        await decideGate(asDB(db), {
          discoveryId: "non-existent",
          decisionRationale: "N/A",
        })
      );

      expect(result.error).toBeTruthy();
    });
  });

  // ─── decideHold ───────────────────────────────────────────────────

  describe("decideHold", () => {
    it("transitions to HOLD with required fields", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "IDEA_CARD" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await decideHold(asDB(db), {
          discoveryId: "disc-1",
          decisionRationale: "기술 성숙도 부족",
          notNowTriggerType: "Technology_Maturity",
          notNowTriggerCondition: "GPT-5 출시 시",
          revisitDate: "2026-06-01",
        })
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("HOLD");
    });

    it("rejects without trigger type", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "IDEA_CARD" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await decideHold(asDB(db), {
          discoveryId: "disc-1",
          decisionRationale: "보류",
          notNowTriggerType: "",
          notNowTriggerCondition: "조건",
          revisitDate: "2026-06-01",
        })
      );

      expect(result.error).toBeTruthy();
    });

    it("rejects with past revisit date", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "IDEA_CARD" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await decideHold(asDB(db), {
          discoveryId: "disc-1",
          decisionRationale: "보류",
          notNowTriggerType: "Technology_Maturity",
          notNowTriggerCondition: "조건",
          revisitDate: "2020-01-01",
        })
      );

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("미래 날짜");
    });

    it("logs decided_hold event", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "IDEA_CARD" });
      db.insert(discoveries).values(disc).run();

      await decideHold(asDB(db), {
        discoveryId: "disc-1",
        decisionRationale: "보류",
        notNowTriggerType: "Technology_Maturity",
        notNowTriggerCondition: "GPT-5",
        revisitDate: "2026-06-01",
      });

      const logs = db
        .select()
        .from(eventLogs)
        .where(eq(eventLogs.discoveryId, "disc-1"))
        .all();
      const holdLog = logs.find((l) => l.eventType === "decided_hold");
      expect(holdLog).toBeTruthy();
    });
  });

  // ─── decideDrop ───────────────────────────────────────────────────

  describe("decideDrop", () => {
    it("transitions to DROP with required fields", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await decideDrop(asDB(db), {
          discoveryId: "disc-1",
          decisionRationale: "시장 반응 없음",
          deadEndFailurePattern: ["market_mismatch"],
          deadEndEvidenceReason: "3건의 인터뷰에서 모두 부정적 반응",
        })
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("DROP");
      expect(result.failurePatterns).toContain("market_mismatch");
    });

    it("rejects without failure pattern", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await decideDrop(asDB(db), {
          discoveryId: "disc-1",
          decisionRationale: "중단",
          deadEndFailurePattern: [],
          deadEndEvidenceReason: "사유",
        })
      );

      expect(result.error).toBeTruthy();
    });

    it("rejects more than 3 failure patterns", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await decideDrop(asDB(db), {
          discoveryId: "disc-1",
          decisionRationale: "중단",
          deadEndFailurePattern: ["a", "b", "c", "d"],
          deadEndEvidenceReason: "사유",
        })
      );

      expect(result.error).toBeTruthy();
    });

    it("rejects without evidence reason", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await decideDrop(asDB(db), {
          discoveryId: "disc-1",
          decisionRationale: "중단",
          deadEndFailurePattern: ["pattern"],
          deadEndEvidenceReason: "",
        })
      );

      expect(result.error).toBeTruthy();
    });

    it("logs decided_drop event", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();

      await decideDrop(asDB(db), {
        discoveryId: "disc-1",
        decisionRationale: "중단",
        deadEndFailurePattern: ["p1"],
        deadEndEvidenceReason: "사유",
      });

      const logs = db
        .select()
        .from(eventLogs)
        .where(eq(eventLogs.discoveryId, "disc-1"))
        .all();
      const dropLog = logs.find((l) => l.eventType === "decided_drop");
      expect(dropLog).toBeTruthy();
    });
  });

  // ─── requestExtension ─────────────────────────────────────────────

  describe("requestExtension", () => {
    it("sets approval status to PENDING", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();

      const result = JSON.parse(
        await requestExtension(asDB(db), {
          discoveryId: "disc-1",
          extensionRationale: "추가 실험 필요",
        })
      );

      expect(result.success).toBe(true);

      const row = db.query.discoveries.findFirst({ where: eq(discoveries.id, "disc-1") }).sync();
      expect(row!.approvalStatus).toBe("PENDING");
      expect(row!.pendingDecision).toBe("EXTENSION_REQUESTED");
    });

    it("returns error for non-existent discovery", async () => {
      const result = JSON.parse(
        await requestExtension(asDB(db), {
          discoveryId: "non-existent",
          extensionRationale: "사유",
        })
      );

      expect(result.error).toBeTruthy();
    });

    it("logs extension_requested event", async () => {
      const disc = makeDiscovery({ id: "disc-1", status: "EXPERIMENT" });
      db.insert(discoveries).values(disc).run();

      await requestExtension(asDB(db), {
        discoveryId: "disc-1",
        extensionRationale: "추가 실험 필요",
      });

      const logs = db
        .select()
        .from(eventLogs)
        .where(eq(eventLogs.discoveryId, "disc-1"))
        .all();
      const extLog = logs.find((l) => l.eventType === "extension_requested");
      expect(extLog).toBeTruthy();
    });
  });

  // ─── getStageInfo ─────────────────────────────────────────────────

  describe("getStageInfo", () => {
    it("returns single stage info with transitions", async () => {
      const result = JSON.parse(
        await getStageInfo(asDB(db), { stageId: "DISCOVERY" })
      );

      expect(result.stage).toBeTruthy();
      expect(result.stage.id).toBe("DISCOVERY");
      expect(result.allowedTransitions).toContain("IDEA_CARD");
    });

    it("returns all stages when no stageId given", async () => {
      const result = JSON.parse(
        await getStageInfo(asDB(db), {})
      );

      expect(result.stages).toHaveLength(11);
      expect(result.transitions).toBeTruthy();
    });

    it("returns error for non-existent stage", async () => {
      const result = JSON.parse(
        await getStageInfo(asDB(db), { stageId: "INVALID" })
      );

      expect(result.error).toBeTruthy();
    });
  });

  // ─── validateEvidence ─────────────────────────────────────────────

  describe("validateEvidence", () => {
    beforeEach(() => {
      const user = makeUser({ id: "user-1" });
      const disc = makeDiscovery({ id: "disc-1", status: "EVIDENCE_REVIEW" });
      db.insert(users).values(user).run();
      db.insert(discoveries).values(disc).run();
    });

    it("validates single evidence with issues", async () => {
      db.insert(evidence)
        .values(
          makeEvidence({
            id: "ev-1",
            discoveryId: "disc-1",
            createdById: "user-1",
            content: "short",
          })
        )
        .run();

      const result = JSON.parse(
        await validateEvidence(asDB(db), { discoveryId: "disc-1", evidenceId: "ev-1" })
      );

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it("validates all evidence for a discovery", async () => {
      db.insert(evidence)
        .values(
          makeEvidence({
            id: "ev-1",
            discoveryId: "disc-1",
            createdById: "user-1",
            reliabilityLabel: "confirmed",
            sourceUrl: "https://ex.com",
            publishedOrObservedDate: "2026-01-01",
            content: "X".repeat(200),
          })
        )
        .run();
      db.insert(evidence)
        .values(
          makeEvidence({
            id: "ev-2",
            discoveryId: "disc-1",
            createdById: "user-1",
            content: "short",
          })
        )
        .run();

      const result = JSON.parse(
        await validateEvidence(asDB(db), { discoveryId: "disc-1" })
      );

      expect(result.total).toBe(2);
      expect(result.valid).toBe(1);
      expect(result.invalid).toBe(1);
    });

    it("returns error for non-existent evidence", async () => {
      const result = JSON.parse(
        await validateEvidence(asDB(db), { discoveryId: "disc-1", evidenceId: "nope" })
      );

      expect(result.error).toBeTruthy();
    });

    it("flags missing publishedOrObservedDate", async () => {
      db.insert(evidence)
        .values(
          makeEvidence({
            id: "ev-1",
            discoveryId: "disc-1",
            createdById: "user-1",
            reliabilityLabel: "confirmed",
            sourceUrl: "https://ex.com",
            content: "X".repeat(200),
            // no publishedOrObservedDate
          })
        )
        .run();

      const result = JSON.parse(
        await validateEvidence(asDB(db), { discoveryId: "disc-1", evidenceId: "ev-1" })
      );

      expect(result.issues).toContain("발행/관측일 누락 (Gate 통과 필요)");
    });
  });
});
