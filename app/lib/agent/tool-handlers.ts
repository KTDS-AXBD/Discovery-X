/**
 * Tool dispatch Map: tool name → handler 매핑.
 * switch 47-case → Record 기반으로 전환하여 도구 추가 시 한 줄만 수정.
 */

import type { DB } from "~/db";
import { TOOL_MIN_AUTONOMY } from "./tool-registry";
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
  getTenantInfo,
  manageTenantMembers,
} from "./tools/tenant-tools";
import { updateIdeaAnalysis } from "./tools/idea-tools";
import {
  queryMatrixHeatmap,
  getCellSignals,
  getTopCells,
} from "./tools/matrix-tools";

type ToolHandler = (db: DB, input: Record<string, unknown>) => Promise<string>;

// tool name → handler 매핑 (alias 포함)
const TOOL_HANDLER_MAP: Record<string, ToolHandler> = {
  // Discovery 도구
  create_discovery: (db, input) => createDiscovery(db, input as Parameters<typeof createDiscovery>[1]),
  update_discovery: (db, input) => updateDiscovery(db, input as Parameters<typeof updateDiscovery>[1]),
  promote_discovery: (db, input) => promoteDiscovery(db, input as Parameters<typeof promoteDiscovery>[1]),
  transition_stage: (db, input) => transitionStage(db, input as Parameters<typeof transitionStage>[1]),
  add_experiment: (db, input) => addExperiment(db, input as Parameters<typeof addExperiment>[1]),
  complete_experiment: (db, input) => completeExperiment(db, input as Parameters<typeof completeExperiment>[1]),
  add_evidence: (db, input) => addEvidence(db, input as Parameters<typeof addEvidence>[1]),
  // Gate/Hold/Drop + alias
  decide_gate: (db, input) => decideGate(db, input as Parameters<typeof decideGate>[1]),
  decide_next: (db, input) => decideGate(db, input as Parameters<typeof decideGate>[1]),
  decide_hold: (db, input) => decideHold(db, input as Parameters<typeof decideHold>[1]),
  decide_not_now: (db, input) => decideHold(db, input as Parameters<typeof decideHold>[1]),
  decide_drop: (db, input) => decideDrop(db, input as Parameters<typeof decideDrop>[1]),
  decide_dead_end: (db, input) => decideDrop(db, input as Parameters<typeof decideDrop>[1]),
  request_extension: (db, input) => requestExtension(db, input as Parameters<typeof requestExtension>[1]),
  get_stage_info: (db, input) => getStageInfo(db, input as Parameters<typeof getStageInfo>[1]),
  validate_evidence: (db, input) => validateEvidence(db, input as Parameters<typeof validateEvidence>[1]),
  tag_discovery: (db, input) => tagDiscovery(db, input as Parameters<typeof tagDiscovery>[1]),
  remove_discovery_tag: (db, input) => removeDiscoveryTag(db, input as Parameters<typeof removeDiscoveryTag>[1]),
  // BD PoC: 아이디어 후보 & 템플릿
  generate_idea_candidates: (db, input) => generateIdeaCandidates(db, input as Parameters<typeof generateIdeaCandidates>[1]),
  select_idea_candidate: (db, input) => selectIdeaCandidate(db, input as Parameters<typeof selectIdeaCandidate>[1]),
  auto_fill_template: (db, input) => autoFillTemplate(db, input as Parameters<typeof autoFillTemplate>[1]),

  // Query 도구
  list_discoveries: (db, input) => listDiscoveries(db, input as Parameters<typeof listDiscoveries>[1]),
  get_discovery_detail: (db, input) => getDiscoveryDetail(db, input as Parameters<typeof getDiscoveryDetail>[1]),
  get_experiment_context: (db, input) => getExperimentContext(db, input as Parameters<typeof getExperimentContext>[1]),
  search_similar: (db, input) => searchSimilar(db, input as Parameters<typeof searchSimilar>[1]),
  get_metrics: (db, input) => getMetrics(db, input as Parameters<typeof getMetrics>[1]),
  get_radar_items: (db, input) => getRadarItems(db, input as Parameters<typeof getRadarItems>[1]),
  get_weekly_review: (db) => getWeeklyReview(db),
  get_recall_queue: (db) => getRecallQueue(db),
  list_users: (db) => listUsers(db),
  generate_discovery_digest: (db, input) => generateDiscoveryDigest(db, input as Parameters<typeof generateDiscoveryDigest>[1]),
  compare_discoveries: (db, input) => compareDiscoveries(db, input as Parameters<typeof compareDiscoveries>[1]),

  // Method 도구
  list_method_packs: (db, input) => listMethodPacks(db, input as Parameters<typeof listMethodPacks>[1]),
  recommend_methods: (db, input) => recommendMethods(db, input as Parameters<typeof recommendMethods>[1]),
  start_method_run: (db, input) => startMethodRun(db, input as Parameters<typeof startMethodRun>[1]),
  complete_method_run: (db, input) => completeMethodRun(db, input as Parameters<typeof completeMethodRun>[1]),
  draft_gate_package: (db, input) => draftGatePackage(db, input as Parameters<typeof draftGatePackage>[1]),
  get_gate_package: (db, input) => getGatePackage(db, input as Parameters<typeof getGatePackage>[1]),

  // Ontology 도구
  extract_entities: (db, input) => extractEntities(db, input as Parameters<typeof extractEntities>[1]),
  link_entities: (db, input) => linkEntities(db, input as Parameters<typeof linkEntities>[1]),
  query_graph: (db, input) => queryGraph(db, input as Parameters<typeof queryGraph>[1]),
  get_duplicate_queue: (db, input) => getDuplicateQueue(db, input as Parameters<typeof getDuplicateQueue>[1]),
  review_duplicate: (db, input) => reviewDuplicate(db, input as Parameters<typeof reviewDuplicate>[1]),

  // Indicator 도구
  register_kpi: (db, input) => registerKpi(db, input as Parameters<typeof registerKpi>[1]),
  record_kpi_measurement: (db, input) => recordKpiMeasurement(db, input as Parameters<typeof recordKpiMeasurement>[1]),
  get_kpi_status: (db, input) => getKpiStatus(db, input as Parameters<typeof getKpiStatus>[1]),
  get_pipeline_health: (db, input) => getPipelineHealth(db, input as Parameters<typeof getPipelineHealth>[1]),

  // Connector 도구
  link_discoveries: (db, input) => linkDiscoveries(db, input as Parameters<typeof linkDiscoveries>[1]),
  get_linked_discoveries: (db, input) => getLinkedDiscoveries(db, input as Parameters<typeof getLinkedDiscoveries>[1]),

  // Governance 도구
  request_gate_approval: (db, input) => requestGateApproval(db, input as Parameters<typeof requestGateApproval>[1]),
  submit_gate_approval: (db, input) => submitGateApproval(db, input as Parameters<typeof submitGateApproval>[1]),

  // Alert 도구
  get_alerts: (db, input) => getAlerts(db, input as unknown as Parameters<typeof getAlerts>[1]),
  acknowledge_alert: (db, input) => acknowledgeAlert(db, input as unknown as Parameters<typeof acknowledgeAlert>[1]),
  manage_webhook: (db, input) => manageWebhook(db, input as unknown as Parameters<typeof manageWebhook>[1]),

  // Industry Adapter
  get_industry_context: (db, input) => getIndustryContext(db, input as unknown as Parameters<typeof getIndustryContext>[1]),

  // Asset 도구
  extract_decision_pattern: (db, input) => extractDecisionPattern(db, input as unknown as Parameters<typeof extractDecisionPattern>[1]),
  apply_reusable_rule: (db, input) => applyReusableRule(db, input as unknown as Parameters<typeof applyReusableRule>[1]),

  // Compliance 도구
  generate_audit_trail: (db, input) => generateAuditTrail(db, input as unknown as Parameters<typeof generateAuditTrail>[1]),
  check_regulatory_compliance: (db, input) => checkRegulatoryCompliance(db, input as unknown as Parameters<typeof checkRegulatoryCompliance>[1]),
  package_evidence_for_audit: (db, input) => packageEvidenceForAudit(db, input as unknown as Parameters<typeof packageEvidenceForAudit>[1]),
  format_compliance_report: (db, input) => formatComplianceReport(db, input as unknown as Parameters<typeof formatComplianceReport>[1]),

  // Multi-Tenant 도구
  get_tenant_info: (db, input) => getTenantInfo(db, input as unknown as Parameters<typeof getTenantInfo>[1]),
  manage_tenant_members: (db, input) => manageTenantMembers(db, input as unknown as Parameters<typeof manageTenantMembers>[1]),

  // Idea analysis 도구
  update_idea_analysis: (db, input) => updateIdeaAnalysis(db, input as unknown as Parameters<typeof updateIdeaAnalysis>[1]),

  // Matrix P2 도구
  query_matrix_heatmap: (db, input) => queryMatrixHeatmap(db, input as unknown as Parameters<typeof queryMatrixHeatmap>[1]),
  get_cell_signals: (db, input) => getCellSignals(db, input as unknown as Parameters<typeof getCellSignals>[1]),
  get_top_cells: (db, input) => getTopCells(db, input as unknown as Parameters<typeof getTopCells>[1]),
};

export async function executeTool(
  db: DB,
  toolName: string,
  toolInput: Record<string, unknown>,
  autonomyLevel?: number,
  tenantId?: string
): Promise<string> {
  // 자율도 레벨 검증
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

  const handler = TOOL_HANDLER_MAP[toolName];
  if (!handler) {
    return JSON.stringify({ error: `알 수 없는 도구: ${toolName}` });
  }
  return handler(db, toolInput);
}
