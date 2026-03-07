import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { MatrixService } from "~/features/matrix/service/matrix.service";
import { ScoringService } from "~/features/matrix/service/scoring.service";
import { consensusScores } from "~/features/matrix/db/schema";
import type { ConsensusScoreView, ScoreTrendEntry, LinkedTopic } from "~/features/matrix/types";
import { CellDetailPanel } from "~/features/matrix/ui/CellDetailPanel";
import { ScoreInputForm } from "~/features/matrix/ui/ScoreInputForm";
import { ScoreTrendChart } from "~/features/matrix/ui/ScoreTrendChart";
import { PipelineStageSelector } from "~/features/matrix/ui/PipelineStageSelector";

// ─── 현재 기간 (YYYY-MM) ───
function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Loader ───
export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");

  const cellId = params.cellId;
  if (!cellId) throw json({ error: "cellId required" }, { status: 400 });

  const matrixService = new MatrixService(db);
  const scoringService = new ScoringService(db);
  const period = getCurrentPeriod();

  // 병렬 조회
  const [cell, topics, scores] = await Promise.all([
    matrixService.getCell(cellId),
    matrixService.getCellTopics(cellId),
    scoringService.getScoresByCell(cellId, period),
  ]);

  if (!cell) throw json({ error: "Cell not found" }, { status: 404 });

  // 합의 스코어 (현재 기간)
  const [currentConsensus] = await db
    .select()
    .from(consensusScores)
    .where(and(eq(consensusScores.cellId, cellId), eq(consensusScores.scorePeriod, period)))
    .limit(1);

  // 이전 합의 스코어 (추세용)
  const prevConsensusRows = await db
    .select({
      period: consensusScores.scorePeriod,
      compositeScore: consensusScores.compositeScore,
      clevelScore: consensusScores.clevelScore,
      executionScore: consensusScores.executionScore,
    })
    .from(consensusScores)
    .where(eq(consensusScores.cellId, cellId))
    .orderBy(desc(consensusScores.scorePeriod))
    .limit(6);

  // ConsensusScoreView 변환
  const consensusView: ConsensusScoreView | null = currentConsensus
    ? {
        period: currentConsensus.scorePeriod,
        clevelScore: currentConsensus.clevelScore,
        executionScore: currentConsensus.executionScore,
        signalAdjustment: currentConsensus.signalAdjustment,
        compositeScore: currentConsensus.compositeScore,
        status: currentConsensus.status,
        deviation: currentConsensus.deviation,
        prevComposite: currentConsensus.prevComposite,
        participantCount: currentConsensus.participantCount,
      }
    : null;

  // 추세 데이터 (오래된 순 정렬)
  const trend: ScoreTrendEntry[] = prevConsensusRows.reverse().map((r) => ({
    period: r.period,
    compositeScore: r.compositeScore,
    clevelScore: r.clevelScore,
    executionScore: r.executionScore,
  }));

  // 현재 사용자의 기존 스코어
  const myScore = scores.find((s) => s.scoredBy === ctx.user.id) ?? null;

  return json({
    cell,
    topics: topics as LinkedTopic[],
    consensus: consensusView,
    trend,
    myScore,
    period,
    userId: ctx.user.id,
    scores,
  });
}

