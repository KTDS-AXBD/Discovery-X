/**
 * Tool registry: aggregates domain-specific tool schemas and controls autonomy-based access.
 * v3: 11-stage pipeline + domain-split architecture
 */

import type { ClaudeTool } from "~/lib/ai";
import {
  DISCOVERY_TOOLS,
  DECISION_TOOLS,
  QUERY_TOOLS,
  METHOD_TOOLS,
  ONTOLOGY_TOOLS,
  PLATFORM_TOOLS,
  STRATEGIC_TOOLS,
  IDEA_SCHEMA_TOOLS,
  MATRIX_TOOLS,
  REQUIREMENTS_TOOLS,
} from "./tool-schemas";

// Minimum autonomy level required to use each tool
export const TOOL_MIN_AUTONOMY: Record<string, number> = {
  // Level 1: read-only queries
  list_discoveries: 1,
  get_discovery_detail: 1,
  get_experiment_context: 1,
  search_similar: 1,
  get_metrics: 1,
  get_radar_items: 1,
  get_weekly_review: 1,
  get_recall_queue: 1,
  list_users: 1,
  get_stage_info: 1,
  validate_evidence: 1,
  list_method_packs: 1,
  get_gate_package: 1,
  generate_discovery_digest: 1,
  // Level 2: create + promote
  recommend_methods: 2,
  draft_gate_package: 2,
  create_discovery: 2,
  update_discovery: 2,
  promote_discovery: 2,
  transition_stage: 2,
  // Ontology graph tools (R2)
  query_graph: 1,
  get_duplicate_queue: 1,
  review_duplicate: 2,
  extract_entities: 3,
  link_entities: 3,
  analyze_patterns: 1,
  analyze_contradictions: 1,
  analyze_clusters: 1,
  analyze_centrality: 1,
  simulate_scenario: 2,
  // Indicator tools (R3)
  get_kpi_status: 1,
  get_pipeline_health: 1,
  register_kpi: 2,
  record_kpi_measurement: 2,
  // Connector tools (R3)
  get_linked_discoveries: 1,
  link_discoveries: 2,
  // Governance tools (R3)
  request_gate_approval: 2,
  submit_gate_approval: 3,
  // Alert tools (R3b)
  get_alerts: 1,
  acknowledge_alert: 2,
  manage_webhook: 2,
  // F8: Compare discoveries (read-only)
  compare_discoveries: 1,
  // F9: Tag management
  tag_discovery: 2,
  remove_discovery_tag: 2,
  // Strategic Evolution F1: Industry Adapter
  get_industry_context: 1,
  // Strategic Evolution F3: Asset tools
  extract_decision_pattern: 2,
  apply_reusable_rule: 3,
  // Strategic Evolution F5: Compliance tools
  generate_audit_trail: 1,
  check_regulatory_compliance: 1,
  package_evidence_for_audit: 2,
  format_compliance_report: 2,
  // Multi-Tenant tools (F6)
  get_tenant_info: 1,
  manage_tenant_members: 3,
  // BD팀 PoC: 아이디어 후보 & 템플릿
  generate_idea_candidates: 2,
  select_idea_candidate: 2,
  auto_fill_template: 2,
  // Idea analysis
  update_idea_analysis: 2,
  // Matrix P2: Agent 통합 (read-only)
  query_matrix_heatmap: 1,
  get_cell_signals: 1,
  get_top_cells: 1,
  // Requirements: 요구사항 검토
  classify_feature_request: 1,
  review_feature_request: 2,
  plan_feature_request: 2,
  // Level 3: full autonomy
  add_experiment: 3,
  complete_experiment: 3,
  add_evidence: 3,
  decide_gate: 3,
  decide_hold: 3,
  decide_drop: 3,
  request_extension: 3,
  start_method_run: 3,
  complete_method_run: 3,
};

export function getToolsForAutonomyLevel(level: number): ClaudeTool[] {
  if (level <= 0) return [];
  return AGENT_TOOLS.filter((tool) => {
    const minLevel = TOOL_MIN_AUTONOMY[tool.name] ?? 3;
    return minLevel <= level;
  });
}

/** 도메인별 도구를 합쳐서 생성한 전체 Agent 도구 배열 */
export const AGENT_TOOLS: ClaudeTool[] = [
  ...DISCOVERY_TOOLS,
  ...DECISION_TOOLS,
  ...QUERY_TOOLS,
  ...METHOD_TOOLS,
  ...ONTOLOGY_TOOLS,
  ...PLATFORM_TOOLS,
  ...STRATEGIC_TOOLS,
  ...IDEA_SCHEMA_TOOLS,
  ...MATRIX_TOOLS,
  ...REQUIREMENTS_TOOLS,
];

/** Ideas 모드 전용 도구 (경량) — update_idea_analysis만 포함 */
export const IDEA_TOOLS: ClaudeTool[] = AGENT_TOOLS.filter(
  (t) => t.name === "update_idea_analysis"
);
