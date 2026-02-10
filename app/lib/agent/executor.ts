/**
 * Agent executor: main loop for processing user messages via Claude API.
 * Handles tool_use → execute → tool_result → continue pattern.
 * Designed for Cloudflare Workers 30s CPU limit (single-step execution).
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { messages, agentConfig, conversations, radarItems } from "~/db/schema";
import type { ClaudeResponse, ClaudeContentBlock } from "./claude-client";
import { callClaude, callClaudeStream, parseSSEStream, CLAUDE_MODEL } from "./claude-client";
import { buildConversationContext } from "./context-builder";
import { buildSystemPrompt } from "./system-prompt";
import { getToolsForAutonomyLevel, TOOL_MIN_AUTONOMY } from "./tool-registry";
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
  tagDiscovery,
  removeDiscoveryTag,
  generateIdeaCandidates,
  selectIdeaCandidate,
  autoFillTemplate,
} from "./tools/discovery-tools";
import {
  listDiscoveries,
  getDiscoveryDetail,
  getExperimentContext,
  searchSimilar,
  getMetrics,
  getRadarItems,
  listUsers,
  getWeeklyReview,
  getRecallQueue,
  generateDiscoveryDigest,
  compareDiscoveries,
  getIndustryContext,
} from "./tools/query-tools";
import {
  listMethodPacks,
  recommendMethods,
  startMethodRun,
  completeMethodRun,
  draftGatePackage,
  getGatePackage,
} from "./tools/method-tools";
import {
  extractEntities,
  linkEntities,
  queryGraph,
  getDuplicateQueue,
  reviewDuplicate,
} from "./tools/ontology-tools";
import {
  registerKpi,
  recordKpiMeasurement,
  getKpiStatus,
  getPipelineHealth,
} from "./tools/indicator-tools";
import {
  linkDiscoveries,
  getLinkedDiscoveries,
} from "./tools/connector-tools";
import {
  requestGateApproval,
  submitGateApproval,
} from "./tools/governance-tools";
import {
  getAlerts,
  acknowledgeAlert,
  manageWebhook,
} from "./tools/alert-tools";
import {
  generateAuditTrail,
  checkRegulatoryCompliance,
  packageEvidenceForAudit,
  formatComplianceReport,
} from "./tools/compliance-tools";
import {
  extractDecisionPattern,
  applyReusableRule,
} from "./tools/asset-tools";
import {
  runShadowComparison,
  getShadowStats,
  analyzeShadowDeviation,
} from "./tools/shadow-tools";
import {
  createValueupAssessment,
  runAiReadinessDiagnosis,
  generateValueupScenario,
  generateDueDiligenceChecklist,
} from "./tools/valueup-tools";
import {
  getTenantInfo,
  manageTenantMembers,
} from "./tools/tenant-tools";

function generateId(): string {
  return crypto.randomUUID();
}

interface ExecuteResult {
  assistantText: string;
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
    result: string;
  }>;
  tokensUsed: { input: number; output: number };
}

async function executeTool(
  db: DB,
  toolName: string,
  toolInput: Record<string, unknown>,
  autonomyLevel?: number,
  tenantId?: string
): Promise<string> {
  // Enforce autonomy level at execution time
  if (autonomyLevel !== undefined) {
    const minLevel = TOOL_MIN_AUTONOMY[toolName] ?? 3;
    if (autonomyLevel < minLevel) {
      return JSON.stringify({
        error: `현재 자율도 레벨(${autonomyLevel})에서는 이 도구(${toolName})를 사용할 수 없습니다. 최소 레벨 ${minLevel} 필요.`,
        suggestion: "설정에서 자율도 레벨을 올리거나, 관리자에게 요청하세요.",
      });
    }
  }

  // Multi-Tenant: 모든 도구 호출에 tenantId 자동 주입
  if (tenantId) {
    toolInput.tenantId = tenantId;
  }

  switch (toolName) {
    case "create_discovery":
      return createDiscovery(db, toolInput as Parameters<typeof createDiscovery>[1]);
    case "update_discovery":
      return updateDiscovery(db, toolInput as Parameters<typeof updateDiscovery>[1]);
    case "promote_discovery":
      return promoteDiscovery(db, toolInput as Parameters<typeof promoteDiscovery>[1]);
    case "transition_stage":
      return transitionStage(db, toolInput as Parameters<typeof transitionStage>[1]);
    case "add_experiment":
      return addExperiment(db, toolInput as Parameters<typeof addExperiment>[1]);
    case "complete_experiment":
      return completeExperiment(db, toolInput as Parameters<typeof completeExperiment>[1]);
    case "add_evidence":
      return addEvidence(db, toolInput as Parameters<typeof addEvidence>[1]);
    case "decide_gate":
    case "decide_next":
      return decideGate(db, toolInput as Parameters<typeof decideGate>[1]);
    case "decide_hold":
    case "decide_not_now":
      return decideHold(db, toolInput as Parameters<typeof decideHold>[1]);
    case "decide_drop":
    case "decide_dead_end":
      return decideDrop(db, toolInput as Parameters<typeof decideDrop>[1]);
    case "request_extension":
      return requestExtension(db, toolInput as Parameters<typeof requestExtension>[1]);
    case "list_discoveries":
      return listDiscoveries(db, toolInput as Parameters<typeof listDiscoveries>[1]);
    case "get_discovery_detail":
      return getDiscoveryDetail(db, toolInput as Parameters<typeof getDiscoveryDetail>[1]);
    case "get_experiment_context":
      return getExperimentContext(db, toolInput as Parameters<typeof getExperimentContext>[1]);
    case "search_similar":
      return searchSimilar(db, toolInput as Parameters<typeof searchSimilar>[1]);
    case "get_metrics":
      return getMetrics(db, toolInput as Parameters<typeof getMetrics>[1]);
    case "get_radar_items":
      return getRadarItems(db, toolInput as Parameters<typeof getRadarItems>[1]);
    case "get_weekly_review":
      return getWeeklyReview(db);
    case "get_recall_queue":
      return getRecallQueue(db);
    case "list_users":
      return listUsers(db);
    case "generate_discovery_digest":
      return generateDiscoveryDigest(db, toolInput as Parameters<typeof generateDiscoveryDigest>[1]);
    case "get_stage_info":
      return getStageInfo(db, toolInput as Parameters<typeof getStageInfo>[1]);
    case "validate_evidence":
      return validateEvidence(db, toolInput as Parameters<typeof validateEvidence>[1]);
    case "list_method_packs":
      return listMethodPacks(db, toolInput as Parameters<typeof listMethodPacks>[1]);
    case "recommend_methods":
      return recommendMethods(db, toolInput as Parameters<typeof recommendMethods>[1]);
    case "start_method_run":
      return startMethodRun(db, toolInput as Parameters<typeof startMethodRun>[1]);
    case "complete_method_run":
      return completeMethodRun(db, toolInput as Parameters<typeof completeMethodRun>[1]);
    case "draft_gate_package":
      return draftGatePackage(db, toolInput as Parameters<typeof draftGatePackage>[1]);
    case "get_gate_package":
      return getGatePackage(db, toolInput as Parameters<typeof getGatePackage>[1]);
    case "extract_entities":
      return extractEntities(db, toolInput as Parameters<typeof extractEntities>[1]);
    case "link_entities":
      return linkEntities(db, toolInput as Parameters<typeof linkEntities>[1]);
    case "query_graph":
      return queryGraph(db, toolInput as Parameters<typeof queryGraph>[1]);
    case "get_duplicate_queue":
      return getDuplicateQueue(db, toolInput as Parameters<typeof getDuplicateQueue>[1]);
    case "review_duplicate":
      return reviewDuplicate(db, toolInput as Parameters<typeof reviewDuplicate>[1]);
    // R3: Indicator tools
    case "register_kpi":
      return registerKpi(db, toolInput as Parameters<typeof registerKpi>[1]);
    case "record_kpi_measurement":
      return recordKpiMeasurement(db, toolInput as Parameters<typeof recordKpiMeasurement>[1]);
    case "get_kpi_status":
      return getKpiStatus(db, toolInput as Parameters<typeof getKpiStatus>[1]);
    case "get_pipeline_health":
      return getPipelineHealth(db, toolInput as Parameters<typeof getPipelineHealth>[1]);
    // R3: Connector tools
    case "link_discoveries":
      return linkDiscoveries(db, toolInput as Parameters<typeof linkDiscoveries>[1]);
    case "get_linked_discoveries":
      return getLinkedDiscoveries(db, toolInput as Parameters<typeof getLinkedDiscoveries>[1]);
    // R3: Governance tools
    case "request_gate_approval":
      return requestGateApproval(db, toolInput as Parameters<typeof requestGateApproval>[1]);
    case "submit_gate_approval":
      return submitGateApproval(db, toolInput as Parameters<typeof submitGateApproval>[1]);
    // R3b: Alert tools
    case "get_alerts":
      return getAlerts(db, toolInput as unknown as Parameters<typeof getAlerts>[1]);
    case "acknowledge_alert":
      return acknowledgeAlert(db, toolInput as unknown as Parameters<typeof acknowledgeAlert>[1]);
    case "manage_webhook":
      return manageWebhook(db, toolInput as unknown as Parameters<typeof manageWebhook>[1]);
    case "compare_discoveries":
      return compareDiscoveries(db, toolInput as Parameters<typeof compareDiscoveries>[1]);
    case "tag_discovery":
      return tagDiscovery(db, toolInput as Parameters<typeof tagDiscovery>[1]);
    case "remove_discovery_tag":
      return removeDiscoveryTag(db, toolInput as Parameters<typeof removeDiscoveryTag>[1]);
    // Strategic Evolution F1: Industry Adapter
    case "get_industry_context":
      return getIndustryContext(db, toolInput as unknown as Parameters<typeof getIndustryContext>[1]);
    // Strategic Evolution F3: Asset tools
    case "extract_decision_pattern":
      return extractDecisionPattern(db, toolInput as unknown as Parameters<typeof extractDecisionPattern>[1]);
    case "apply_reusable_rule":
      return applyReusableRule(db, toolInput as unknown as Parameters<typeof applyReusableRule>[1]);
    // Strategic Evolution F5: Compliance tools
    case "generate_audit_trail":
      return generateAuditTrail(db, toolInput as unknown as Parameters<typeof generateAuditTrail>[1]);
    case "check_regulatory_compliance":
      return checkRegulatoryCompliance(db, toolInput as unknown as Parameters<typeof checkRegulatoryCompliance>[1]);
    case "package_evidence_for_audit":
      return packageEvidenceForAudit(db, toolInput as unknown as Parameters<typeof packageEvidenceForAudit>[1]);
    case "format_compliance_report":
      return formatComplianceReport(db, toolInput as unknown as Parameters<typeof formatComplianceReport>[1]);
    // Strategic Evolution F2: Shadow Mode tools
    case "run_shadow_comparison":
      return runShadowComparison(db, toolInput as unknown as Parameters<typeof runShadowComparison>[1]);
    case "get_shadow_stats":
      return getShadowStats(db, toolInput as unknown as Parameters<typeof getShadowStats>[1]);
    case "analyze_shadow_deviation":
      return analyzeShadowDeviation(db, toolInput as unknown as Parameters<typeof analyzeShadowDeviation>[1]);
    // Strategic Evolution F4: Value-up Engine tools
    case "create_valueup_assessment":
      return createValueupAssessment(db, toolInput as unknown as Parameters<typeof createValueupAssessment>[1]);
    case "run_ai_readiness_diagnosis":
      return runAiReadinessDiagnosis(db, toolInput as unknown as Parameters<typeof runAiReadinessDiagnosis>[1]);
    case "generate_valueup_scenario":
      return generateValueupScenario(db, toolInput as unknown as Parameters<typeof generateValueupScenario>[1]);
    case "generate_due_diligence_checklist":
      return generateDueDiligenceChecklist(db, toolInput as unknown as Parameters<typeof generateDueDiligenceChecklist>[1]);
    // Multi-Tenant tools (F6)
    case "get_tenant_info":
      return getTenantInfo(db, toolInput as unknown as Parameters<typeof getTenantInfo>[1]);
    case "manage_tenant_members":
      return manageTenantMembers(db, toolInput as unknown as Parameters<typeof manageTenantMembers>[1]);
    // BD팀 PoC: 아이디어 후보 & 템플릿
    case "generate_idea_candidates":
      return generateIdeaCandidates(db, toolInput as Parameters<typeof generateIdeaCandidates>[1]);
    case "select_idea_candidate":
      return selectIdeaCandidate(db, toolInput as Parameters<typeof selectIdeaCandidate>[1]);
    case "auto_fill_template":
      return autoFillTemplate(db, toolInput as Parameters<typeof autoFillTemplate>[1]);
    default:
      return JSON.stringify({ error: `알 수 없는 도구: ${toolName}` });
  }
}

/**
 * Execute one agent turn: send user message → get Claude response → handle tools → return final text.
 * Supports multi-step tool use (up to 5 consecutive tool calls per turn).
 */
