/**
 * Query tools — read-only operations for listing, searching, metrics, radar.
 */

import { eq, desc, sql, and, gte, lte, inArray } from "drizzle-orm";
import type { DB } from "~/db";
import {
  discoveries,
  experiments,
  evidence,
  radarItems,
  users,
  methodRuns,
  methodPacks,
  assumptions,
  industryAdapters,
  industryRules,
  DiscoveryStatus,
  AssumptionStatus,
} from "~/db/schema";

export async function listDiscoveries(
  db: DB,
  input: { status?: string; limit?: number; offset?: number }
): Promise<string> {
  const limit = input.limit || 20;
  const offset = input.offset || 0;

  let query = db
    .select({
      id: discoveries.id,
      title: discoveries.title,
      status: discoveries.status,
      ownerId: discoveries.ownerId,
      createdAt: discoveries.createdAt,
      dueDate: discoveries.dueDate,
      createdByAgent: discoveries.createdByAgent,
    })
    .from(discoveries);

  if (input.status) {
    query = query.where(eq(discoveries.status, input.status)) as typeof query;
  }

  const results = await query.orderBy(desc(discoveries.updatedAt)).limit(limit + 1).offset(offset);
  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;

  return JSON.stringify({
    total: items.length,
    offset,
    hasMore,
    discoveries: items.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      ownerId: d.ownerId || "미지정",
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
      dueDate: d.dueDate ? new Date(d.dueDate).toISOString() : null,
      createdByAgent: !!d.createdByAgent,
    })),
  });
}

export async function getDiscoveryDetail(
  db: DB,
  input: { discoveryId: string }
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다.", suggestion: "list_discoveries로 기존 목록을 확인해보세요." });

  const d = discovery[0];
  const exps = await db
    .select()
    .from(experiments)
    .where(eq(experiments.discoveryId, input.discoveryId));
  const evs = await db
    .select()
    .from(evidence)
    .where(eq(evidence.discoveryId, input.discoveryId));

  return JSON.stringify({
    discovery: {
      id: d.id,
      title: d.title,
      seedSummary: d.seedSummary,
      seedLinks: d.seedLinks,
      sourceType: d.sourceType,
      status: d.status,
      ownerId: d.ownerId,
      reviewerId: d.reviewerId,
      dueDate: d.dueDate ? new Date(d.dueDate).toISOString() : null,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
      decisionState: d.decisionState,
      decisionRationale: d.decisionRationale,
      notNowTriggerType: d.notNowTriggerType,
      revisitDate: d.revisitDate ? new Date(d.revisitDate).toISOString() : null,
      deadEndFailurePattern: d.deadEndFailurePattern,
      deadEndEvidenceReason: d.deadEndEvidenceReason,
      approvalStatus: d.approvalStatus,
      createdByAgent: !!d.createdByAgent,
    },
    experiments: exps.map((e) => ({
      id: e.id,
      hypothesis: e.hypothesis,
      minimalAction: e.minimalAction,
      deadline: e.deadline ? new Date(e.deadline).toISOString() : null,
      expectedEvidence: e.expectedEvidence,
      resultSummary: e.resultSummary,
      completed: !!e.completedAt,
    })),
    evidence: evs.map((e) => ({
      id: e.id,
      type: e.type,
      strength: e.strength,
      content: e.content,
      linkOrAttachment: e.linkOrAttachment,
      experimentId: e.experimentId,
      reliabilityLabel: e.reliabilityLabel,
      sourceUrl: e.sourceUrl,
      publishedOrObservedDate: e.publishedOrObservedDate,
      validatorId: e.validatorId,
    })),
  });
}

/**
 * 실험 설계를 위한 종합 컨텍스트 조회
 * Method Run 결과, 미검증 assumptions, 기존 실험, 실험 슬롯 현황 포함
 */
