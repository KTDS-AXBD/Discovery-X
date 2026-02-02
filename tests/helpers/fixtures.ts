import type {
  NewUser,
  NewDiscovery,
  NewExperiment,
  NewEvidence,
  NewMethodRun,
  NewGatePackage,
  NewAssumption,
  NewContextNode,
  NewContextEdge,
  NewDiscoveryKpi,
  NewKpiMeasurement,
  NewAlert,
  NewWebhookConfig,
  NewGateApproval,
  NewDiscoveryLink,
} from "~/db/schema";

let counter = 0;
function nextId() {
  return `test-${++counter}`;
}

export function resetFixtureCounter() {
  counter = 0;
}

export function makeUser(overrides?: Partial<NewUser>): NewUser {
  const id = nextId();
  return {
    id,
    email: `${id}@test.com`,
    name: `Test User ${id}`,
    ...overrides,
  };
}

export function makeDiscovery(overrides?: Partial<NewDiscovery>): NewDiscovery {
  const id = nextId();
  return {
    id,
    title: `Test Discovery ${id}`,
    seedSummary: `Seed summary for ${id}`,
    sourceType: "article",
    status: "DISCOVERY",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

export function makeExperiment(overrides?: Partial<NewExperiment> & { discoveryId: string }): NewExperiment {
  const id = nextId();
  return {
    id,
    discoveryId: overrides?.discoveryId ?? "missing-discovery-id",
    hypothesis: `Hypothesis ${id}`,
    minimalAction: `Action ${id}`,
    deadline: new Date("2026-02-01T00:00:00Z"),
    expectedEvidence: `Expected evidence ${id}`,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

export function makeEvidence(overrides?: Partial<NewEvidence> & { discoveryId: string; createdById: string }): NewEvidence {
  const id = nextId();
  return {
    id,
    discoveryId: overrides?.discoveryId ?? "missing-discovery-id",
    createdById: overrides?.createdById ?? "missing-user-id",
    type: "DATA",
    strength: "B",
    content: `Evidence content ${id}`,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

export function makeMethodRun(overrides?: Partial<NewMethodRun> & { discoveryId: string; methodPackId: string }): NewMethodRun {
  const id = nextId();
  return {
    id,
    discoveryId: overrides?.discoveryId ?? "missing-discovery-id",
    methodPackId: overrides?.methodPackId ?? "missing-method-pack-id",
    status: "RUNNING",
    ...overrides,
  };
}

export function makeGatePackage(overrides?: Partial<NewGatePackage> & { discoveryId: string; gateType: string }): NewGatePackage {
  const id = nextId();
  return {
    id,
    discoveryId: overrides?.discoveryId ?? "missing-discovery-id",
    gateType: overrides?.gateType ?? "GATE1",
    ...overrides,
  };
}

export function makeAssumption(overrides?: Partial<NewAssumption> & { discoveryId: string }): NewAssumption {
  const id = nextId();
  return {
    id,
    discoveryId: overrides?.discoveryId ?? "missing-discovery-id",
    statement: `Assumption statement ${id}`,
    status: "OPEN",
    ...overrides,
  };
}

export function makeContextNode(overrides?: Partial<NewContextNode> & { discoveryId: string }): NewContextNode {
  const id = nextId();
  return {
    id,
    discoveryId: overrides?.discoveryId ?? "missing-discovery-id",
    label: `Node ${id}`,
    ...overrides,
  };
}

export function makeContextEdge(overrides?: Partial<NewContextEdge> & { fromNodeId: string; toNodeId: string }): NewContextEdge {
  const id = nextId();
  return {
    id,
    fromNodeId: overrides?.fromNodeId ?? "missing-from-node",
    toNodeId: overrides?.toNodeId ?? "missing-to-node",
    relationType: "relates_to",
    ...overrides,
  };
}

export function makeDiscoveryKpi(overrides?: Partial<NewDiscoveryKpi> & { discoveryId: string }): NewDiscoveryKpi {
  const id = nextId();
  return {
    id,
    discoveryId: overrides?.discoveryId ?? "missing-discovery-id",
    name: `KPI ${id}`,
    unit: "count",
    direction: "higher_is_better",
    ...overrides,
  };
}

export function makeKpiMeasurement(overrides?: Partial<NewKpiMeasurement> & { kpiId: string }): NewKpiMeasurement {
  const id = nextId();
  return {
    id,
    kpiId: overrides?.kpiId ?? "missing-kpi-id",
    value: 100,
    ...overrides,
  };
}

export function makeAlert(overrides?: Partial<NewAlert>): NewAlert {
  const id = nextId();
  return {
    id,
    severity: "warning",
    message: `Alert message ${id}`,
    ...overrides,
  };
}

export function makeWebhookConfig(overrides?: Partial<NewWebhookConfig>): NewWebhookConfig {
  const id = nextId();
  return {
    id,
    name: `Webhook ${id}`,
    url: `https://hooks.example.com/${id}`,
    ...overrides,
  };
}

export function makeGateApproval(overrides?: Partial<NewGateApproval> & { gatePackageId: string; reviewerId: string }): NewGateApproval {
  const id = nextId();
  return {
    id,
    gatePackageId: overrides?.gatePackageId ?? "missing-gate-package-id",
    reviewerId: overrides?.reviewerId ?? "missing-reviewer-id",
    decision: "PENDING",
    ...overrides,
  };
}

export function makeDiscoveryLink(overrides?: Partial<NewDiscoveryLink> & { fromDiscoveryId: string; toDiscoveryId: string }): NewDiscoveryLink {
  const id = nextId();
  return {
    id,
    fromDiscoveryId: overrides?.fromDiscoveryId ?? "missing-from-discovery",
    toDiscoveryId: overrides?.toDiscoveryId ?? "missing-to-discovery",
    linkType: "similar",
    ...overrides,
  };
}
