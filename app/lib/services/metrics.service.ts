import type { DB } from "~/db";
import { discoveries, experiments, evidence, eventLogs, users } from "~/db/schema";
import { DiscoveryStatus } from "~/db/schema";

// ── Types ────────────────────────────────────────────────────────────────────

export interface OwnerWorkloadItem {
  name: string;
  total: number;
  decided: number;
  active: number;
  completionRate: string;
}

export interface FailurePatternItem {
  pattern: string;
  count: number;
}

export interface WeeklyDataItem {
  week: string;
  count: number;
}

export interface OperationalMetrics {
  // Core
  totalCount: number;
  inboxCount: number;
  openCount: number;
  nextCount: number;
  notNowCount: number;
  deadEndCount: number;
  decidedCount: number;
  seedToExperimentRate: string;
  completionRate: string;
  twentyEightDayClosureRate: string;
  recallEvents: number;
  // Experiments
  totalExperiments: number;
  completedExperiments: number;
  experimentCompletionRate: string;
  // Evidence
  totalEvidence: number;
  strongEvidence: number;
  // Charts
  weeklyData: WeeklyDataItem[];
  // Advanced
  failurePatternReuseRate: string;
  topReusedPatterns: FailurePatternItem[];
  ownerWorkload: OwnerWorkloadItem[];
  avgEvidenceQuality: string;
  avgDecisionDays: string;
  medianDecisionDays: string;
  extensionRequestRate: string;
  totalExtensionRequests: number;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class MetricsService {
  constructor(private db: DB) {}

  async getOperationalMetrics(): Promise<OperationalMetrics> {
    // 병렬로 모든 데이터 로드
    const [allDiscoveries, allExperiments, allEvidence, allEventLogs, allUsers] =
      await Promise.all([
        this.db.select().from(discoveries),
        this.db.select().from(experiments),
        this.db.select().from(evidence),
        this.db.select().from(eventLogs),
        this.db.select().from(users),
      ]);

    // ── Core discovery counts ──
    const totalCount = allDiscoveries.length;
    const inboxCount = allDiscoveries.filter((d) => d.status === DiscoveryStatus.DISCOVERY).length;
    const openCount = allDiscoveries.filter((d) => d.status === DiscoveryStatus.IDEA_CARD).length;
    const nextCount = allDiscoveries.filter((d) => d.status === DiscoveryStatus.GATE1).length;
    const notNowCount = allDiscoveries.filter((d) => d.status === DiscoveryStatus.HOLD).length;
    const deadEndCount = allDiscoveries.filter((d) => d.status === DiscoveryStatus.DROP).length;
    const decidedCount = nextCount + notNowCount + deadEndCount;

    const nonInboxCount = totalCount - inboxCount;
    const seedToExperimentRate =
      totalCount > 0 ? ((nonInboxCount / totalCount) * 100).toFixed(1) : "0.0";
    const completionRate =
      totalCount > 0 ? ((decidedCount / totalCount) * 100).toFixed(1) : "0.0";

    // ── 28-day closure rate ──
    const twentyEightDaysAgo = new Date();
    twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
    const oldDiscoveries = allDiscoveries.filter(
      (d) => new Date(d.createdAt) <= twentyEightDaysAgo,
    );
    const oldDecided = oldDiscoveries.filter(
      (d) =>
        d.status === DiscoveryStatus.GATE1 ||
        d.status === DiscoveryStatus.HOLD ||
        d.status === DiscoveryStatus.DROP,
    );
    const twentyEightDayClosureRate =
      oldDiscoveries.length > 0
        ? ((oldDecided.length / oldDiscoveries.length) * 100).toFixed(1)
        : "N/A";

    // ── Recall events ──
    const now = new Date();
    const recallEvents = allDiscoveries.filter(
      (d) =>
        d.status === DiscoveryStatus.HOLD &&
        d.revisitDate &&
        new Date(d.revisitDate) <= now,
    ).length;

    // ── Experiment stats ──
    const totalExperiments = allExperiments.length;
    const completedExperiments = allExperiments.filter((e) => e.completedAt !== null).length;
    const experimentCompletionRate =
      totalExperiments > 0
        ? ((completedExperiments / totalExperiments) * 100).toFixed(1)
        : "0.0";

    // ── Evidence stats ──
    const totalEvidence = allEvidence.length;
    const strongEvidence = allEvidence.filter(
      (e) => e.strength === "A" || e.strength === "B",
    ).length;

    // ── Weekly creation data (last 8 weeks) ──
    const weeklyData: WeeklyDataItem[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      weekEnd.setHours(0, 0, 0, 0);

      const weekCount = allDiscoveries.filter((d) => {
        const created = new Date(d.createdAt);
        return created >= weekStart && created < weekEnd;
      }).length;

      const label = `${(weekStart.getMonth() + 1).toString().padStart(2, "0")}/${weekStart.getDate().toString().padStart(2, "0")}`;
      weeklyData.push({ week: label, count: weekCount });
    }

    // ── Advanced: Failure pattern reuse ──
    const deadEndDiscoveries = allDiscoveries.filter(
      (d) => d.status === DiscoveryStatus.DROP && d.deadEndFailurePattern,
    );
    const patternCounts: Record<string, number> = {};
    for (const d of deadEndDiscoveries) {
      const patterns = d.deadEndFailurePattern as string[] | null;
      if (patterns) {
        for (const p of patterns) {
          patternCounts[p] = (patternCounts[p] || 0) + 1;
        }
      }
    }
    const reusedPatterns = Object.entries(patternCounts).filter(([, c]) => c >= 2);
    const failurePatternReuseRate =
      Object.keys(patternCounts).length > 0
        ? ((reusedPatterns.length / Object.keys(patternCounts).length) * 100).toFixed(1)
        : "N/A";
    const topReusedPatterns = reusedPatterns
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern, count]) => ({ pattern, count }));

    // ── Advanced: Owner workload ──
    const userNameMap: Record<string, string> = {};
    for (const u of allUsers) userNameMap[u.id] = u.name;

    const ownerMap: Record<string, { total: number; decided: number; active: number }> = {};
    for (const d of allDiscoveries) {
      if (!d.ownerId) continue;
      if (!ownerMap[d.ownerId]) ownerMap[d.ownerId] = { total: 0, decided: 0, active: 0 };
      ownerMap[d.ownerId].total++;
      if (
        d.status === DiscoveryStatus.GATE1 ||
        d.status === DiscoveryStatus.HOLD ||
        d.status === DiscoveryStatus.DROP
      ) {
        ownerMap[d.ownerId].decided++;
      }
      if (d.status === DiscoveryStatus.IDEA_CARD) {
        ownerMap[d.ownerId].active++;
      }
    }
    const ownerWorkload: OwnerWorkloadItem[] = Object.entries(ownerMap).map(([id, data]) => ({
      name: userNameMap[id] || id,
      total: data.total,
      decided: data.decided,
      active: data.active,
      completionRate:
        data.total > 0 ? ((data.decided / data.total) * 100).toFixed(1) : "0.0",
    }));

    // ── Advanced: Evidence quality score ──
    const evidenceByDiscovery: Record<string, { total: number; strong: number }> = {};
    for (const e of allEvidence) {
      if (!evidenceByDiscovery[e.discoveryId])
        evidenceByDiscovery[e.discoveryId] = { total: 0, strong: 0 };
      evidenceByDiscovery[e.discoveryId].total++;
      if (e.strength === "A" || e.strength === "B")
        evidenceByDiscovery[e.discoveryId].strong++;
    }
    const qualityScores = Object.values(evidenceByDiscovery).map((v) =>
      v.total > 0 ? v.strong / v.total : 0,
    );
    const avgEvidenceQuality =
      qualityScores.length > 0
        ? ((qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length) * 100).toFixed(1)
        : "N/A";

    // ── Advanced: Decision speed ──
    const decidedDiscoveries = allDiscoveries.filter(
      (d) =>
        d.decidedAt &&
        (d.status === DiscoveryStatus.GATE1 ||
          d.status === DiscoveryStatus.HOLD ||
          d.status === DiscoveryStatus.DROP),
    );
    const decisionDays = decidedDiscoveries.map((d) => {
      const created = new Date(d.createdAt).getTime();
      const decided = new Date(d.decidedAt!).getTime();
      return (decided - created) / (1000 * 60 * 60 * 24);
    });
    const avgDecisionDays =
      decisionDays.length > 0
        ? (decisionDays.reduce((a, b) => a + b, 0) / decisionDays.length).toFixed(1)
        : "N/A";
    const medianDecisionDays =
      decisionDays.length > 0
        ? (() => {
            const sorted = [...decisionDays].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0
              ? sorted[mid].toFixed(1)
              : ((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1);
          })()
        : "N/A";

    // ── Advanced: Extension request rate ──
    const extensionEvents = allEventLogs.filter(
      (e) =>
        e.eventType === "SUBMIT_FOR_APPROVAL" &&
        (e.metadata as Record<string, unknown>)?.pendingDecision === "IDEA_CARD",
    ).length;
    const directExtensionEvents = allEventLogs.filter(
      (e) => e.eventType === "REQUEST_EXTENSION",
    ).length;
    const totalExtensionRequests = extensionEvents + directExtensionEvents;
    const extensionRequestRate =
      totalCount > 0
        ? ((totalExtensionRequests / totalCount) * 100).toFixed(1)
        : "N/A";

    return {
      totalCount,
      inboxCount,
      openCount,
      nextCount,
      notNowCount,
      deadEndCount,
      decidedCount,
      seedToExperimentRate,
      completionRate,
      twentyEightDayClosureRate,
      recallEvents,
      totalExperiments,
      completedExperiments,
      experimentCompletionRate,
      totalEvidence,
      strongEvidence,
      weeklyData,
      failurePatternReuseRate,
      topReusedPatterns,
      ownerWorkload,
      avgEvidenceQuality,
      avgDecisionDays,
      medianDecisionDays,
      extensionRequestRate,
      totalExtensionRequests,
    };
  }
}