export async function getExperimentContext(
  db: DB,
  input: { discoveryId: string }
): Promise<string> {
  // 1. Discovery 기본 정보
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) {
    return JSON.stringify({
      error: "Discovery를 찾을 수 없습니다.",
      suggestion: "list_discoveries로 기존 목록을 확인해보세요.",
    });
  }

  const d = discovery[0];

  // 2. 실험 목록 조회
  const exps = await db
    .select()
    .from(experiments)
    .where(eq(experiments.discoveryId, input.discoveryId));

  // 3. Method Runs + Method Packs 조인 조회
  const runs = await db
    .select({
      runId: methodRuns.id,
      methodPackId: methodRuns.methodPackId,
      status: methodRuns.status,
      structuredOutput: methodRuns.structuredOutput,
      startedAt: methodRuns.startedAt,
      completedAt: methodRuns.completedAt,
      methodPackName: methodPacks.nameKo,
      tier: methodPacks.tier,
    })
    .from(methodRuns)
    .innerJoin(methodPacks, eq(methodRuns.methodPackId, methodPacks.id))
    .where(eq(methodRuns.discoveryId, input.discoveryId));

  // 4. Assumptions 조회
  const assumptionList = await db
    .select()
    .from(assumptions)
    .where(eq(assumptions.discoveryId, input.discoveryId));

  // 5. Evidence 조회
  const evs = await db
    .select()
    .from(evidence)
    .where(eq(evidence.discoveryId, input.discoveryId));

  // 6. 실험 슬롯 계산
  const maxExperiments = 2; // 기본 2개, 연장 시 3개
  const usedSlots = exps.length;
  const availableSlots = Math.max(0, maxExperiments - usedSlots);
  const canAdd = availableSlots > 0;

  // 7. 근거 요약 계산
  const evidenceByStrength: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  const strongEvidence: Array<{ id: string; content: string; strength: string }> = [];

  for (const e of evs) {
    if (e.strength in evidenceByStrength) {
      evidenceByStrength[e.strength]++;
    }
    if (e.strength === "A" || e.strength === "B") {
      strongEvidence.push({
        id: e.id,
        content: e.content.slice(0, 100) + (e.content.length > 100 ? "..." : ""),
        strength: e.strength,
      });
    }
  }

  // 8. 추천 생성
  const unvalidatedAssumptions = assumptionList.filter(
    (a) => a.status === AssumptionStatus.OPEN
  );

  // 실험 제안 포커스 결정
  let suggestedExperimentFocus: string[] = [];

  // Completed method runs에서 핵심 인사이트 추출
  const completedRuns = runs.filter((r) => r.status === "COMPLETED" && r.structuredOutput);

  for (const run of completedRuns) {
    const output = run.structuredOutput as Record<string, unknown>;

    // frictionMap 또는 friction_points가 있으면 마찰 검증 제안
    if (output.frictionMap || output.friction_points || output.frictions) {
      suggestedExperimentFocus.push(`${run.methodPackName} 결과의 마찰점 검증`);
    }

    // assumptions가 있으면 가정 검증 제안
    if (output.assumptions && Array.isArray(output.assumptions)) {
      const unvalidated = (output.assumptions as Array<{ validated?: boolean }>).filter(
        (a) => !a.validated
      );
      if (unvalidated.length > 0) {
        suggestedExperimentFocus.push(`${run.methodPackName}에서 도출된 ${unvalidated.length}개 가정 검증`);
      }
    }

    // hypothesis 또는 hypotheses가 있으면 가설 검증 제안
    if (output.hypothesis || output.hypotheses) {
      suggestedExperimentFocus.push(`${run.methodPackName} 가설 검증`);
    }

    // opportunities가 있으면 기회 검증 제안
    if (output.opportunities && Array.isArray(output.opportunities)) {
      suggestedExperimentFocus.push(`${run.methodPackName}에서 식별된 기회 검증`);
    }
  }

  // 미검증 assumptions가 있으면 추가
  if (unvalidatedAssumptions.length > 0) {
    suggestedExperimentFocus.push(`미검증 가정 ${unvalidatedAssumptions.length}개 검증`);
  }

  // 중복 제거
  suggestedExperimentFocus = [...new Set(suggestedExperimentFocus)].slice(0, 3);

  // 다음 Method Pack 추천
  const executedPackIds = runs.map((r) => r.methodPackId);
  const nextMethodPacks: string[] = [];

  // Tier-0 팩 중 미실행 항목 확인
  const tier0Packs = ["MP-01", "MP-02"];
  for (const packId of tier0Packs) {
    if (!executedPackIds.includes(packId)) {
      nextMethodPacks.push(packId);
    }
  }

  return JSON.stringify({
    discovery: {
      id: d.id,
      title: d.title,
      seedSummary: d.seedSummary,
      status: d.status,
      dueDate: d.dueDate ? new Date(d.dueDate).toISOString() : null,
    },
    experimentSlots: {
      used: usedSlots,
      max: maxExperiments,
      available: availableSlots,
      canAdd,
    },
    experiments: exps.map((e) => ({
      id: e.id,
      hypothesis: e.hypothesis,
      minimalAction: e.minimalAction,
      deadline: e.deadline ? new Date(e.deadline).toISOString() : null,
      expectedEvidence: e.expectedEvidence,
      resultSummary: e.resultSummary,
      completed: !!e.completedAt,
    })),
    methodRuns: runs.map((r) => ({
      runId: r.runId,
      methodPackId: r.methodPackId,
      methodPackName: r.methodPackName,
      tier: r.tier,
      status: r.status,
      structuredOutput: r.structuredOutput,
      startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
      completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
    })),
    assumptions: assumptionList.map((a) => ({
      id: a.id,
      statement: a.statement,
      refutationQuestions: a.refutationQuestions,
      status: a.status,
      evidenceIds: a.evidenceIds,
    })),
    evidenceSummary: {
      total: evs.length,
      byStrength: evidenceByStrength,
      strongEvidence,
    },
    recommendations: {
      suggestedExperimentFocus,
      unvalidatedAssumptions: unvalidatedAssumptions.map((a) => ({
        id: a.id,
        statement: a.statement,
        refutationQuestions: a.refutationQuestions,
      })),
      nextMethodPacks,
    },
  });
}

