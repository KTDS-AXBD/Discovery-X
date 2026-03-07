/**
 * POST /api/cron/maintenance
 * ?task=log-archive|memory-compact|projection-sync|pattern-extract|all
 * Auth: Authorization: Bearer CRON_SECRET
 *
 * 주간 유지보수 + 일별 패턴 추출 통합 엔드포인트.
 * 권장 cron-job.org 등록:
 *   - 일요일 03:00 KST → POST ?task=all   (log-archive+memory-compact+projection-sync)
 *   - 매일   04:00 KST → POST ?task=pattern-extract
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { decisionLogs, extractedPatterns, reusableRules, tenants, users } from "~/db/schema";
import { graphs, projections } from "~/db/schema-v2";
import { sql, lte, gte, and, isNull, eq, inArray } from "drizzle-orm";
import { MemoryLifecycle } from "~/features/chat/agent/memory-lifecycle";
import { TokenBudgetManager } from "~/lib/cost/token-budget";
import { ProjectionBuilder } from "~/lib/graph/projection";
import { callLLM } from "~/lib/ai";
import type { DB } from "~/db";

// ============================================================================
// Types
// ============================================================================

interface LogArchiveResult {
  archived: number;
  batchId: string;
  errors: string[];
}

interface CompactResult {
  usersProcessed: number;
  totalArchived: number;
  totalDeleted: number;
  totalBudgetEnforced: number;
  merged?: number;
  errors: string[];
}

interface ProjectionSyncResult {
  synced: number;
  skipped: number;
  errors: number;
  details: string[];
}

interface PatternExtractResult {
  logsAnalyzed: number;
  patternsFound: number;
  rulesGenerated: number;
  errors: string[];
}

// ============================================================================
// Task: log-archive — 30일 이상 된 decision_logs 아카이브
// ============================================================================

async function runLogArchive(db: DB): Promise<LogArchiveResult> {
  const errors: string[] = [];
  let totalArchived = 0;

  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const batchId = `archive-${new Date().toISOString().slice(0, 10)}`;

  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  for (const tenant of activeTenants) {
    const tenantId = tenant.id;
    try {
      const targets = await db
        .select({ id: decisionLogs.id })
        .from(decisionLogs)
        .where(
          and(
            lte(decisionLogs.createdAt, new Date(thirtyDaysAgo * 1000)),
            isNull(decisionLogs.archivedAt),
            sql`${decisionLogs.discoveryId} IN (SELECT id FROM discoveries WHERE tenant_id = ${tenantId})`,
          ),
        );

      if (targets.length === 0) continue;

      await db
        .update(decisionLogs)
        .set({ archivedAt: new Date(), archiveBatchId: batchId })
        .where(
          and(
            lte(decisionLogs.createdAt, new Date(thirtyDaysAgo * 1000)),
            isNull(decisionLogs.archivedAt),
            sql`${decisionLogs.discoveryId} IN (SELECT id FROM discoveries WHERE tenant_id = ${tenantId})`,
          ),
        );

      totalArchived += targets.length;
    } catch (error) {
      errors.push(`tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { archived: totalArchived, batchId, errors };
}

// ============================================================================
// Task: memory-compact — Memory Compaction + 토큰 예산 강제 적용
// ============================================================================

async function runMemoryCompact(db: DB, env: Record<string, string>): Promise<CompactResult> {
  const lifecycle = new MemoryLifecycle(db);
  const budgetManager = new TokenBudgetManager(db);
  const apiKey = env.ANTHROPIC_API_KEY;

  // 결정 중심 요약 summarizer — API key가 있을 때만 활성
  const summarizer = apiKey
    ? async (contents: string[]): Promise<string> => {
        const joined = contents.join("\n---\n");
        const res = await callLLM(apiKey, {
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          system: "당신은 메모리 요약 전문가입니다.",
          messages: [
            {
              role: "user",
              content: `다음 대화 기록을 읽고, 대화에서 내려진 결정, 변경된 방향, 식별된 리스크를 중심으로 3문장 이내로 요약하세요.\n\n${joined}`,
            },
          ],
        }, { env });
        const block = res.content?.[0];
        return block && "text" in block && block.text ? block.text : joined.slice(0, 200);
      }
    : undefined;

  const activeUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["admin", "user"]));

  const result: CompactResult = {
    usersProcessed: 0,
    totalArchived: 0,
    totalDeleted: 0,
    totalBudgetEnforced: 0,
    errors: [],
  };

  for (const user of activeUsers) {
    try {
      const compacted = await lifecycle.compact(user.id, summarizer);
      result.usersProcessed++;
      result.totalArchived += compacted.archived;
      result.totalDeleted += compacted.deleted;
      result.merged = (result.merged ?? 0) + compacted.merged;

      const budgetDeleted = await budgetManager.enforceMemoryBudget(user.id);
      result.totalBudgetEnforced += budgetDeleted;
    } catch (e) {
      result.errors.push(`${user.id}: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }

  return result;
}

// ============================================================================
// Task: projection-sync — Projection 일괄 동기화
// ============================================================================

async function runProjectionSync(db: DB): Promise<ProjectionSyncResult> {
  const builder = new ProjectionBuilder(db);

  const result: ProjectionSyncResult = {
    synced: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  const allGraphs = await db.select().from(graphs);

  for (const graph of allGraphs) {
    try {
      const existing = await db
        .select({ sourceHash: projections.sourceHash })
        .from(projections)
        .where(
          and(
            eq(projections.scopeType, graph.scopeType),
            eq(projections.scopeId, graph.scopeId),
          ),
        )
        .get();

      if (existing && existing.sourceHash === graph.contentHash) {
        result.skipped++;
        continue;
      }

      const updated = await builder.syncProjection(
        graph.scopeType as "user" | "topic" | "org",
        graph.scopeId,
      );

      if (updated) result.synced++;
      else result.skipped++;
    } catch (e) {
      result.errors++;
      result.details.push(
        `${graph.scopeType}/${graph.scopeId}: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    }
  }

  return result;
}

// ============================================================================
// Task: pattern-extract — 최근 7일 decision_logs에서 반복 패턴 추출
// ============================================================================

async function runPatternExtract(db: DB): Promise<PatternExtractResult> {
  const errors: string[] = [];
  let totalLogsAnalyzed = 0;
  let totalPatternsFound = 0;
  let totalRulesGenerated = 0;

  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  for (const tenant of activeTenants) {
    const tenantId = tenant.id;
    try {
      const recentLogs = await db
        .select()
        .from(decisionLogs)
        .where(
          and(
            gte(decisionLogs.createdAt, new Date(sevenDaysAgo * 1000)),
            isNull(decisionLogs.archivedAt),
            sql`${decisionLogs.discoveryId} IN (SELECT id FROM discoveries WHERE tenant_id = ${tenantId})`,
          ),
        );

      if (recentLogs.length === 0) continue;

      const clusters: Record<string, typeof recentLogs> = {};
      for (const log of recentLogs) {
        const key = log.decisionType;
        if (!clusters[key]) clusters[key] = [];
        clusters[key].push(log);
      }

      let patternsFound = 0;
      let rulesGenerated = 0;

      for (const [decisionType, logs] of Object.entries(clusters)) {
        if (logs.length < 2) continue;

        const avgConfidence = Math.round(
          logs.reduce((sum, l) => sum + (l.confidenceScore || 0), 0) / logs.length,
        );

        const highConfLogs = logs.filter(
          (l) => l.confidenceScore && l.confidenceScore >= 70,
        );

        if (highConfLogs.length >= 2) {
          const patternId = `pat_cron_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

          await db.insert(extractedPatterns).values({
            id: patternId,
            patternType: "decision",
            name: `${decisionType} 반복 패턴 (자동 추출)`,
            description: `최근 7일간 ${decisionType} 의사결정에서 ${highConfLogs.length}회 고신뢰도 결과 감지`,
            conditions: { decisionType, minFrequency: highConfLogs.length, avgConfidence },
            frequency: highConfLogs.length,
            sourceLogIds: highConfLogs.map((l) => l.id),
            confidenceScore: avgConfidence,
          });

          patternsFound++;

          if (highConfLogs.length >= 3 && avgConfidence >= 80) {
            const ruleId = `rule_auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

            await db.insert(reusableRules).values({
              id: ruleId,
              name: `${decisionType} 자동 추천 규칙`,
              ruleType: "recommendation",
              conditionExpression: { decisionType, minConfidence: 70 },
              actionTemplate: {
                type: "recommend",
                message: `${decisionType} 의사결정에서 ${highConfLogs.length}회 고신뢰도 패턴이 감지되었습니다.`,
              },
              sourcePatternId: patternId,
              enabled: 1,
              priority: 0,
            });

            rulesGenerated++;
          }
        }
      }

      totalLogsAnalyzed += recentLogs.length;
      totalPatternsFound += patternsFound;
      totalRulesGenerated += rulesGenerated;
    } catch (error) {
      errors.push(`tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    logsAnalyzed: totalLogsAnalyzed,
    patternsFound: totalPatternsFound,
    rulesGenerated: totalRulesGenerated,
    errors,
  };
}

// ============================================================================
// Route Handler
// ============================================================================

const VALID_TASKS = ["log-archive", "memory-compact", "projection-sync", "pattern-extract", "all"] as const;
type Task = (typeof VALID_TASKS)[number];

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const env = context.cloudflare.env as unknown as Record<string, string>;
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const task = (url.searchParams.get("task") ?? "all") as Task;

  if (!(VALID_TASKS as ReadonlyArray<string>).includes(task)) {
    return Response.json({ error: `Unknown task: ${task}. Valid: ${VALID_TASKS.join("|")}` }, { status: 400 });
  }

  const db = getDb(env.DB as unknown as D1Database);
  const executedAt = new Date().toISOString();
  const result: Record<string, unknown> = { task, executedAt };

  if (task === "log-archive" || task === "all") {
    result["log-archive"] = await runLogArchive(db);
  }
  if (task === "memory-compact" || task === "all") {
    result["memory-compact"] = await runMemoryCompact(db, env);
  }
  if (task === "projection-sync" || task === "all") {
    result["projection-sync"] = await runProjectionSync(db);
  }
  if (task === "pattern-extract" || task === "all") {
    result["pattern-extract"] = await runPatternExtract(db);
  }

  return Response.json(result);
}