export type AgentEvent =
  | { type: "tool_call"; name: string; input: Record<string, unknown>; result: string };

export async function executeAgentTurn(
  db: DB,
  apiKey: string,
  conversationId: string,
  userMessage: string,
  onEvent?: (event: AgentEvent) => void,
  tenantId?: string
): Promise<ExecuteResult> {
  // Save user message
  await db.insert(messages).values({
    id: generateId(),
    conversationId,
    role: "user",
    content: userMessage,
  });

  // Get agent config
  const config = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, "default"))
    .limit(1);

  const agentCfg = config[0] || null;

  // BD PoC: 소스 컨텍스트 조회 (conversation.sourceItemId → radarItem)
  let sourceContext: { title?: string; summaryKo?: string; url?: string; keyPoints?: string[] } | null = null;
  try {
    const conv = await db.select({ sourceItemId: conversations.sourceItemId })
      .from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    if (conv[0]?.sourceItemId) {
      const item = await db.select({
        title: radarItems.title, titleKo: radarItems.titleKo,
        summaryKo: radarItems.summaryKo, url: radarItems.url,
        keyPoints: radarItems.keyPoints,
      }).from(radarItems).where(eq(radarItems.id, conv[0].sourceItemId)).limit(1);
      if (item[0]) {
        sourceContext = {
          title: item[0].titleKo || item[0].title || undefined,
          summaryKo: item[0].summaryKo || undefined,
          url: item[0].url || undefined,
          keyPoints: (item[0].keyPoints as string[]) || undefined,
        };
      }
    }
  } catch { /* sourceContext is optional */ }

  const systemPrompt = buildSystemPrompt(agentCfg, sourceContext);
  const modelId = agentCfg?.modelId || CLAUDE_MODEL;
  const autonomyLevel = agentCfg?.autonomyLevel ?? 3;
  const filteredTools = getToolsForAutonomyLevel(autonomyLevel);
  const allToolCalls: ExecuteResult["toolCalls"] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const MAX_TOOL_ROUNDS = 12;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const contextMessages = await buildConversationContext(db, conversationId, modelId);

    const response: ClaudeResponse = await callClaude(apiKey, {
      model: modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages: contextMessages,
      tools: filteredTools.length > 0 ? filteredTools : undefined,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Extract text and tool_use blocks
    const textBlocks = response.content.filter((b) => b.type === "text");
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const assistantText = textBlocks.map((b) => b.text || "").join("");

    if (toolUseBlocks.length === 0 || response.stop_reason !== "tool_use") {
      // No tool calls — save assistant message and return
      await db.insert(messages).values({
        id: generateId(),
        conversationId,
        role: "assistant",
        content: addSummaryHeader(assistantText),
      });

      // Update token usage
      await updateTokenUsage(db, totalInputTokens + totalOutputTokens);

      return {
        assistantText,
        toolCalls: allToolCalls,
        tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
      };
    }

    // Process tool calls
    for (let idx = 0; idx < toolUseBlocks.length; idx++) {
      const toolBlock = toolUseBlocks[idx];
      const toolName = toolBlock.name!;
      const toolInput = toolBlock.input as Record<string, unknown>;
      const toolUseId = toolBlock.id!;

      // Save tool_use message (only first block carries assistantText to avoid duplication)
      await db.insert(messages).values({
        id: toolUseId,
        conversationId,
        role: "tool_use",
        content: idx === 0 ? assistantText : "",
        toolName,
        toolInput,
      });

      // Execute tool
      let toolResult: string;
      try {
        toolResult = await executeTool(db, toolName, toolInput, autonomyLevel, tenantId);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "도구 실행 오류";
        toolResult = JSON.stringify({
          error: `도구 '${toolName}' 실행 실패: ${errorMessage}`,
          suggestion: "입력값을 확인하고 다시 시도해보세요.",
          retryable: false,
        });
      }

      // Save tool_result message
      await db.insert(messages).values({
        id: generateId(),
        conversationId,
        role: "tool_result",
        content: toolResult,
        toolName: toolUseId, // Store tool_use_id in toolName for context builder
      });

      allToolCalls.push({ name: toolName, input: toolInput, result: toolResult });
      onEvent?.({ type: "tool_call", name: toolName, input: toolInput, result: toolResult });
    }
  }

  // If we hit max rounds, save what we have with tool summary
  const toolSummary = allToolCalls.map((tc) => tc.name).join(", ");
  const maxRoundsMessage = `도구 호출 제한(${MAX_TOOL_ROUNDS}회)에 도달했습니다. 수행한 도구: ${toolSummary || "없음"}. 추가 작업이 필요하면 이어서 요청해주세요.`;

  await db.insert(messages).values({
    id: generateId(),
    conversationId,
    role: "assistant",
    content: maxRoundsMessage,
  });

  await updateTokenUsage(db, totalInputTokens + totalOutputTokens);

  return {
    assistantText: maxRoundsMessage,
    toolCalls: allToolCalls,
    tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
  };
}