export async function searchSimilar(
  db: DB,
  input: { query: string },
  env?: { OPENAI_API_KEY?: string; VECTORIZE_DISCOVERIES?: unknown }
): Promise<string> {
  // 1. 입력 정규화
  const q = (input.query || "").trim();
  if (q.length < 2) {
    return JSON.stringify({
      results: [],
      message: "검색어가 너무 짧습니다 (최소 2자)",
    });
  }

  // 2. Vectorize 시맨틱 검색 시도 (가용 시)
  if (env?.VECTORIZE_DISCOVERIES && env?.OPENAI_API_KEY) {
    try {
      const { findSimilarDiscoveries } = await import("~/lib/embeddings/embedding-service");
      const embeddingEnv = {
        OPENAI_API_KEY: env.OPENAI_API_KEY,
        VECTORIZE_DISCOVERIES: env.VECTORIZE_DISCOVERIES as import("~/lib/embeddings/embedding-service").EmbeddingEnv["VECTORIZE_DISCOVERIES"],
      };
      const semanticResults = await findSimilarDiscoveries(embeddingEnv, q, undefined, 10);
      if (semanticResults.length > 0) {
        // Enrich with DB data
        const enriched = [];
        for (const sr of semanticResults) {
          const disc = await db
            .select({
              id: discoveries.id,
              title: discoveries.title,
              seedSummary: discoveries.seedSummary,
              status: discoveries.status,
            })
            .from(discoveries)
            .where(eq(discoveries.id, sr.id))
            .limit(1);
          if (disc.length > 0) {
            enriched.push({ ...disc[0], score: sr.score });
          }
        }
        return JSON.stringify({ results: enriched, source: "vectorize" });
      }
    } catch {
      // Fall through to FTS/LIKE
    }
  }

  // 3. 특수문자 이스케이프 (FTS5 + LIKE 공통)
  const escaped = q.replace(/['"*(){}[\]^~\\%_]/g, "");
  if (!escaped) {
    return JSON.stringify({
      results: [],
      message: "유효한 검색어가 없습니다",
    });
  }

  // 4. 길이 제한 (LIKE 패턴 복잡도 방지)
  const safeQuery = escaped.slice(0, 50);

  try {
    // FTS5 시도
    const ftsQuery = `"${safeQuery}"`;
    const results = await db.all(
      sql`SELECT d.id, d.title, d.seed_summary, d.status
          FROM discovery_fts fts
          JOIN discoveries d ON d.id = fts.rowid
          WHERE discovery_fts MATCH ${ftsQuery}
          LIMIT 10`
    );
    return JSON.stringify({ results, source: "fts5" });
  } catch {
    // FTS5 not available, fall back to LIKE (안전한 패턴)
    const likePattern = `%${safeQuery}%`;
    const results = await db
      .select({
        id: discoveries.id,
        title: discoveries.title,
        seedSummary: discoveries.seedSummary,
        status: discoveries.status,
      })
      .from(discoveries)
      .where(
        sql`${discoveries.title} LIKE ${likePattern} OR ${discoveries.seedSummary} LIKE ${likePattern}`
      )
      .limit(10);
    return JSON.stringify({ results, source: "like" });
  }
}

export async function getMetrics(
  db: DB,
  input?: { fromDate?: string; toDate?: string }
): Promise<string> {
  // Build date filter conditions
  const conditions = [];
  if (input?.fromDate) conditions.push(gte(discoveries.createdAt, new Date(input.fromDate)));
  if (input?.toDate) conditions.push(lte(discoveries.createdAt, new Date(input.toDate)));
  const dateFilter = conditions.length > 0 ? and(...conditions) : undefined;

  // 1) Status counts — SQL GROUP BY
  const statusRows = await db
    .select({ status: discoveries.status, count: sql<number>`count(*)` })
    .from(discoveries)
    .where(dateFilter)
    .groupBy(discoveries.status);

  const statusCounts: Record<string, number> = {};
  let total = 0;
  for (const row of statusRows) {
    statusCounts[row.status] = Number(row.count);
    total += Number(row.count);
  }

  // 2) Agent-created count — SQL COUNT + WHERE
  const agentRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(discoveries)
    .where(dateFilter ? and(dateFilter, eq(discoveries.createdByAgent, 1)) : eq(discoveries.createdByAgent, 1));
  const agentCreated = Number(agentRow[0]?.count ?? 0);

  // 3) Average days from creation to due date (for non-INBOX)
  const avgRow = await db
    .select({ avg: sql<number>`avg(julianday(due_date) - julianday(created_at))` })
    .from(discoveries)
    .where(
      dateFilter
        ? and(dateFilter, sql`${discoveries.status} != 'DISCOVERY'`, sql`due_date IS NOT NULL`)
        : and(sql`${discoveries.status} != 'DISCOVERY'`, sql`due_date IS NOT NULL`)
    );
  const avgDaysToOpen = Math.round(Number(avgRow[0]?.avg ?? 0));

  return JSON.stringify({
    total,
    statusCounts,
    agentCreated,
    humanCreated: total - agentCreated,
    avgDaysToOpen,
  });
}

export async function getRadarItems(
  db: DB,
  input: { status?: string; limit?: number; offset?: number }
): Promise<string> {
  const limit = input.limit || 20;
  const offset = input.offset || 0;

  let query = db
    .select({
      id: radarItems.id,
      title: radarItems.title,
      titleKo: radarItems.titleKo,
      summary: radarItems.summary,
      summaryKo: radarItems.summaryKo,
      url: radarItems.url,
      relevanceScore: radarItems.relevanceScore,
      status: radarItems.status,
      discoveryId: radarItems.discoveryId,
      collectedAt: radarItems.collectedAt,
    })
    .from(radarItems);

  if (input.status) {
    query = query.where(eq(radarItems.status, input.status)) as typeof query;
  }

  const results = await query.orderBy(desc(radarItems.collectedAt)).limit(limit + 1).offset(offset);
  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;

  return JSON.stringify({
    total: items.length,
    offset,
    hasMore,
    items: items.map((item) => ({
      ...item,
      collectedAt: item.collectedAt ? new Date(item.collectedAt).toISOString() : null,
    })),
  });
}

export async function getWeeklyReview(db: DB): Promise<string> {
  // Active = all non-terminal statuses except DISCOVERY
  const activeStatuses = [
    DiscoveryStatus.IDEA_CARD, DiscoveryStatus.HYPOTHESIS, DiscoveryStatus.EXPERIMENT,
    DiscoveryStatus.EVIDENCE_REVIEW, DiscoveryStatus.GATE1, DiscoveryStatus.SPRINT,
    DiscoveryStatus.GATE2, DiscoveryStatus.HANDOFF,
  ];
  const openDiscoveries = await db
    .select()
    .from(discoveries)
    .where(sql`${discoveries.status} IN (${sql.join(activeStatuses.map(s => sql`${s}`), sql`, `)})`);

  const now = Date.now();
  const items = [];

  for (const d of openDiscoveries) {
    const exps = await db
      .select()
      .from(experiments)
      .where(eq(experiments.discoveryId, d.id));

    const createdMs = d.createdAt ? new Date(d.createdAt).getTime() : now;
    const dueMs = d.dueDate ? new Date(d.dueDate).getTime() : null;
    const elapsedDays = Math.floor((now - createdMs) / (1000 * 60 * 60 * 24));
    const remainingDays = dueMs ? Math.ceil((dueMs - now) / (1000 * 60 * 60 * 24)) : null;
    const isOverdue = remainingDays !== null && remainingDays < 0;

    const activeExps = exps.filter((e) => !e.completedAt);
    const completedExps = exps.filter((e) => e.completedAt);

    items.push({
      id: d.id,
      title: d.title,
      ownerId: d.ownerId || "미지정",
      elapsedDays,
      remainingDays,
      isOverdue,
      dueDate: dueMs ? new Date(dueMs).toISOString().slice(0, 10) : null,
      experiments: {
        total: exps.length,
        active: activeExps.length,
        completed: completedExps.length,
      },
      activeHypotheses: activeExps.map((e) => e.hypothesis),
    });
  }

  // Sort: overdue first, then by remaining days ascending
  items.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return (a.remainingDays ?? 999) - (b.remainingDays ?? 999);
  });

  return JSON.stringify({
    total: items.length,
    reviewDate: new Date().toISOString().slice(0, 10),
    items,
  });
}

