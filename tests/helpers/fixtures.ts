import type { NewUser, NewDiscovery, NewExperiment, NewEvidence } from "~/db/schema";

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
    status: "INBOX",
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