// ─── Action ───
export async function action({ params, request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ error: "Unauthorized" }, { status: 401 });

  const cellId = params.cellId;
  if (!cellId) return json({ error: "cellId required" }, { status: 400 });

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "submitScore") {
      const scoringService = new ScoringService(db);
      const period = (formData.get("period") as string) || getCurrentPeriod();
      await scoringService.submitScore(cellId, ctx.user.id, period, {
        strategicFit: parseFloat(formData.get("strategicFit") as string) || 3,
        profitability: parseFloat(formData.get("profitability") as string) || 3,
        marketScalability: parseFloat(formData.get("marketScalability") as string) || 3,
        brandImpact: parseFloat(formData.get("brandImpact") as string) || 3,
        roiExpectation: parseFloat(formData.get("roiExpectation") as string) || 3,
        feasibility: parseFloat(formData.get("feasibility") as string) || 3,
        techDifficulty: parseFloat(formData.get("techDifficulty") as string) || 3,
        referenceExists: parseFloat(formData.get("referenceExists") as string) || 3,
        resourceAvailable: parseFloat(formData.get("resourceAvailable") as string) || 3,
        riskLevel: parseFloat(formData.get("riskLevel") as string) || 3,
        note: (formData.get("note") as string) || undefined,
      });
      return json({ ok: true });
    }

    if (intent === "calculateConsensus") {
      const scoringService = new ScoringService(db);
      const period = (formData.get("period") as string) || getCurrentPeriod();
      await scoringService.calculateConsensus(cellId, period);
      return json({ ok: true });
    }

    if (intent === "updatePipelineStage") {
      const matrixService = new MatrixService(db);
      const pipelineStage = formData.get("pipelineStage") as string;
      if (!pipelineStage) return json({ error: "pipelineStage required" }, { status: 400 });
      await matrixService.updateCell(cellId, { pipelineStage });
      return json({ ok: true });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
  } catch (error) {
    console.error(`[matrix.$cellId.action] ${intent} error:`, error instanceof Error ? error.message : error);
    return json({ error: "Internal error" }, { status: 500 });
  }
}

// ─── Component ───
export default function CellDetailPage() {
  const { cell, topics, consensus, trend, myScore, period } = useLoaderData<typeof loader>();

  // CellDetail 타입으로 변환
  const cellDetail = {
    id: cell.id,
    industryName: cell.industryName,
    functionName: cell.functionName,
    timeHorizon: cell.timeHorizon,
    pipelineStage: cell.pipelineStage,
    status: cell.status,
    description: cell.description,
    revenuePotential: cell.revenuePotential,
    revenueUnit: cell.revenueUnit ?? "krw_100m",
    ownerName: cell.ownerId,
    priority: cell.priority ?? 0,
    tags: cell.tags ? JSON.parse(cell.tags as string) : [],
    latestScore: consensus,
    scoreTrend: trend,
    linkedTopics: topics,
    linkedSignals: [],
  };

  // 기존 스코어를 IndividualScoreInput 형태로 변환
  const existingInput = myScore
    ? {
        strategicFit: myScore.strategicFit,
        profitability: myScore.profitability,
        marketScalability: myScore.marketScalability,
        brandImpact: myScore.brandImpact,
        roiExpectation: myScore.roiExpectation,
        feasibility: myScore.feasibility,
        techDifficulty: myScore.techDifficulty,
        referenceExists: myScore.referenceExists,
        resourceAvailable: myScore.resourceAvailable,
        riskLevel: myScore.riskLevel,
        note: myScore.note ?? undefined,
      }
    : undefined;

  return (
    <div className="space-y-6">
      {/* 뒤로가기 */}
      <Link
        to="/lab/matrix"
        className="inline-flex items-center gap-1 text-xs text-fg-tertiary transition-colors hover:text-lab-accent font-mono-dx"
      >
        ← 매트릭스로 돌아가기
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* 왼쪽: Cell 상세 + 추세 */}
        <div className="space-y-4">
          <CellDetailPanel cell={cellDetail} topics={topics} consensus={consensus} />

          {/* 추세 차트 */}
          <div className="rounded-lg border border-line-subtle bg-surface-secondary p-4">
            <h3
              className="mb-3 text-xs font-bold uppercase tracking-wider text-lab-accent font-mono-dx"
            >
              스코어 추세
            </h3>
            <ScoreTrendChart trend={trend} />
          </div>

          {/* Pipeline Stage */}
          <div className="rounded-lg border border-line-subtle bg-surface-secondary p-4">
            <h3
              className="mb-3 text-xs font-bold uppercase tracking-wider text-lab-accent font-mono-dx"
            >
              파이프라인 단계
            </h3>
            <PipelineStageSelector cellId={cell.id} currentStage={cell.pipelineStage} />
          </div>
        </div>

        {/* 오른쪽: 스코어 입력 */}
        <div className="rounded-lg border border-line-subtle bg-surface-secondary p-4">
          <h3
            className="mb-4 text-xs font-bold uppercase tracking-wider text-lab-accent font-mono-dx"
          >
            {myScore ? "내 스코어 수정" : "스코어 입력"}
          </h3>
          <ScoreInputForm
            cellId={cell.id}
            period={period}
            existingScore={existingInput}
          />
        </div>
      </div>
    </div>
  );
}