export async function getRecallQueue(db: DB): Promise<string> {
  const now = new Date();
  const notNowDiscoveries = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.status, DiscoveryStatus.HOLD));

  const dueItems = notNowDiscoveries.filter((d) => {
    if (!d.revisitDate) return false;
    return new Date(d.revisitDate) <= now;
  });

  const upcomingItems = notNowDiscoveries.filter((d) => {
    if (!d.revisitDate) return false;
    const revisit = new Date(d.revisitDate);
    const diffDays = (revisit.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays > 0 && diffDays <= 14;
  });

  const formatItem = (d: typeof notNowDiscoveries[0]) => ({
    id: d.id,
    title: d.title,
    ownerId: d.ownerId || "미지정",
    triggerType: d.notNowTriggerType,
    triggerCondition: d.notNowTriggerCondition,
    revisitDate: d.revisitDate ? new Date(d.revisitDate).toISOString().slice(0, 10) : null,
    decisionRationale: d.decisionRationale,
  });

  return JSON.stringify({
    due: { total: dueItems.length, items: dueItems.map(formatItem) },
    upcoming: { total: upcomingItems.length, items: upcomingItems.map(formatItem) },
  });
}

/**
 * Discovery 요약 리포트 생성 (구조화된 마크다운)
 */
export async function generateDiscoveryDigest(
  db: DB,
  input: { discoveryId: string }
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다.", suggestion: "list_discoveries로 기존 목록을 확인해보세요." });

  const d = discovery[0];
  const exps = await db
    .select()
    .from(experiments)
    .where(eq(experiments.discoveryId, input.discoveryId));
  const evs = await db
    .select()
    .from(evidence)
    .where(eq(evidence.discoveryId, input.discoveryId));
  const runs = await db
    .select({
      runId: methodRuns.id,
      methodPackId: methodRuns.methodPackId,
      status: methodRuns.status,
      methodPackName: methodPacks.nameKo,
      tier: methodPacks.tier,
      completedAt: methodRuns.completedAt,
    })
    .from(methodRuns)
    .innerJoin(methodPacks, eq(methodRuns.methodPackId, methodPacks.id))
    .where(eq(methodRuns.discoveryId, input.discoveryId));

  const fmtDate = (v: Date | string | null) =>
    v ? new Date(v).toISOString().slice(0, 10) : "-";

  // Evidence strength distribution
  const strengthDist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const e of evs) {
    if (e.strength in strengthDist) strengthDist[e.strength]++;
  }

  let md = `## Discovery Digest: ${d.title}\n\n`;
  md += `**상태**: ${d.status} | **Owner**: ${d.ownerId || "미지정"} | **생성일**: ${fmtDate(d.createdAt)} | **기한**: ${fmtDate(d.dueDate)}\n\n`;

  // Seed
  md += `## Seed\n\n${d.seedSummary || "요약 없음"}\n\n`;
  if (d.seedLinks) {
    try {
      const links = JSON.parse(d.seedLinks as unknown as string) as string[];
      if (links.length > 0) {
        md += links.map((l) => `- ${l}`).join("\n") + "\n\n";
      }
    } catch { /* ignore */ }
  }

  // Experiments
  md += `## 실험 (${exps.length}/${2})\n\n`;
  if (exps.length === 0) {
    md += "실험 없음\n\n";
  } else {
    for (const e of exps) {
      const status = e.completedAt ? "완료" : "진행 중";
      md += `### ${e.hypothesis} [${status}]\n\n`;
      md += `- **최소 행동**: ${e.minimalAction}\n`;
      md += `- **기한**: ${fmtDate(e.deadline)}\n`;
      md += `- **예상 근거**: ${e.expectedEvidence}\n`;
      if (e.resultSummary) md += `- **결과**: ${e.resultSummary}\n`;
      md += "\n";
    }
  }

  // Evidence
  md += `## 근거 (${evs.length}건)\n\n`;
  if (evs.length > 0) {
    md += `강도 분포: A=${strengthDist.A} B=${strengthDist.B} C=${strengthDist.C} D=${strengthDist.D}\n\n`;
    md += "| 유형 | 강도 | 신뢰도 | 내용 |\n|------|------|--------|------|\n";
    for (const e of evs) {
      const content = e.content.replace(/\|/g, "\\|").replace(/\n/g, " ");
      md += `| ${e.type} | ${e.strength} | ${e.reliabilityLabel || "-"} | ${content.slice(0, 100)} |\n`;
    }
    md += "\n";
  }

  // Method Runs
  if (runs.length > 0) {
    md += `## 방법론 실행 (${runs.length}건)\n\n`;
    for (const r of runs) {
      md += `- **${r.methodPackName}** (${r.tier}) — ${r.status}${r.completedAt ? ` (${fmtDate(r.completedAt)})` : ""}\n`;
    }
    md += "\n";
  }

  // Decision
  if (d.decisionState) {
    md += `## 결정\n\n`;
    md += `**${d.decisionState}**: ${d.decisionRationale || "사유 없음"}\n\n`;
  }

  // HOLD info
  if (d.status === "HOLD") {
    md += `## 보류 정보\n\n`;
    md += `- **트리거**: ${d.notNowTriggerType || "-"}\n`;
    md += `- **조건**: ${d.notNowTriggerCondition || "-"}\n`;
    md += `- **재검토일**: ${fmtDate(d.revisitDate)}\n\n`;
  }

  // DROP info
  if (d.status === "DROP") {
    md += `## 종료 정보\n\n`;
    md += `- **실패 패턴**: ${d.deadEndFailurePattern || "-"}\n`;
    md += `- **근거**: ${d.deadEndEvidenceReason || "-"}\n\n`;
  }

  md += `---\n*생성: ${new Date().toISOString().slice(0, 10)}*`;

  return JSON.stringify({
    discoveryId: d.id,
    title: d.title,
    digest: md,
  });
}