async function updateTokenUsage(db: DB, tokensUsed: number) {
  const today = new Date().toISOString().slice(0, 10);
  const config = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, "default"))
    .limit(1);

  if (config[0]) {
    const isNewDay = config[0].tokenResetDate !== today;
    await db
      .update(agentConfig)
      .set({
        tokensUsedToday: isNewDay ? tokensUsed : (config[0].tokensUsedToday + tokensUsed),
        tokenResetDate: today,
        updatedAt: new Date(),
      })
      .where(eq(agentConfig.id, "default"));
  }
}

/**
 * Streaming variant: uses callClaudeStream + parseSSEStream for real-time text deltas.
 * SSE events: text_delta, tool_start, tool_call, budget_warning, done, error
 */
export function createAgentStreamResponse(
  db: DB,
  apiKey: string,
  conversationId: string,
  userMessage: string,
  tenantId?: string
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  function send(controller: ReadableStreamDefaultController<Uint8Array>, data: Record<string, unknown>) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  }

  return new ReadableStream({
    async start(controller) {
      try {
        // Save user message
        await db.insert(messages).values({
          id: generateId(),
          conversationId,
          role: "user",
          content: userMessage,
        });

        // Get agent config
        const cfgRows = await db
          .select()
          .from(agentConfig)
          .where(eq(agentConfig.id, "default"))
          .limit(1);

        const agentCfg = cfgRows[0] || null;

        // BD PoC: 소스 컨텍스트 조회
        let sourceCtx: { title?: string; summaryKo?: string; url?: string; keyPoints?: string[] } | null = null;
        try {
          const conv = await db.select({ sourceItemId: conversations.sourceItemId })
            .from(conversations).where(eq(conversations.id, conversationId)).limit(1);
          if (conv[0]?.sourceItemId) {
            const item = await db.select({
              title: radarItems.title, titleKo: radarItems.titleKo,
              summaryKo: radarItems.summaryKo, url: radarItems.url,
              keyPoints: radarItems.keyPoints,
            }).from(radarItems).where(eq(radarItems.id, conv[0].sourceItemId)).limit(1);
            if (item[0]) {
              sourceCtx = {
                title: item[0].titleKo || item[0].title || undefined,
                summaryKo: item[0].summaryKo || undefined,
                url: item[0].url || undefined,
                keyPoints: (item[0].keyPoints as string[]) || undefined,
              };
            }
          }
        } catch { /* optional */ }

        const systemPrompt = buildSystemPrompt(agentCfg, sourceCtx);
        const modelId = agentCfg?.modelId || CLAUDE_MODEL;
        const autonomyLevel = agentCfg?.autonomyLevel ?? 3;
        const filteredTools = getToolsForAutonomyLevel(autonomyLevel);
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        const executedToolNames: string[] = [];

        const MAX_TOOL_ROUNDS = 12;

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const contextMessages = await buildConversationContext(db, conversationId, modelId);

          const rawStream = await callClaudeStream(apiKey, {
            model: modelId,
            max_tokens: 4096,
            system: systemPrompt,
            messages: contextMessages,
            tools: filteredTools.length > 0 ? filteredTools : undefined,
          });

          // Parse SSE stream from Claude
          let assistantText = "";
          const contentBlocks: ClaudeContentBlock[] = [];
          let currentBlockIndex = -1;
          let currentToolInput = "";
          let stopReason: string | undefined;

          for await (const event of parseSSEStream(rawStream)) {
            switch (event.type) {
              case "message_start":
                if (event.message?.usage) {
                  totalInputTokens += event.message.usage.input_tokens;
                }
                break;

              case "content_block_start":
                currentBlockIndex = event.index ?? -1;
                if (event.content_block) {
                  contentBlocks[currentBlockIndex] = { ...event.content_block };
                  if (event.content_block.type === "tool_use") {
                    currentToolInput = "";
                    send(controller, {
                      type: "tool_start",
                      name: event.content_block.name,
                    });
                  }
                }
                break;

              case "content_block_delta":
                if (event.delta?.type === "text_delta" && event.delta.text) {
                  assistantText += event.delta.text;
                  send(controller, {
                    type: "text_delta",
                    content: event.delta.text,
                  });
                } else if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
                  currentToolInput += event.delta.partial_json;
                }
                break;

              case "content_block_stop":
                if (currentBlockIndex >= 0 && contentBlocks[currentBlockIndex]?.type === "tool_use") {
                  try {
                    contentBlocks[currentBlockIndex].input = JSON.parse(currentToolInput);
                  } catch {
                    contentBlocks[currentBlockIndex].input = {};
                  }
                }
                break;

              case "message_delta":
                if (event.delta?.stop_reason) {
                  stopReason = event.delta.stop_reason;
                }
                if (event.usage) {
                  totalOutputTokens += event.usage.output_tokens;
                }
                break;
            }
          }

          const toolUseBlocks = contentBlocks.filter((b) => b?.type === "tool_use");

          if (toolUseBlocks.length === 0 || stopReason !== "tool_use") {
            // No tool calls — save and finish
            await db.insert(messages).values({
              id: generateId(),
              conversationId,
              role: "assistant",
              content: addSummaryHeader(assistantText),
            });

            await updateTokenUsage(db, totalInputTokens + totalOutputTokens);
            await sendBudgetWarning(db, controller, send);
            send(controller, { type: "done", tokensUsed: { input: totalInputTokens, output: totalOutputTokens } });
            controller.close();
            return;
          }

          // Process tool calls
          for (let idx = 0; idx < toolUseBlocks.length; idx++) {
            const toolBlock = toolUseBlocks[idx];
            const toolName = toolBlock.name!;
            const toolInput = (toolBlock.input || {}) as Record<string, unknown>;
            const toolUseId = toolBlock.id || generateId();

            await db.insert(messages).values({
              id: toolUseId,
              conversationId,
              role: "tool_use",
              content: idx === 0 ? assistantText : "",
              toolName,
              toolInput,
            });

            let toolResult: string;
            try {
              toolResult = await executeTool(db, toolName, toolInput, autonomyLevel, tenantId);
            } catch (e) {
              const errorMessage = e instanceof Error ? e.message : "도구 실행 오류";
              toolResult = JSON.stringify({
                error: `도구 '${toolName}' 실행 실패: ${errorMessage}`,
                suggestion: "입력값을 확인하고 다시 시도해보세요.",
                retryable: false,
              });
            }

            await db.insert(messages).values({
              id: generateId(),
              conversationId,
              role: "tool_result",
              content: toolResult,
              toolName: toolUseId,
            });

            executedToolNames.push(toolName);
            // Send tool_call event with result
            let parsedResult: unknown;
            try {
              parsedResult = JSON.parse(toolResult);
            } catch {
              parsedResult = toolResult;
            }
            send(controller, {
              type: "tool_call",
              name: toolName,
              input: toolInput,
              result: parsedResult,
            });
          }
          // Continue to next round for tool_result → Claude response
        }

        // Max rounds reached
        const streamToolSummary = executedToolNames.join(", ");
        const streamMaxRoundsMsg = `도구 호출 제한(${MAX_TOOL_ROUNDS}회)에 도달했습니다. 수행한 도구: ${streamToolSummary || "없음"}. 추가 작업이 필요하면 이어서 요청해주세요.`;

        await db.insert(messages).values({
          id: generateId(),
          conversationId,
          role: "assistant",
          content: streamMaxRoundsMsg,
        });

        await updateTokenUsage(db, totalInputTokens + totalOutputTokens);
        send(controller, { type: "text_delta", content: streamMaxRoundsMsg });
        send(controller, { type: "done", tokensUsed: { input: totalInputTokens, output: totalOutputTokens } });
        controller.close();
      } catch (error) {
        const isApiError = error instanceof Error && (
          error.message.includes("API") ||
          error.message.includes("401") ||
          error.message.includes("429") ||
          error.message.includes("500") ||
          error.message.includes("overloaded")
        );
        send(controller, {
          type: "error",
          message: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
          errorType: isApiError ? "api_error" : "internal_error",
          retryable: isApiError,
          suggestion: isApiError
            ? "잠시 후 다시 시도해주세요."
            : "문제가 지속되면 새 대화를 시작해보세요.",
        });
        controller.close();
      }
    },
  });
}

async function sendBudgetWarning(
  db: DB,
  controller: ReadableStreamDefaultController<Uint8Array>,
  send: (ctrl: ReadableStreamDefaultController<Uint8Array>, data: Record<string, unknown>) => void
) {
  const configAfter = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, "default"))
    .limit(1);

  const cfg = configAfter[0];
  if (cfg) {
    const percentUsed = Math.round((cfg.tokensUsedToday / cfg.dailyTokenBudget) * 100);
    if (percentUsed > 80) {
      send(controller, {
        type: "budget_warning",
        tokensUsedToday: cfg.tokensUsedToday,
        dailyTokenBudget: cfg.dailyTokenBudget,
        percentUsed,
      });
    }
  }
}

/** 500자 이상 응답 상단에 첫 문장 기반 요약 blockquote를 삽입한다. */
function addSummaryHeader(text: string): string {
  if (text.length < 500) return text;
  const firstSentence = text.match(/^[^.!?]*[.!?]/)?.[0]?.trim();
  if (!firstSentence || firstSentence.length > 120) return text;
  return `> **요약**: ${firstSentence}\n\n${text}`;
}
