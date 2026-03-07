import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock all tool modules BEFORE importing tool-handlers
// ---------------------------------------------------------------------------

vi.mock("~/features/chat/agent/tools/discovery-tools", () => ({
  createDiscovery: vi.fn().mockResolvedValue('{"id":"d-001"}'),
  updateDiscovery: vi.fn().mockResolvedValue('{"ok":true}'),
  promoteDiscovery: vi.fn().mockResolvedValue('{"ok":true}'),
  transitionStage: vi.fn().mockResolvedValue('{"ok":true}'),
  addExperiment: vi.fn().mockResolvedValue('{"ok":true}'),
  completeExperiment: vi.fn().mockResolvedValue('{"ok":true}'),
  addEvidence: vi.fn().mockResolvedValue('{"ok":true}'),
  decideGate: vi.fn().mockResolvedValue('{"ok":true}'),
  decideHold: vi.fn().mockResolvedValue('{"ok":true}'),
  decideDrop: vi.fn().mockResolvedValue('{"ok":true}'),
  requestExtension: vi.fn().mockResolvedValue('{"ok":true}'),
  getStageInfo: vi.fn().mockResolvedValue('{"stage":"IDEA_CARD"}'),
  validateEvidence: vi.fn().mockResolvedValue('{"ok":true}'),
  tagDiscovery: vi.fn().mockResolvedValue('{"ok":true}'),
  removeDiscoveryTag: vi.fn().mockResolvedValue('{"ok":true}'),
  generateIdeaCandidates: vi.fn().mockResolvedValue('{"candidates":[]}'),
  selectIdeaCandidate: vi.fn().mockResolvedValue('{"ok":true}'),
  autoFillTemplate: vi.fn().mockResolvedValue('{"ok":true}'),
}));

vi.mock("~/features/chat/agent/tools/query-tools", () => ({
  listDiscoveries: vi.fn().mockResolvedValue('{"discoveries":[]}'),
  getDiscoveryDetail: vi.fn().mockResolvedValue('{"discovery":{}}'),
  getExperimentContext: vi.fn().mockResolvedValue('{}'),
  searchSimilar: vi.fn().mockResolvedValue('[]'),
  getMetrics: vi.fn().mockResolvedValue('{}'),
  getRadarItems: vi.fn().mockResolvedValue('[]'),
  listUsers: vi.fn().mockResolvedValue('[]'),
  getWeeklyReview: vi.fn().mockResolvedValue('{}'),
  getRecallQueue: vi.fn().mockResolvedValue('[]'),
  generateDiscoveryDigest: vi.fn().mockResolvedValue('{}'),
  compareDiscoveries: vi.fn().mockResolvedValue('{}'),
  getIndustryContext: vi.fn().mockResolvedValue('{}'),
}));

vi.mock("~/features/chat/agent/tools/method-tools", () => ({
  listMethodPacks: vi.fn().mockResolvedValue('[]'),
  recommendMethods: vi.fn().mockResolvedValue('[]'),
  startMethodRun: vi.fn().mockResolvedValue('{}'),
  completeMethodRun: vi.fn().mockResolvedValue('{}'),
  draftGatePackage: vi.fn().mockResolvedValue('{}'),
  getGatePackage: vi.fn().mockResolvedValue('{}'),
}));

vi.mock("~/features/chat/agent/tools/ontology-tools", () => ({
  extractEntities: vi.fn().mockResolvedValue('[]'),
  linkEntities: vi.fn().mockResolvedValue('{}'),
  queryGraph: vi.fn().mockResolvedValue('{}'),
  getDuplicateQueue: vi.fn().mockResolvedValue('[]'),
  reviewDuplicate: vi.fn().mockResolvedValue('{}'),
}));

vi.mock("~/features/chat/agent/tools/indicator-tools", () => ({
  registerKpi: vi.fn().mockResolvedValue('{}'),
  recordKpiMeasurement: vi.fn().mockResolvedValue('{}'),
  getKpiStatus: vi.fn().mockResolvedValue('{}'),
  getPipelineHealth: vi.fn().mockResolvedValue('{}'),
}));

vi.mock("~/features/chat/agent/tools/connector-tools", () => ({
  linkDiscoveries: vi.fn().mockResolvedValue('{}'),
  getLinkedDiscoveries: vi.fn().mockResolvedValue('[]'),
}));

vi.mock("~/features/chat/agent/tools/governance-tools", () => ({
  requestGateApproval: vi.fn().mockResolvedValue('{}'),
  submitGateApproval: vi.fn().mockResolvedValue('{}'),
}));

vi.mock("~/features/chat/agent/tools/alert-tools", () => ({
  getAlerts: vi.fn().mockResolvedValue('[]'),
  acknowledgeAlert: vi.fn().mockResolvedValue('{}'),
  manageWebhook: vi.fn().mockResolvedValue('{}'),
}));

vi.mock("~/features/chat/agent/tools/compliance-tools", () => ({
  generateAuditTrail: vi.fn().mockResolvedValue('{}'),
  checkRegulatoryCompliance: vi.fn().mockResolvedValue('{}'),
  packageEvidenceForAudit: vi.fn().mockResolvedValue('{}'),
  formatComplianceReport: vi.fn().mockResolvedValue('{}'),
}));

vi.mock("~/features/chat/agent/tools/asset-tools", () => ({
  extractDecisionPattern: vi.fn().mockResolvedValue('{}'),
  applyReusableRule: vi.fn().mockResolvedValue('{}'),
}));