export async function listUsers(db: DB): Promise<string> {
  const allUsers = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users);

  // Filter out system users
  const humanUsers = allUsers.filter(
    (u) => !u.id.startsWith("system-")
  );

  return JSON.stringify({ users: humanUsers });
}

export async function compareDiscoveries(
  db: DB,
  input: { discoveryIds: string[] }
): Promise<string> {
  const ids = input.discoveryIds;
  if (ids.length < 2 || ids.length > 5) {
    return JSON.stringify({ error: "2~5개의 Discovery ID가 필요합니다." });
  }

  const results = await db
    .select({
      id: discoveries.id,
      title: discoveries.title,
      status: discoveries.status,
      ownerId: discoveries.ownerId,
      sourceType: discoveries.sourceType,
      createdAt: discoveries.createdAt,
    })
    .from(discoveries)
    .where(inArray(discoveries.id, ids));

  const expCounts = await db
    .select({
      discoveryId: experiments.discoveryId,
      count: sql<number>`count(*)`,
    })
    .from(experiments)
    .where(inArray(experiments.discoveryId, ids))
    .groupBy(experiments.discoveryId);

  const evCounts = await db
    .select({
      discoveryId: evidence.discoveryId,
      count: sql<number>`count(*)`,
    })
    .from(evidence)
    .where(inArray(evidence.discoveryId, ids))
    .groupBy(evidence.discoveryId);

  const rowMap = new Map(results.map((r) => [r.id, r]));
  const expMap = new Map(expCounts.map((e) => [e.discoveryId, e.count]));
  const evMap = new Map(evCounts.map((e) => [e.discoveryId, e.count]));

  const header = "| 항목 | " + ids.map((id) => rowMap.get(id)?.title?.slice(0, 20) || "(not found)").join(" | ") + " |";
  const sep = "|------|" + ids.map(() => "------").join("|") + "|";
  const fmtDate = (d: unknown) => d ? new Date(d as number).toISOString().slice(0, 10) : "-";
  const rows = [
    "| ID | " + ids.map((id) => id.slice(0, 8)).join(" | ") + " |",
    "| 상태 | " + ids.map((id) => rowMap.get(id)?.status || "-").join(" | ") + " |",
    "| 소유자 | " + ids.map((id) => rowMap.get(id)?.ownerId || "미지정").join(" | ") + " |",
    "| 소스타입 | " + ids.map((id) => rowMap.get(id)?.sourceType || "-").join(" | ") + " |",
    "| 실험 수 | " + ids.map((id) => String(expMap.get(id) || 0)).join(" | ") + " |",
    "| 근거 수 | " + ids.map((id) => String(evMap.get(id) || 0)).join(" | ") + " |",
    "| 생성일 | " + ids.map((id) => fmtDate(rowMap.get(id)?.createdAt)).join(" | ") + " |",
  ];

  return JSON.stringify({
    table: [header, sep, ...rows].join("\n"),
    found: results.length,
    notFound: ids.filter((id) => !rowMap.has(id)),
  });
}

