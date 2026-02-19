import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import {
  DiscoveryValidationRules,
  type CriticalCheckResult,
} from "~/lib/validation/discovery-rules";
import { users, discoveries, experiments, evidence, assumptions } from "~/db/schema";

// ============================================================================
// 헬퍼: 테스트 시드 데이터 삽입
// ============================================================================

const USER_ID = "test-user-1";
const DISCOVERY_ID = "test-disc-1";

async function seedBase(db: TestDB) {
  await db.insert(users).values({
    id: USER_ID,
    email: "test@example.com",
    name: "테스트 사용자",
  });
  await db.insert(discoveries).values({
    id: DISCOVERY_ID,
    title: "테스트 Discovery",
    seedSummary: "테스트 요약",
    sourceType: "article",
    ownerId: USER_ID,
  });
}

async function insertEvidence(
  db: TestDB,
  overrides: Partial<{
    id: string;
    type: string;
    strength: string;
    reliabilityLabel: string | null;
    publishedOrObservedDate: string | null;
  }> = {}
) {
  await db.insert(evidence).values({
    id: overrides.id ?? crypto.randomUUID(),
    discoveryId: DISCOVERY_ID,
    type: overrides.type ?? "DATA",
    strength: overrides.strength ?? "A",
    content: "테스트 근거 내용입니다.",
    reliabilityLabel: "reliabilityLabel" in overrides ? overrides.reliabilityLabel : "confirmed",
    publishedOrObservedDate: "publishedOrObservedDate" in overrides ? overrides.publishedOrObservedDate : "2026-01-15",
    createdById: USER_ID,
  });
}

async function insertExperiment(
  db: TestDB,
  completed = false
) {
  await db.insert(experiments).values({
    id: crypto.randomUUID(),
    discoveryId: DISCOVERY_ID,
    hypothesis: "테스트 가설",
    minimalAction: "테스트 행동",
    deadline: new Date("2026-03-01"),
    expectedEvidence: "예상 근거",
    completedAt: completed ? new Date() : null,
  });
}

async function insertAssumption(
  db: TestDB,
  status: "OPEN" | "VALIDATED" | "INVALIDATED" = "OPEN"
) {
  await db.insert(assumptions).values({
    id: crypto.randomUUID(),
    discoveryId: DISCOVERY_ID,
    statement: "테스트 가정",
    status,
  });
}

function findCheck(
  checks: CriticalCheckResult[],
  name: CriticalCheckResult["name"]
): CriticalCheckResult {
  const found = checks.find((c) => c.name === name);
  if (!found) throw new Error(`체크 항목 '${name}' 미발견`);
  return found;
}

// ============================================================================
// Evidence Check
// ============================================================================

describe("Evidence Check", () => {
  let db: TestDB;

  beforeEach(async () => {
    db = createTestDb();
    await seedBase(db);
  });

  it("전체 태그 완비 시 pass", async () => {
    await insertEvidence(db, { type: "DATA", strength: "A", reliabilityLabel: "confirmed" });
    await insertEvidence(db, { type: "USER", strength: "B", reliabilityLabel: "reported" });

    const result = await DiscoveryValidationRules.validateCriticalChecks(db as never, DISCOVERY_ID);
    const check = findCheck(result.checks, "evidence_check");

    expect(check.passed).toBe(true);
    expect(check.message).toContain("태그가 완비");
  });

  it("reliabilityLabel 누락 시 fail", async () => {
    await insertEvidence(db, { reliabilityLabel: null });

    const result = await DiscoveryValidationRules.validateCriticalChecks(db as never, DISCOVERY_ID);
    const check = findCheck(result.checks, "evidence_check");

    expect(check.passed).toBe(false);
    expect(check.message).toContain("태그 누락");
  });

  it("증거 없음 시 fail", async () => {
    const result = await DiscoveryValidationRules.validateCriticalChecks(db as never, DISCOVERY_ID);
    const check = findCheck(result.checks, "evidence_check");

    expect(check.passed).toBe(false);
    expect(check.message).toContain("등록된 근거가 없습니다");
  });
});

// ============================================================================
// Time Stress Test
// ============================================================================

describe("Time Stress Test", () => {
  let db: TestDB;

  beforeEach(async () => {
    db = createTestDb();
    await seedBase(db);
  });

  it("모든 근거에 날짜 있으면 pass", async () => {
    await insertEvidence(db, { publishedOrObservedDate: "2026-01-10" });
    await insertEvidence(db, { publishedOrObservedDate: "2026-02-01" });

    const result = await DiscoveryValidationRules.validateCriticalChecks(db as never, DISCOVERY_ID);
    const check = findCheck(result.checks, "time_stress_test");

    expect(check.passed).toBe(true);
    expect(check.message).toContain("날짜가 기록");
  });

  it("날짜 없는 근거가 있으면 fail", async () => {
    await insertEvidence(db, { publishedOrObservedDate: null });

    const result = await DiscoveryValidationRules.validateCriticalChecks(db as never, DISCOVERY_ID);
    const check = findCheck(result.checks, "time_stress_test");

    expect(check.passed).toBe(false);
    expect(check.message).toContain("누락");
  });

  it("3개월 이상 경과 근거만 있으면 pass + 경고 메시지", async () => {
    await insertEvidence(db, { publishedOrObservedDate: "2025-01-01" });

    const result = await DiscoveryValidationRules.validateCriticalChecks(db as never, DISCOVERY_ID);
    const check = findCheck(result.checks, "time_stress_test");

    expect(check.passed).toBe(true);
    expect(check.message).toContain("3개월 이상 경과");
  });
});

