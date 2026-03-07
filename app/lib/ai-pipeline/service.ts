/**
 * AI Pipeline Service — Radar → Ideas → Discovery 자동 파이프라인
 * Cron (09:30 KST)에서 호출. CF 30초 제한 대응.
 */

import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import type { DB } from "~/db";
import {
  radarItems,
  RadarItemStatus,
  aiPipelineRuns,
  AIPipelineRunStatus,
  DiscoveryStatus,
  evidence,
} from "~/db/schema";
import { ideas } from "~/features/ideas/db/schema";
import { CLAUDE_MODEL } from "~/lib/agent/claude-client";
import { callLLM } from "~/lib/ai";

/** 클러스터링에는 빠른 Haiku 사용 (CF 30초 제한 대응) */
const FAST_MODEL = "claude-haiku-4-5-20251001";
import { IdeaService } from "~/lib/services/idea.service";
import { DiscoveryEntityService } from "~/lib/services/discovery/entity";
import { DiscoveryWorkflowService } from "~/lib/services/discovery/workflow";
import {
  CLUSTER_SYSTEM_PROMPT,
  IDEA_GENERATION_SYSTEM_PROMPT,
  DISCOVERY_EVALUATION_SYSTEM_PROMPT,
} from "./prompts";

const SYSTEM_AGENT_ID = "system-agent";

/** confidence(0-100) → EvidenceStrength(A-D) 매핑 */
export function mapConfidenceToStrength(confidence: number): string {
  if (confidence >= 80) return "A";
  if (confidence >= 60) return "B";
  if (confidence >= 40) return "C";
  return "D";
}

/** Claude 응답에서 JSON을 추출 (마크다운 코드블록 래퍼 제거) */
function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}
const MAX_ITEMS_PER_RUN = 3;
const MAX_IDEAS_PER_RUN = 1;
const MAX_DISCOVERIES_PER_RUN = 1;
const DISCOVERY_CONFIDENCE_THRESHOLD = 70;
const INTER_CALL_DELAY_MS = 0;
const RUN_TIMEOUT_MS = 23_000;

interface ClusterResult {
  clusters: Array<{
    topic: string;
    itemIds: string[];
    rationale: string;
  }>;
}

interface IdeaResult {
  title: string;
  summary: string;
  whyNow: string;
}

interface EvaluationResult {
  confidence: number;
  hypothesis: string;
  minimalAction: string;
  expectedEvidence: string;
  rationale: string;
}

export interface PipelineRunResult {
  runId: string;
  radarItemsProcessed: number;
  ideasCreated: number;
  discoveriesCreated: number;
  errors: string[];
  tokenUsage: { input: number; output: number };
}

export class AIPipelineService {
  private ideaService: IdeaService;
  private entityService: DiscoveryEntityService;
  private workflowService: DiscoveryWorkflowService;

  constructor(
    private db: DB,
    private apiKey: string,
  ) {
    this.ideaService = new IdeaService(db);
    this.entityService = new DiscoveryEntityService(db);
    this.workflowService = new DiscoveryWorkflowService(db);
  }