// ── get_industry_context (Strategic Evolution F1) ─────────────────────────

export async function getIndustryContext(
  db: DB,
  input: { industryCode: string; includeRules?: boolean }
): Promise<string> {
  const adapter = await db
    .select()
    .from(industryAdapters)
    .where(eq(industryAdapters.code, input.industryCode))
    .limit(1);

  if (!adapter[0]) {
    return JSON.stringify({
      error: `산업 코드 "${input.industryCode}"에 해당하는 어댑터를 찾을 수 없습니다.`,
      availableCodes: ["manufacturing", "finance", "healthcare", "public", "energy"],
    });
  }

  const a = adapter[0];
  const result: Record<string, unknown> = {
    id: a.id,
    code: a.code,
    name: a.nameKo,
    description: a.description,
    icon: a.icon,
    color: a.color,
    regulatoryFramework: a.regulatoryFramework,
    complianceRequirements: a.complianceRequirements,
    defaultTimeboxDays: a.defaultTimeboxDays,
    evidenceWeightModifiers: a.evidenceWeightModifiers,
  };

  if (input.includeRules !== false) {
    const rules = await db
      .select()
      .from(industryRules)
      .where(
        and(
          eq(industryRules.industryAdapterId, a.id),
          eq(industryRules.enabled, 1)
        )
      );

    result.rules = rules.map((r) => ({
      id: r.id,
      type: r.ruleType,
      name: r.nameKo,
      condition: r.condition,
      action: r.action,
      priority: r.priority,
    }));
    result.ruleCount = rules.length;
  }

  return JSON.stringify(result);
}