vi.mock("~/features/chat/agent/tools/tenant-tools", () => ({
  getTenantInfo: vi.fn().mockResolvedValue('{}'),
  manageTenantMembers: vi.fn().mockResolvedValue('{}'),
}));

vi.mock("~/features/chat/agent/tools/idea-tools", () => ({
  updateIdeaAnalysis: vi.fn().mockResolvedValue('{}'),
}));

vi.mock("~/features/chat/agent/tools/matrix-tools", () => ({
  queryMatrixHeatmap: vi.fn().mockResolvedValue('{}'),
  getCellSignals: vi.fn().mockResolvedValue('{}'),
  getTopCells: vi.fn().mockResolvedValue('[]'),
}));

vi.mock("~/features/chat/agent/tools/requirements-tools", () => ({
  classifyFeatureRequest: vi.fn().mockResolvedValue('{}'),
  reviewFeatureRequest: vi.fn().mockResolvedValue('{}'),
  planFeatureRequest: vi.fn().mockResolvedValue('{}'),
}));

// Mock tool-registry for TOOL_MIN_AUTONOMY
vi.mock("~/features/chat/agent/tool-registry", () => ({
  TOOL_MIN_AUTONOMY: {
    list_discoveries: 1,
    create_discovery: 2,
    submit_gate_approval: 3,
  },
}));

import { executeTool } from "~/features/chat/agent/tool-handlers";
import { createDiscovery } from "~/features/chat/agent/tools/discovery-tools";
import { listDiscoveries } from "~/features/chat/agent/tools/query-tools";

// ---------------------------------------------------------------------------
// Fake DB
// ---------------------------------------------------------------------------

const fakeDb = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// executeTool
// ---------------------------------------------------------------------------

describe("executeTool", () => {
  it("알 수 없는 도구 → 에러 JSON 반환", async () => {
    const result = await executeTool(fakeDb, "nonexistent_tool", {});
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("알 수 없는 도구");
    expect(parsed.error).toContain("nonexistent_tool");
  });

  it("자율도 레벨 미달 → 에러 JSON 반환", async () => {
    // create_discovery requires level 2, pass level 1
    const result = await executeTool(fakeDb, "create_discovery", { title: "test" }, 1);
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("최소 레벨 2 필요");
    expect(parsed.error).toContain("자율도 레벨(1)");
  });

  it("자율도 레벨 충분 → handler 호출", async () => {
    // list_discoveries requires level 1, pass level 1
    await executeTool(fakeDb, "list_discoveries", { stage: "IDEA_CARD" }, 1);
    expect(listDiscoveries).toHaveBeenCalledTimes(1);
    expect(listDiscoveries).toHaveBeenCalledWith(fakeDb, { stage: "IDEA_CARD" });
  });

  it("자율도 레벨 3에서 레벨 3 도구 사용 가능", async () => {
    const { submitGateApproval } = await import("~/features/chat/agent/tools/governance-tools");
    await executeTool(fakeDb, "submit_gate_approval", { gateId: "g-1" }, 3);
    expect(submitGateApproval).toHaveBeenCalledTimes(1);
  });

  it("autonomyLevel undefined 시 검증 스킵 → handler 호출", async () => {
    await executeTool(fakeDb, "create_discovery", { title: "new" }, undefined);
    expect(createDiscovery).toHaveBeenCalledTimes(1);
  });

  it("tenantId 자동 주입 확인", async () => {
    const input = { stage: "DISCOVERY" };
    await executeTool(fakeDb, "list_discoveries", input, undefined, "tenant-abc");
    expect(listDiscoveries).toHaveBeenCalledWith(fakeDb, { stage: "DISCOVERY", tenantId: "tenant-abc" });
  });

  it("tenantId 미제공 시 주입하지 않음", async () => {
    const input = { stage: "DISCOVERY" };
    await executeTool(fakeDb, "list_discoveries", input, undefined, undefined);
    expect(listDiscoveries).toHaveBeenCalledWith(fakeDb, { stage: "DISCOVERY" });
  });

  it("env 파라미터 전달 확인", async () => {
    const { classifyFeatureRequest } = await import("~/features/chat/agent/tools/requirements-tools");
    const env = { ANTHROPIC_API_KEY: "test-key" };
    await executeTool(fakeDb, "classify_feature_request", { requestId: "r-1" }, undefined, undefined, env);
    expect(classifyFeatureRequest).toHaveBeenCalledWith(fakeDb, { requestId: "r-1" }, env);
  });

  it("alias 도구 (decide_next → decideGate) 정상 호출", async () => {
    const { decideGate } = await import("~/features/chat/agent/tools/discovery-tools");
    await executeTool(fakeDb, "decide_next", { discoveryId: "d-1", decision: "proceed" });
    expect(decideGate).toHaveBeenCalledTimes(1);
  });

  it("handler 결과 문자열 반환", async () => {
    const result = await executeTool(fakeDb, "list_discoveries", {});
    expect(result).toBe('{"discoveries":[]}');
  });

  it("레벨 미달 시 suggestion 필드 포함", async () => {
    const result = await executeTool(fakeDb, "submit_gate_approval", {}, 1);
    const parsed = JSON.parse(result);
    expect(parsed.suggestion).toContain("자율도 레벨을 올리거나");
  });

  it("미등록 도구의 기본 최소 레벨은 3", async () => {
    // TOOL_MIN_AUTONOMY mock에 없는 도구 → 기본값 3
    // "update_discovery"는 TOOL_HANDLER_MAP에는 있지만 mock된 TOOL_MIN_AUTONOMY에는 없음
    const result = await executeTool(fakeDb, "update_discovery", { id: "d-1" }, 2);
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("최소 레벨 3 필요");
  });
});
