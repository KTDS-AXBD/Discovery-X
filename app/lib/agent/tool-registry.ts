/**
 * Tool registry: defines all tools available to the Agent as Claude function calling schemas.
 * v3: 11-stage pipeline + 2 new tools (get_stage_info, validate_evidence)
 */

import type { ClaudeTool } from "./claude-client";
import { ALL_STATUSES } from "~/lib/constants/status";

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
  // Strategic Evolution F2: Shadow Mode tools
  run_shadow_comparison: 2,
  get_shadow_stats: 1,
  analyze_shadow_deviation: 1,
  // Strategic Evolution F4: Value-up Engine tools
  create_valueup_assessment: 2,
  run_ai_readiness_diagnosis: 2,
  generate_valueup_scenario: 2,
  generate_due_diligence_checklist: 2,
  // Multi-Tenant tools (F6)
  get_tenant_info: 1,
  manage_tenant_members: 3,
  // BD팀 PoC: 아이디어 후보 & 템플릿
  generate_idea_candidates: 2,
  select_idea_candidate: 2,
  auto_fill_template: 2,
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

export const AGENT_TOOLS: ClaudeTool[] = [
  // === Discovery Management ===
  {
    name: "create_discovery",
    description: "새 Discovery를 DISCOVERY 상태로 생성합니다. 생성 전 search_similar로 기존 Discovery와 중복 여부를 확인하세요.",
    input_schema: {
      type: "object",
      required: ["title", "seedSummary", "sourceType"],
      properties: {
        title: { type: "string", description: "Discovery 제목 (80자 이내)", maxLength: 80 },
        seedSummary: { type: "string", description: "Seed 요약 (400자 이내)", maxLength: 400 },
        seedLinks: { type: "array", items: { type: "string" }, description: "관련 링크 목록" },
        sourceType: {
          type: "string",
          enum: ["article", "issue", "internal_pain", "meeting_note", "other"],
          description: "소스 유형",
        },
        industryCode: {
          type: "string",
          enum: ["manufacturing", "finance", "healthcare", "public", "energy", "other"],
          description: "산업 분류 코드 (선택). 지정 시 해당 산업의 규제/규칙이 자동 적용됩니다.",
        },
        candidateGroupId: {
          type: "string",
          description: "아이디어 후보 그룹 ID (generate_idea_candidates 결과, 선택)",
        },
      },
    },
  },
  {
    name: "update_discovery",
    description: "기존 Discovery의 제목, 요약, 링크, Reviewer를 수정합니다. DISCOVERY/IDEA_CARD 상태만 가능.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        title: { type: "string", description: "새 제목 (80자 이내)", maxLength: 80 },
        seedSummary: { type: "string", description: "새 Seed 요약 (400자 이내)", maxLength: 400 },
        seedLinks: { type: "array", items: { type: "string" }, description: "새 관련 링크 목록" },
        reviewerId: { type: "string", description: "Reviewer 사용자 ID" },
      },
    },
  },
  {
    name: "promote_discovery",
    description: "DISCOVERY를 IDEA_CARD 상태로 승격합니다. Owner 지정 + 첫 실험 설계 필수. 호출 전 get_discovery_detail로 현재 상태를 확인하세요. 승격 시 28일 기한이 자동 설정됩니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "ownerId", "hypothesis", "minimalAction", "deadline", "expectedEvidence"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        ownerId: { type: "string", description: "Owner 사용자 ID" },
        hypothesis: { type: "string", description: "검증할 가설. 사용자가 제공한 문구를 그대로 사용", maxLength: 200 },
        minimalAction: { type: "string", description: "가설 검증을 위한 최소 행동", maxLength: 200 },
        deadline: { type: "string", description: "실험 기한 (ISO 8601 날짜)" },
        expectedEvidence: { type: "string", description: "예상 근거 (200자 이내)", maxLength: 200 },
      },
    },
  },
  {
    name: "transition_stage",
    description: "Discovery를 11단계 파이프라인 내 다른 단계로 전환합니다. 허용된 전환만 가능. HOLD/DROP 전환은 decide_hold/decide_drop 전용 도구 사용을 권장합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "toStatus"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        toStatus: {
          type: "string",
          enum: ALL_STATUSES,
          description: "전환할 목표 단계",
        },
        rationale: { type: "string", description: "전환 사유" },
      },
    },
  },
  {
    name: "add_experiment",
    description: "Discovery에 실험을 추가합니다 (최대 2개).",
    input_schema: {
      type: "object",
      required: ["discoveryId", "hypothesis", "minimalAction", "deadline", "expectedEvidence"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        hypothesis: { type: "string", description: "검증할 가설", maxLength: 200 },
        minimalAction: { type: "string", description: "가설 검증을 위한 최소 행동", maxLength: 200 },
        deadline: { type: "string", description: "실험 기한 (ISO 8601 날짜)" },
        expectedEvidence: { type: "string", description: "예상 근거", maxLength: 200 },
      },
    },
  },
  {
    name: "complete_experiment",
    description: "실험을 완료하고 결과를 기록합니다.",
    input_schema: {
      type: "object",
      required: ["experimentId", "resultSummary"],
      properties: {
        experimentId: { type: "string" },
        resultSummary: { type: "string", description: "결과 요약 (400자 이내)", maxLength: 400 },
      },
    },
  },
  {
    name: "add_evidence",
    description: "Discovery에 근거를 추가합니다. reliabilityLabel과 출처(sourceUrl 또는 linkOrAttachment) 중 하나 필수. content가 200자 미만이면 경고합니다. Gate 통과를 위해 publishedOrObservedDate 입력을 권장합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "type", "strength", "content", "reliabilityLabel"],
      properties: {
        discoveryId: { type: "string" },
        type: { type: "string", enum: ["DATA", "USER", "ARTIFACT", "REF", "ASSUMPTION"] },
        strength: { type: "string", enum: ["A", "B", "C", "D"] },
        content: { type: "string", maxLength: 400 },
        reliabilityLabel: { type: "string", enum: ["confirmed", "reported", "hypothesis"], description: "신뢰도 라벨" },
        linkOrAttachment: { type: "string", description: "URL (선택)" },
        sourceUrl: { type: "string", description: "출처 URL (선택, linkOrAttachment와 중 하나 필수)" },
        publishedOrObservedDate: { type: "string", description: "발행/관측일 (YYYY-MM-DD, Gate 통과에 필요)" },
        experimentId: { type: "string", description: "연결할 실험 ID (선택)" },
      },
    },
  },

  // === Decision Tools ===
  {
    name: "decide_gate",
    description: "Discovery를 Gate 단계(GATE1/GATE2)로 전환합니다. 호출 전 validate_evidence로 근거 품질을 확인하세요. A/B급 증거 2개 미만이면 경고합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "decisionRationale"],
      properties: {
        discoveryId: { type: "string" },
        decisionRationale: { type: "string", description: "결정 근거 (400자 이내)", maxLength: 400 },
        gateType: { type: "string", enum: ["GATE1", "GATE2"], description: "Gate 유형 (자동 판단 또는 지정)" },
      },
    },
  },
  {
    name: "decide_hold",
    description: "Discovery를 HOLD(보류) 상태로 전환합니다. notNowTriggerType, notNowTriggerCondition, revisitDate 모두 필수입니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "decisionRationale", "notNowTriggerType", "notNowTriggerCondition", "revisitDate"],
      properties: {
        discoveryId: { type: "string" },
        decisionRationale: { type: "string", maxLength: 400 },
        notNowTriggerType: {
          type: "string",
          enum: ["Technology_Maturity", "Policy_Regulation", "Customer_Behavior", "Internal_Capability"],
        },
        notNowTriggerCondition: { type: "string", maxLength: 200 },
        revisitDate: { type: "string", description: "재검토 날짜 (ISO 8601, 미래)" },
      },
    },
  },
  {
    name: "decide_drop",
    description: "Discovery를 DROP(종료) 상태로 전환합니다. deadEndFailurePattern 1-3개 필수. 되돌릴 수 없으므로 신중하게 사용하세요.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "decisionRationale", "deadEndFailurePattern", "deadEndEvidenceReason"],
      properties: {
        discoveryId: { type: "string" },
        decisionRationale: { type: "string", maxLength: 400 },
        deadEndFailurePattern: {
          type: "array",
          items: { type: "string" },
          description: "실패 패턴 (1~3개): assumption_invalidated, no_user_demand, technical_infeasible, resource_unavailable, regulation_blocked, market_timing_wrong, competitive_moat_insufficient, unit_economics_broken, scope_too_large, dependency_failed, time_constraint",
        },
        deadEndEvidenceReason: { type: "string", maxLength: 200 },
      },
    },
  },
  {
    name: "request_extension",
    description: "실험 2개 소진 후 3번째 실험을 위한 연장을 요청합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "extensionRationale"],
      properties: {
        discoveryId: { type: "string" },
        extensionRationale: { type: "string", maxLength: 400 },
      },
    },
  },

  // === Query Tools ===
  {
    name: "list_discoveries",
    description: "Discovery 목록을 조회합니다. 필터 없으면 전체 목록을 updatedAt 역순으로 반환합니다.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ALL_STATUSES,
          description: "상태 필터 (선택)",
        },
        limit: { type: "number", description: "최대 결과 수 (기본 20)" },
        offset: { type: "number", description: "페이지네이션 오프셋 (기본 0)" },
      },
    },
  },
  {
    name: "get_discovery_detail",
    description: "Discovery 상세 정보(실험, 근거 포함)를 조회합니다. 상태 변경이나 근거 추가 전에 반드시 호출하여 현재 상태를 확인하세요.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string" },
      },
    },
  },
  {
    name: "get_experiment_context",
    description: "실험 설계를 위한 종합 컨텍스트 조회. Method Run 결과(structuredOutput), 미검증 assumptions, 기존 실험, 실험 슬롯 현황 포함. '실험 추가/추천/제안' 요청 시 먼저 호출하여 맥락을 파악하세요.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
      },
    },
  },
  {
    name: "search_similar",
    description: "기존 Discovery 중 유사한 것을 FTS5로 검색합니다. 새 Discovery 생성 전 중복 확인 용도로 사용하세요.",
    input_schema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "검색어" },
      },
    },
  },
  {
    name: "get_metrics",
    description: "시스템 지표를 조회합니다 (상태별 건수, 평균 소요 시간 등). 기간 필터 가능.",
    input_schema: {
      type: "object",
      properties: {
        fromDate: { type: "string", description: "시작 날짜 (ISO 8601, 선택)" },
        toDate: { type: "string", description: "종료 날짜 (ISO 8601, 선택)" },
      },
    },
  },
  {
    name: "get_radar_items",
    description: "Radar에서 수집된 외부 아이템을 조회합니다.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["COLLECTED", "SCORED", "SEEDED", "SKIPPED"],
          description: "상태 필터 (선택)",
        },
        limit: { type: "number", description: "최대 결과 수 (기본 20)" },
        offset: { type: "number", description: "페이지네이션 오프셋 (기본 0)" },
      },
    },
  },
  {
    name: "get_weekly_review",
    description: "주간 리뷰 데이터를 조회합니다. 활성 상태 전체의 경과일, 기한, 실험 상태, 초과 여부를 포함.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_recall_queue",
    description: "재검토 큐를 조회합니다. HOLD 중 revisitDate가 도래한 항목과 14일 이내 도래 항목.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "generate_discovery_digest",
    description: "Discovery의 구조화된 요약 리포트를 마크다운으로 생성합니다. Seed, 실험, 근거, 방법론, 결정 정보를 종합합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
      },
    },
  },
  {
    name: "list_users",
    description: "시스템 사용자 목록을 조회합니다. Owner/Reviewer 지정에 사용.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },

  // === v3 Stage Tools ===
  {
    name: "get_stage_info",
    description: "11단계 파이프라인의 단계 정의와 허용 전환을 조회합니다.",
    input_schema: {
      type: "object",
      properties: {
        stageId: {
          type: "string",
          enum: ALL_STATUSES,
          description: "조회할 단계 ID (생략 시 전체 목록)",
        },
      },
    },
  },
  {
    name: "validate_evidence",
    description: "Discovery의 근거 품질을 검증합니다 (신뢰도 라벨, 출처, 발행일 등).",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string" },
        evidenceId: { type: "string", description: "특정 근거 ID (생략 시 전체 검증)" },
      },
    },
  },

  // === Method Pack Tools (v3 R1) ===
  {
    name: "list_method_packs",
    description: "방법론 팩 목록을 조회합니다. 현재 단계(stage)나 티어(tier)로 필터 가능.",
    input_schema: {
      type: "object",
      properties: {
        stage: {
          type: "string",
          enum: ALL_STATUSES,
          description: "적용 가능한 단계 필터 (선택)",
        },
        tier: {
          type: "string",
          enum: ["Tier-0", "Tier-1", "Tier-2"],
          description: "티어 필터 (선택)",
        },
      },
    },
  },
  {
    name: "recommend_methods",
    description: "Discovery의 현재 단계에 맞는 방법론 2-3개를 추천합니다. Tier-0 우선.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string" },
      },
    },
  },
  {
    name: "start_method_run",
    description: "방법론 팩 실행을 시작합니다. template_prompt를 반환하여 대화 기반 실행을 유도합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "methodPackId"],
      properties: {
        discoveryId: { type: "string" },
        methodPackId: { type: "string", description: "Method Pack ID (예: MP-01)" },
        conversationId: { type: "string", description: "연결할 대화 ID (선택)" },
      },
    },
  },
  {
    name: "complete_method_run",
    description: "방법론 실행을 완료하고 structured output을 저장합니다.",
    input_schema: {
      type: "object",
      required: ["runId", "structuredOutput"],
      properties: {
        runId: { type: "string" },
        structuredOutput: { type: "object", description: "실행 결과 (JSON)" },
        evidenceIds: {
          type: "array",
          items: { type: "string" },
          description: "연결할 근거 ID 목록 (선택)",
        },
      },
    },
  },
  {
    name: "draft_gate_package",
    description: "Gate1/2 의사결정 패키지를 자동 초안합니다. 근거, 방법론 실행, 가정을 종합합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "gateType"],
      properties: {
        discoveryId: { type: "string" },
        gateType: {
          type: "string",
          enum: ["GATE1", "GATE2"],
          description: "Gate 유형",
        },
      },
    },
  },
  {
    name: "get_gate_package",
    description: "Gate 의사결정 패키지를 조회합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string" },
        gateType: {
          type: "string",
          enum: ["GATE1", "GATE2"],
          description: "Gate 유형 필터 (선택)",
        },
      },
    },
  },

  // === Ontology Graph Tools (v3 R2) ===
  {
    name: "extract_entities",
    description: "Discovery의 Evidence에서 엔티티를 추출하여 맥락 그래프 노드를 생성합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "entities"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        entities: {
          type: "array",
          items: {
            type: "object",
            required: ["label", "ontologyTypeId"],
            properties: {
              label: { type: "string", description: "엔티티 이름" },
              ontologyTypeId: { type: "string", description: "온톨로지 타입 ID (ONT-01~ONT-10)" },
              sourceEvidenceId: { type: "string", description: "출처 Evidence ID (선택)" },
              metadata: { type: "object", description: "추가 속성 (선택)" },
            },
          },
          description: "추출된 엔티티 목록",
        },
      },
    },
  },
  {
    name: "link_entities",
    description: "맥락 그래프에서 두 노드를 관계로 연결합니다. 동일 Discovery 소속만 가능.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "fromNodeId", "toNodeId", "relationType"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        fromNodeId: { type: "string", description: "출발 노드 ID" },
        toNodeId: { type: "string", description: "도착 노드 ID" },
        relationType: {
          type: "string",
          enum: ["supports", "contradicts", "causes", "relates_to", "depends_on"],
          description: "관계 타입",
        },
        strength: { type: "number", description: "관계 강도 0~1 (기본 1.0)" },
        sourceEvidenceId: { type: "string", description: "출처 Evidence ID (선택)" },
      },
    },
  },
  {
    name: "query_graph",
    description: "Discovery의 맥락 그래프(노드+엣지+통계)를 조회합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        ontologyTypeId: { type: "string", description: "온톨로지 타입 필터 (선택)" },
      },
    },
  },
  {
    name: "get_duplicate_queue",
    description: "미검토 근거 중복 후보 목록을 조회합니다 (유사도순 정렬).",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "최대 결과 수 (기본 20)" },
      },
    },
  },
  {
    name: "review_duplicate",
    description: "근거 중복 후보를 검토합니다 (병합 또는 무시).",
    input_schema: {
      type: "object",
      required: ["candidateId", "decision"],
      properties: {
        candidateId: { type: "string", description: "중복 후보 ID" },
        decision: {
          type: "string",
          enum: ["merge", "ignore"],
          description: "검토 결정",
        },
        mergeTargetId: { type: "string", description: "병합 시 유지할 Evidence ID (선택)" },
      },
    },
  },

  // === Indicator Tools (v3 R3) ===
  {
    name: "register_kpi",
    description: "Discovery에 KPI(선행지표)를 등록합니다 (최대 5개). Method Pack 연결 가능.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "name", "unit"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        name: { type: "string", description: "KPI 이름 (예: 사용자 전환율, 응답 시간)" },
        unit: { type: "string", description: "단위 (예: %, ms, 건)" },
        targetValue: { type: "number", description: "목표값 (선택)" },
        warningThreshold: { type: "number", description: "경고 임계치 (선택)" },
        criticalThreshold: { type: "number", description: "위험 임계치 (선택)" },
        direction: {
          type: "string",
          enum: ["higher_is_better", "lower_is_better"],
          description: "방향성 (기본: higher_is_better)",
        },
        methodPackId: { type: "string", description: "연결할 Method Pack ID (선택)" },
      },
    },
  },
  {
    name: "record_kpi_measurement",
    description: "KPI 측정값을 기록합니다. 임계치 위반 시 경고를 반환합니다.",
    input_schema: {
      type: "object",
      required: ["kpiId", "value"],
      properties: {
        kpiId: { type: "string", description: "KPI ID" },
        value: { type: "number", description: "측정값" },
        note: { type: "string", description: "측정 메모 (선택)" },
        measuredAt: { type: "string", description: "측정 시점 (ISO 8601, 기본: 현재)" },
      },
    },
  },
  {
    name: "get_kpi_status",
    description: "Discovery의 KPI 현황을 조회합니다. 최근 10개 측정값, 임계치 상태, 트렌드 포함.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
      },
    },
  },
  {
    name: "get_pipeline_health",
    description: "시스템 전체 파이프라인 건강지표를 조회합니다. 단계별 체류시간, 전환율, 근거 품질, 기한 초과 등.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },

  // === Connector Tools (v3 R3) ===
  {
    name: "link_discoveries",
    description: "두 Discovery를 관계로 연결합니다. similar/alternative는 양방향 자동 생성.",
    input_schema: {
      type: "object",
      required: ["fromDiscoveryId", "toDiscoveryId", "linkType"],
      properties: {
        fromDiscoveryId: { type: "string", description: "출발 Discovery ID" },
        toDiscoveryId: { type: "string", description: "도착 Discovery ID" },
        linkType: {
          type: "string",
          enum: ["predecessor", "successor", "similar", "alternative"],
          description: "관계 유형",
        },
        note: { type: "string", description: "관계 설명 (선택)" },
      },
    },
  },
  {
    name: "get_linked_discoveries",
    description: "Discovery에 연결된 다른 Discovery 목록을 조회합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
      },
    },
  },

  // === Governance Tools (v3 R3) ===
  {
    name: "request_gate_approval",
    description: "Gate 패키지에 대해 리뷰어에게 승인 요청을 생성합니다. SLA 기한 설정 가능.",
    input_schema: {
      type: "object",
      required: ["gatePackageId", "reviewerIds"],
      properties: {
        gatePackageId: { type: "string", description: "Gate 패키지 ID" },
        reviewerIds: {
          type: "array",
          items: { type: "string" },
          description: "리뷰어 사용자 ID 목록",
        },
        slaDeadlineDays: { type: "number", description: "SLA 기한 (일, 선택)" },
      },
    },
  },
  {
    name: "submit_gate_approval",
    description: "Gate 승인 요청에 대해 승인/거부/조건부 결정을 제출합니다.",
    input_schema: {
      type: "object",
      required: ["approvalId", "decision"],
      properties: {
        approvalId: { type: "string", description: "승인 요청 ID" },
        decision: {
          type: "string",
          enum: ["APPROVED", "REJECTED", "CONDITIONAL"],
          description: "결정",
        },
        comment: { type: "string", description: "코멘트 (선택)" },
      },
    },
  },

  // === Alert Tools (v3 R3b) ===
  {
    name: "get_alerts",
    description: "알림 목록을 조회합니다. severity(info/warning/critical)와 acknowledged 상태로 필터 가능.",
    input_schema: {
      type: "object",
      properties: {
        severity: {
          type: "string",
          enum: ["info", "warning", "critical"],
          description: "심각도 필터 (선택)",
        },
        acknowledged: {
          type: "boolean",
          description: "확인 여부 필터 (선택, false=미확인만)",
        },
        limit: { type: "number", description: "최대 결과 수 (기본 20)" },
      },
    },
  },
  {
    name: "acknowledge_alert",
    description: "알림을 확인(acknowledge) 처리합니다.",
    input_schema: {
      type: "object",
      required: ["alertId"],
      properties: {
        alertId: { type: "string", description: "알림 ID" },
        userId: { type: "string", description: "확인자 사용자 ID (선택)" },
      },
    },
  },
  {
    name: "manage_webhook",
    description: "웹훅 설정을 관리합니다 (생성/수정/삭제/목록). Slack, Teams, Custom 지원.",
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: ["create", "update", "delete", "list"],
          description: "수행할 작업",
        },
        webhookId: { type: "string", description: "웹훅 ID (update/delete 시 필수)" },
        name: { type: "string", description: "웹훅 이름 (create 시 필수)" },
        url: { type: "string", description: "웹훅 URL (create 시 필수)" },
        platform: {
          type: "string",
          enum: ["slack", "teams", "custom"],
          description: "플랫폼 (기본: custom)",
        },
        events: {
          type: "array",
          items: { type: "string" },
          description: "구독 이벤트 타입 (예: ['kpi_threshold', 'overdue'], 기본: ['*'])",
        },
        headers: {
          type: "object",
          description: "커스텀 헤더 (선택)",
        },
        enabled: { type: "boolean", description: "활성화 여부 (기본: true)" },
      },
    },
  },
  {
    name: "compare_discoveries",
    description: "여러 Discovery를 나란히 비교 테이블로 보여줍니다. 2~5개 ID를 지정하세요.",
    input_schema: {
      type: "object",
      required: ["discoveryIds"],
      properties: {
        discoveryIds: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 5,
          description: "비교할 Discovery ID 배열 (2~5개)",
        },
      },
    },
  },
  {
    name: "tag_discovery",
    description: "Discovery에 태그를 추가합니다. 최대 10개, 소문자 하이픈 형식.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "tags"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        tags: {
          type: "array",
          items: { type: "string", maxLength: 20 },
          description: "추가할 태그 배열",
        },
      },
    },
  },
  {
    name: "remove_discovery_tag",
    description: "Discovery에서 태그를 제거합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "tags"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "제거할 태그 배열",
        },
      },
    },
  },

  // === Industry Adapter Tools (Strategic Evolution F1) ===
  {
    name: "get_industry_context",
    description: "특정 산업의 규제 환경, 준수 사항, 적용 가능한 규칙을 조회합니다.",
    input_schema: {
      type: "object",
      required: ["industryCode"],
      properties: {
        industryCode: {
          type: "string",
          enum: ["manufacturing", "finance", "healthcare", "public", "energy"],
          description: "산업 분류 코드",
        },
        includeRules: { type: "boolean", description: "규칙 목록 포함 여부 (기본: true)" },
      },
    },
  },

  // === Asset Tools (Strategic Evolution F3) ===
  {
    name: "extract_decision_pattern",
    description: "특정 Discovery의 의사결정 패턴을 분석하고 재사용 가능한 규칙으로 추출합니다. decision_logs에 축적된 로그를 기반으로 성공/실패 패턴을 식별합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        patternType: {
          type: "string",
          enum: ["success", "failure", "decision", "workflow"],
          description: "추출할 패턴 유형 (선택)",
        },
        minConfidence: {
          type: "integer",
          description: "최소 신뢰도 기준 (0~100, 기본 70)",
        },
      },
    },
  },
  {
    name: "apply_reusable_rule",
    description: "재사용 가능한 규칙을 현재 Discovery에 적용합니다. 기본 dry run 모드로 적용 가능 여부만 확인합니다.",
    input_schema: {
      type: "object",
      required: ["ruleId", "discoveryId"],
      properties: {
        ruleId: { type: "string", description: "재사용 규칙 ID" },
        discoveryId: { type: "string", description: "Discovery ID" },
        dryRun: { type: "boolean", description: "테스트 실행 여부 (기본: true)" },
      },
    },
  },

  // === Compliance Tools (Strategic Evolution F5) ===
  {
    name: "generate_audit_trail",
    description: "특정 Discovery의 전체 감사 추적 보고서를 생성합니다. 모든 상태 변경, 의사결정, 근거를 타임라인으로 정리합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        format: {
          type: "string",
          enum: ["json", "markdown", "html"],
          description: "출력 형식 (기본: markdown)",
        },
        dateRange: {
          type: "object",
          properties: {
            from: { type: "string", description: "시작 날짜 (YYYY-MM-DD)" },
            to: { type: "string", description: "종료 날짜 (YYYY-MM-DD)" },
          },
          description: "날짜 범위 필터 (선택)",
        },
        includeConversations: { type: "boolean", description: "대화 내용 포함 여부 (기본: false)" },
      },
    },
  },
  {
    name: "check_regulatory_compliance",
    description: "Discovery가 해당 산업의 규제 요건을 충족하는지 검증합니다. 산업 어댑터가 지정된 경우에만 의미 있는 결과를 반환합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        checklistOnly: { type: "boolean", description: "체크리스트만 반환 (기본: false)" },
        autoFix: { type: "boolean", description: "자동 수정 시도 (기본: false)" },
      },
    },
  },
  {
    name: "package_evidence_for_audit",
    description: "감사 대응을 위한 근거 패키지를 생성합니다. 관련 Evidence, 첨부파일, 타임라인을 종합합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        auditType: {
          type: "string",
          enum: ["internal", "external", "regulatory", "national_assembly"],
          description: "감사 유형 (기본: internal)",
        },
        includeAttachments: { type: "boolean", description: "첨부파일 목록 포함 (기본: true)" },
        includeTimeline: { type: "boolean", description: "이벤트 타임라인 포함 (기본: true)" },
      },
    },
  },
  {
    name: "format_compliance_report",
    description: "규제 준수 보고서를 표준 양식으로 포맷팅합니다. Executive Summary, 상세 감사, Gate 리뷰, 체크리스트 유형을 지원합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "reportType"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        reportType: {
          type: "string",
          enum: ["executive_summary", "detailed_audit", "gate_review", "compliance_checklist"],
          description: "보고서 유형",
        },
        outputFormat: {
          type: "string",
          enum: ["markdown", "html", "pdf_template"],
          description: "출력 형식 (기본: markdown)",
        },
        language: {
          type: "string",
          enum: ["ko", "en"],
          description: "언어 (기본: ko)",
        },
      },
    },
  },

  // === Shadow Mode Tools (Strategic Evolution F2) ===
  {
    name: "run_shadow_comparison",
    description: "특정 의사결정에 대해 AI가 독립적으로 판단한 결과를 생성하고, 실제 판단과 비교합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "triggerType", "baselineDecision"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        triggerType: {
          type: "string",
          enum: ["gate_decision", "stage_transition", "evidence_evaluation", "method_selection"],
          description: "트리거 유형",
        },
        baselineDecision: {
          type: "object",
          description: "실제 판단 { action, rationale, actor }",
          properties: {
            action: { type: "string", description: "실제 판단 결과 (GO/NO_GO 등)" },
            rationale: { type: "string", description: "판단 근거" },
            actor: { type: "string", description: "판단자" },
          },
          required: ["action"],
        },
        triggerRefId: { type: "string", description: "원본 참조 ID (gate_package ID 등)" },
        contextOverride: { type: "object", description: "컨텍스트 오버라이드 (테스트용)" },
      },
    },
  },
  {
    name: "get_shadow_stats",
    description: "Shadow Mode 운영 통계를 조회합니다. 일치율 트렌드, 이탈 유형 분포, 기간별 분석을 제공합니다.",
    input_schema: {
      type: "object",
      properties: {
        discoveryId: { type: "string", description: "특정 Discovery (생략 시 전체)" },
        period: {
          type: "string",
          enum: ["7d", "30d", "90d", "all"],
          description: "조회 기간 (기본: 30d)",
        },
        groupBy: {
          type: "string",
          enum: ["trigger_type", "deviation_category", "discovery"],
          description: "그룹 기준 (기본: trigger_type)",
        },
      },
    },
  },
  {
    name: "analyze_shadow_deviation",
    description: "특정 Shadow Run의 이탈 원인을 심층 분석합니다. 이탈 카테고리를 분류하고 개선 제안을 생성합니다.",
    input_schema: {
      type: "object",
      required: ["shadowRunId"],
      properties: {
        shadowRunId: { type: "string", description: "Shadow Run ID" },
        generateSuggestion: { type: "boolean", description: "개선 제안 생성 여부 (기본: true)" },
      },
    },
  },

  // === Value-up Engine Tools (Strategic Evolution F4) ===
  {
    name: "create_valueup_assessment",
    description: "Value-up 평가를 시작합니다. 대상 프로필을 입력받아 평가를 생성합니다.",
    input_schema: {
      type: "object",
      required: ["targetName", "assessmentType"],
      properties: {
        targetName: { type: "string", description: "평가 대상명" },
        targetDescription: { type: "string", description: "대상 설명" },
        assessmentType: {
          type: "string",
          enum: ["acquisition", "partnership", "investment", "transformation"],
          description: "평가 유형",
        },
        discoveryId: { type: "string", description: "연결할 Discovery ID (선택)" },
        industryCode: {
          type: "string",
          enum: ["manufacturing", "finance", "healthcare", "public", "energy", "other"],
          description: "산업 분류",
        },
        targetProfile: {
          type: "object",
          description: "대상 프로필 { revenue, employees, techStack, marketPosition }",
          properties: {
            revenue: { type: "string" },
            employees: { type: "integer" },
            techStack: { type: "array", items: { type: "string" } },
            marketPosition: { type: "string" },
          },
        },
      },
    },
  },
  {
    name: "run_ai_readiness_diagnosis",
    description: "6차원 AI Readiness 자동 진단을 실행합니다. 대상 프로필을 분석하여 각 차원별 점수와 근거를 생성합니다.",
    input_schema: {
      type: "object",
      required: ["assessmentId"],
      properties: {
        assessmentId: { type: "string", description: "Value-up 평가 ID" },
        dimensions: {
          type: "array",
          items: {
            type: "string",
            enum: ["ai_readiness", "market_position", "tech_maturity", "culture_fit", "financial_health", "regulatory_compliance"],
          },
          description: "진단할 차원 (생략 시 6개 전체)",
        },
        useIndustryBenchmark: { type: "boolean", description: "산업 벤치마크 적용 (기본: true)" },
      },
    },
  },
  {
    name: "generate_valueup_scenario",
    description: "Value-up 전환 시나리오를 생성합니다. Optimistic/Base/Pessimistic 3가지 시나리오와 가치 예측을 제공합니다.",
    input_schema: {
      type: "object",
      required: ["assessmentId"],
      properties: {
        assessmentId: { type: "string", description: "Value-up 평가 ID" },
        scenarioTypes: {
          type: "array",
          items: { type: "string", enum: ["optimistic", "base", "pessimistic"] },
          description: "생성할 시나리오 유형 (기본: 3가지 전체)",
        },
        projectionMonths: { type: "integer", description: "가치 예측 기간 (월, 기본: 24)" },
      },
    },
  },
  {
    name: "generate_due_diligence_checklist",
    description: "산업별 Due Diligence 체크리스트를 자동 생성합니다. 산업 어댑터의 규제 요건을 반영합니다.",
    input_schema: {
      type: "object",
      required: ["assessmentId"],
      properties: {
        assessmentId: { type: "string", description: "Value-up 평가 ID" },
        checklistTypes: {
          type: "array",
          items: { type: "string", enum: ["due_diligence", "pmi", "regulatory", "technical"] },
          description: "체크리스트 유형 (기본: due_diligence)",
        },
      },
    },
  },

  // === Multi-Tenant Tools (F6) ===
  {
    name: "get_tenant_info",
    description: "현재 조직 정보를 조회합니다. 멤버 목록, 설정, 사용량을 확인합니다.",
    input_schema: {
      type: "object",
      properties: {
        includeMembers: { type: "boolean", description: "멤버 목록 포함 (기본: true)" },
        includeUsage: { type: "boolean", description: "사용량 통계 포함 (기본: false)" },
      },
    },
  },
  {
    name: "manage_tenant_members",
    description: "조직 멤버를 관리합니다. 초대, 역할 변경, 제거 작업을 수행합니다.",
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: ["invite", "update_role", "remove"],
          description: "수행할 작업",
        },
        userEmail: { type: "string", description: "대상 사용자 이메일 (invite)" },
        userId: { type: "string", description: "대상 사용자 ID (update_role/remove)" },
        role: {
          type: "string",
          enum: ["admin", "gatekeeper", "member", "viewer"],
          description: "부여할 역할 (invite/update_role)",
        },
      },
    },
  },

  // === BD팀 PoC: 아이디어 후보 & 템플릿 도구 ===
  {
    name: "generate_idea_candidates",
    description: "현재 대화 맥락(소스, 분석 결과)을 바탕으로 사업 아이디어 후보를 최대 3개 생성합니다. 반환된 candidateGroupId로 create_discovery를 N회 호출하세요.",
    input_schema: {
      type: "object",
      required: ["count"],
      properties: {
        count: {
          type: "number",
          description: "생성할 후보 수 (1~3)",
          minimum: 1,
          maximum: 3,
        },
        sourceContext: {
          type: "string",
          description: "참고할 소스/대화 요약 (선택)",
        },
        industryCode: {
          type: "string",
          enum: ["manufacturing", "finance", "healthcare", "public", "energy", "other"],
          description: "산업 분류 코드 (선택)",
        },
      },
    },
  },
  {
    name: "select_idea_candidate",
    description: "아이디어 후보 그룹에서 1개를 선택합니다. 선택된 후보는 IDEA_CARD로 승격되고, 나머지는 DROP됩니다.",
    input_schema: {
      type: "object",
      required: ["candidateGroupId", "selectedDiscoveryId"],
      properties: {
        candidateGroupId: { type: "string", description: "후보 그룹 ID" },
        selectedDiscoveryId: { type: "string", description: "선택할 Discovery ID" },
        reason: { type: "string", description: "선택 이유 (200자 이내)" },
      },
    },
  },
  {
    name: "auto_fill_template",
    description: "IDEA_CARD 상태의 Discovery에 BD 아이디어 템플릿 4개 필드(가설, 근거, 타겟, 가치 제안)를 자동 채웁니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "대상 Discovery ID" },
        hypothesis: { type: "string", description: "가설 (직접 지정 시)" },
        targetSegment: { type: "string", description: "타겟 고객/시장 (직접 지정 시)" },
        valueProposition: { type: "string", description: "가치 제안 (직접 지정 시)" },
      },
    },
  },
];