// ============================================================================
// Cross-Context Test
// ============================================================================

describe("Cross-Context Test", () => {
  let db: TestDB;

  beforeEach(async () => {
    db = createTestDb();
    await seedBase(db);
  });

  it("검증률 50% 이상이면 pass", async () => {
    await insertAssumption(db, "VALIDATED");
    await insertAssumption(db, "OPEN");

    const result = await DiscoveryValidationRules.validateCriticalChecks(db as never, DISCOVERY_ID);
    const check = findCheck(result.checks, "cross_context_test");

    expect(check.passed).toBe(true);
    expect(check.message).toContain("50%");
  });

  it("검증률 50% 미달이면 fail", async () => {
    await insertAssumption(db, "VALIDATED");
    await insertAssumption(db, "OPEN");
    await insertAssumption(db, "OPEN");

    const result = await DiscoveryValidationRules.validateCriticalChecks(db as never, DISCOVERY_ID);
    const check = findCheck(result.checks, "cross_context_test");

    expect(check.passed).toBe(false);
    expect(check.message).toContain("미달");
  });

  it("가정 0개이면 fail", async () => {
    const result = await DiscoveryValidationRules.validateCriticalChecks(db as never, DISCOVERY_ID);
    const check = findCheck(result.checks, "cross_context_test");

    expect(check.passed).toBe(false);
    expect(check.message).toContain("가정(assumptions)이 없습니다");
  });
});

// ============================================================================
// Ontology Consistency
// ============================================================================

describe("Ontology Consistency", () => {
  let db: TestDB;

  beforeEach(async () => {
    db = createTestDb();
    await seedBase(db);
  });

  it("완료된 실험 + 근거 있으면 pass", async () => {
    await insertExperiment(db, true);
    await insertEvidence(db);

    const result = await DiscoveryValidationRules.validateCriticalChecks(db as never, DISCOVERY_ID);
    const check = findCheck(result.checks, "ontology_consistency");

    expect(check.passed).toBe(true);
    expect(check.message).toContain("온톨로지 경로 완결");
  });

  it("실험 없으면 fail", async () => {
    await insertEvidence(db);

    const result = await DiscoveryValidationRules.validateCriticalChecks(db as never, DISCOVERY_ID);
    const check = findCheck(result.checks, "ontology_consistency");

    expect(check.passed).toBe(false);
    expect(check.message).toContain("완료된 실험이 없습니다");
  });

  it("근거 없으면 fail", async () => {
    await insertExperiment(db, true);

    const result = await DiscoveryValidationRules.validateCriticalChecks(db as never, DISCOVERY_ID);
    const check = findCheck(result.checks, "ontology_consistency");

    expect(check.passed).toBe(false);
    expect(check.message).toContain("근거가 없습니다");
  });
});

// ============================================================================
// 전체 통합: passed 플래그
// ============================================================================

describe("validateCriticalChecks 통합", () => {
  let db: TestDB;

  beforeEach(async () => {
    db = createTestDb();
    await seedBase(db);
  });

  it("4종 모두 통과 시 passed=true", async () => {
    await insertExperiment(db, true);
    await insertEvidence(db, { type: "DATA", strength: "A", reliabilityLabel: "confirmed", publishedOrObservedDate: "2026-01-15" });
    await insertAssumption(db, "VALIDATED");

    const result = await DiscoveryValidationRules.validateCriticalChecks(db as never, DISCOVERY_ID);

    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("1개라도 fail이면 passed=false", async () => {
    // 근거·실험은 있지만, 가정 미등록
    await insertExperiment(db, true);
    await insertEvidence(db);

    const result = await DiscoveryValidationRules.validateCriticalChecks(db as never, DISCOVERY_ID);

    expect(result.passed).toBe(false);
    const crossCtx = findCheck(result.checks, "cross_context_test");
    expect(crossCtx.passed).toBe(false);
  });

  it("아무 데이터 없으면 4종 모두 fail", async () => {
    const result = await DiscoveryValidationRules.validateCriticalChecks(db as never, DISCOVERY_ID);

    expect(result.passed).toBe(false);
    expect(result.checks.every((c) => !c.passed)).toBe(true);
  });
});