  async run(tenantId: string): Promise<PipelineRunResult> {
    const runId = crypto.randomUUID();
    const startTime = Date.now();
    const errors: string[] = [];
    const tokenUsage = { input: 0, output: 0 };
    let ideasCreated = 0;
    let discoveriesCreated = 0;
    let radarItemsProcessed = 0;

    // 1. Create pipeline run record
    await this.db.insert(aiPipelineRuns).values({
      id: runId,
      tenantId,
      status: AIPipelineRunStatus.RUNNING,
    });

    try {
      // 2. Get unprocessed radar items
      const items = await this.getUnprocessedItems(tenantId);
      radarItemsProcessed = items.length;
      if (items.length === 0) {
        await this.completeRun(runId, 0, 0, 0, [], tokenUsage);
        return { runId, radarItemsProcessed: 0, ideasCreated: 0, discoveriesCreated: 0, errors: [], tokenUsage };
      }

      // 3. Cluster items by topic
      const clusters = await this.clusterByTopic(items, tokenUsage);
      if (!clusters || clusters.length === 0) {
        await this.markProcessed(items.map((i) => i.id));
        await this.completeRun(runId, items.length, 0, 0, [], tokenUsage);
        return { runId, radarItemsProcessed: items.length, ideasCreated: 0, discoveriesCreated: 0, errors: [], tokenUsage };
      }

      // 4. For each cluster, generate idea + evaluate for discovery
      for (const cluster of clusters.slice(0, MAX_IDEAS_PER_RUN)) {
        if (Date.now() - startTime > RUN_TIMEOUT_MS) {
          errors.push("Timeout reached, stopping pipeline");
          break;
        }

        try {
          // 4a. Generate idea
          await this.delay();
          const ideaResult = await this.generateIdea(cluster, items, tokenUsage);
          if (!ideaResult) continue;

          const ideaId = await this.ideaService.createFromAgent(
            tenantId,
            SYSTEM_AGENT_ID,
            ideaResult.title,
          );

          // Link sources
          for (const itemId of cluster.itemIds) {
            await this.ideaService.linkSource(ideaId, itemId);
          }

          // Save analysis data
          await this.db
            .update(ideas)
            .set({
              analysisData: {
                summary: ideaResult.summary,
                whyNow: ideaResult.whyNow,
                aiGenerated: true,
                sourceCluster: cluster.topic,
              },
            })
            .where(eq(ideas.id, ideaId));

          ideasCreated++;

          // 4b. Evaluate for discovery promotion
          if (discoveriesCreated >= MAX_DISCOVERIES_PER_RUN) continue;
          if (Date.now() - startTime > RUN_TIMEOUT_MS) break;

          await this.delay();
          const evaluation = await this.evaluateForDiscovery(
            ideaResult,
            cluster,
            items,
            tokenUsage,
          );

          if (!evaluation || evaluation.confidence < DISCOVERY_CONFIDENCE_THRESHOLD) continue;

          // 4c. Promote to discovery
          const discovery = await this.entityService.create(
            {
              title: ideaResult.title,
              seedSummary: `${ideaResult.summary}\n\nWhy Now: ${ideaResult.whyNow}`,
              sourceType: "idea",
              ownerId: SYSTEM_AGENT_ID,
              tenantId,
              sourceIdeaId: ideaId,
              createdByAgent: true,
            },
            SYSTEM_AGENT_ID,
          );

          // Promote DISCOVERY → IDEA_CARD with experiment
          const deadline = new Date();
          deadline.setDate(deadline.getDate() + 14);
          await this.workflowService.promote(
            discovery.id,
            {
              ownerId: SYSTEM_AGENT_ID,
              firstExperiment: {
                hypothesis: evaluation.hypothesis,
                minimalAction: evaluation.minimalAction,
                deadline,
                expectedEvidence: evaluation.expectedEvidence,
              },
            },
            SYSTEM_AGENT_ID,
          );

          // Transition IDEA_CARD → HYPOTHESIS
          await this.workflowService.transition(
            discovery.id,
            DiscoveryStatus.HYPOTHESIS,
            SYSTEM_AGENT_ID,
          );

          // 4d. Auto-create Evidence from Radar source
          const clusterItems = items.filter((i) => cluster.itemIds.includes(i.id));
          const sourceUrl = clusterItems[0]?.url || null;

          let skipEvidence = false;
          if (sourceUrl) {
            const existing = await this.db
              .select({ id: evidence.id })
              .from(evidence)
              .where(and(eq(evidence.discoveryId, discovery.id), eq(evidence.sourceUrl, sourceUrl)))
              .get();
            if (existing) skipEvidence = true;
          }

          if (!skipEvidence) {
            await this.db.insert(evidence).values({
              id: crypto.randomUUID(),
              discoveryId: discovery.id,
              type: "DATA",
              strength: mapConfidenceToStrength(evaluation.confidence),
              content: `[자동생성] ${ideaResult.summary}\n근거: ${evaluation.rationale}`.slice(0, 400),
              reliabilityLabel: "reported",
              sourceUrl,
              createdById: SYSTEM_AGENT_ID,
            });
          }

          discoveriesCreated++;
        } catch (error) {
          errors.push(
            `Cluster "${cluster.topic}": ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }

      // 5. Mark processed
      await this.markProcessed(items.map((i) => i.id));

      // 6. Complete run
      await this.completeRun(runId, items.length, ideasCreated, discoveriesCreated, errors, tokenUsage);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown error");
      await this.db
        .update(aiPipelineRuns)
        .set({
          status: AIPipelineRunStatus.FAILED,
          completedAt: new Date(),
          errors: errors.join("; "),
        })
        .where(eq(aiPipelineRuns.id, runId));
    }

    return { runId, radarItemsProcessed, ideasCreated, discoveriesCreated, errors, tokenUsage };
  }

  private async getUnprocessedItems(_tenantId: string) {
    // Get unprocessed radar items (tenant filtering via radar_sources if needed later)
    return this.db
      .select({
        id: radarItems.id,
        title: radarItems.title,
        titleKo: radarItems.titleKo,
        summary: radarItems.summary,
        summaryKo: radarItems.summaryKo,
        url: radarItems.url,
        keyPoints: radarItems.keyPoints,
      })
      .from(radarItems)
      .where(
        and(
          inArray(radarItems.status, [RadarItemStatus.COLLECTED, RadarItemStatus.SCORED]),
          isNull(radarItems.aiProcessedAt),
        ),
      )
      .limit(MAX_ITEMS_PER_RUN);
  }

  private async clusterByTopic(
    items: Array<{ id: string; title: string; titleKo: string | null; summaryKo: string | null }>,
    tokenUsage: { input: number; output: number },
  ): Promise<ClusterResult["clusters"] | null> {
    const itemsContext = items
      .map((i) => `[${i.id}] ${i.titleKo || i.title}\n${i.summaryKo || ""}`)
      .join("\n---\n");

    try {
      const response = await callLLM(this.apiKey, {
        model: FAST_MODEL,
        max_tokens: 1024,
        system: CLUSTER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: `다음 ${items.length}개 아이템을 클러스터링하세요:\n\n${itemsContext}` }],
      });

      tokenUsage.input += response.usage.input_tokens;
      tokenUsage.output += response.usage.output_tokens;

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text || "")
        .join("");

      const parsed = JSON.parse(extractJSON(text)) as ClusterResult;
      return parsed.clusters;
    } catch {
      return null;
    }
  }

  private async generateIdea(
    cluster: { topic: string; itemIds: string[]; rationale: string },
    allItems: Array<{ id: string; title: string; titleKo: string | null; summaryKo: string | null; keyPoints: string[] | null }>,
    tokenUsage: { input: number; output: number },
  ): Promise<IdeaResult | null> {
    const clusterItems = allItems.filter((i) => cluster.itemIds.includes(i.id));
    const context = clusterItems
      .map((i) => {
        const points = i.keyPoints ? `\n핵심: ${i.keyPoints.join(", ")}` : "";
        return `- ${i.titleKo || i.title}${points}\n  ${i.summaryKo || ""}`;
      })
      .join("\n");

    try {
      const response = await callLLM(this.apiKey, {
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: IDEA_GENERATION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `주제: ${cluster.topic}\n묶은 이유: ${cluster.rationale}\n\n소스:\n${context}`,
          },
        ],
      });

      tokenUsage.input += response.usage.input_tokens;
      tokenUsage.output += response.usage.output_tokens;

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text || "")
        .join("");

      return JSON.parse(extractJSON(text)) as IdeaResult;
    } catch {
      return null;
    }
  }

  private async evaluateForDiscovery(
    idea: IdeaResult,
    cluster: { topic: string; itemIds: string[] },
    allItems: Array<{ id: string; title: string; titleKo: string | null; summaryKo: string | null }>,
    tokenUsage: { input: number; output: number },
  ): Promise<EvaluationResult | null> {
    const sourcesTitles = allItems
      .filter((i) => cluster.itemIds.includes(i.id))
      .map((i) => i.titleKo || i.title)
      .join(", ");

    try {
      const response = await callLLM(this.apiKey, {
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: DISCOVERY_EVALUATION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `아이디어: ${idea.title}\n요약: ${idea.summary}\nWhy Now: ${idea.whyNow}\n소스: ${sourcesTitles}`,
          },
        ],
      });

      tokenUsage.input += response.usage.input_tokens;
      tokenUsage.output += response.usage.output_tokens;

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text || "")
        .join("");

      return JSON.parse(extractJSON(text)) as EvaluationResult;
    } catch {
      return null;
    }
  }

  private async markProcessed(itemIds: string[]) {
    if (itemIds.length === 0) return;
    await this.db
      .update(radarItems)
      .set({ aiProcessedAt: sql`(unixepoch())` })
      .where(inArray(radarItems.id, itemIds));
  }

  private async completeRun(
    runId: string,
    processed: number,
    ideas: number,
    discoveries: number,
    errors: string[],
    tokenUsage: { input: number; output: number },
  ) {
    await this.db
      .update(aiPipelineRuns)
      .set({
        status: AIPipelineRunStatus.COMPLETED,
        completedAt: new Date(),
        radarItemsProcessed: processed,
        ideasCreated: ideas,
        discoveriesCreated: discoveries,
        errors: errors.length > 0 ? errors.join("; ") : null,
        tokenUsageInput: tokenUsage.input,
        tokenUsageOutput: tokenUsage.output,
      })
      .where(eq(aiPipelineRuns.id, runId));
  }

  private delay() {
    return new Promise((r) => setTimeout(r, INTER_CALL_DELAY_MS));
  }
}
