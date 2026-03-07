/**
 * Pipeline Stages Test — 4단계 시나리오 검증 (6개)
 * Stage 1: 소스 연결만 | Stage 2: 분석 중 | Stage 3: 분석 완료 | Stage 4: Proposal 완료
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "tests/helpers/db";
import type { DB } from "~/db";
import { eq } from "drizzle-orm";
import { users, tenants, radarSources, radarRuns, radarItems } from "~/db";
import { ideas, ideaSources } from "~/features/ideas/db/schema";
import { proposals, proposalSections } from "~/features/proposals/db/schema";

const TENANT = "t-stg"; const USER = "u-stg"; const PFX = "stg";
let db: TestDB;
function asDB(d: TestDB) { return d as unknown as DB; }

const ALL_CATS = ["market_research","customer_research","industry_example","regulation","swot","pestel","value_chain","differentiation","bmc","lean_canvas","feasibility","critical_thinking"];
const SEC_TYPES = ["overview","content","hypothesis","target_market","target_customer","value_proposition","revenue_model","scenario","mvp","execution_plan"];

function makeAnalysis(cats: string[]): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  for (const c of cats) {
    const ph = ALL_CATS.indexOf(c) < 4 ? 1 : ALL_CATS.indexOf(c) < 8 ? 2 : 3;
    d[c] = { content: `## ${c}\n\n테스트 분석 Phase ${ph} 콘텐츠.`, phase: ph, completedAt: new Date().toISOString() };
  }
  return d;
}

function seedBase() {
  db.insert(users).values({ id: USER, email: "s@t.com", name: "S", role: "admin" }).run();
  db.insert(tenants).values({ id: TENANT, name: "T", slug: "stg", ownerUserId: USER }).run();
  db.insert(radarRuns).values({ id: `${PFX}-run-001`, tenantId: TENANT, status: "COMPLETED", sourcesChecked: 1, itemsCollected: 4 }).run();
  db.insert(radarSources).values({ id: `${PFX}-src-a`, name: "A", sourceType: "web", url: "https://a.com", userId: USER, tenantId: TENANT }).run();
  for (let i = 1; i <= 4; i++) {
    db.insert(radarItems).values({ id: `${PFX}-ri-${i}`, sourceId: `${PFX}-src-a`, runId: `${PFX}-run-001`, urlHash: `h${i}`, url: `https://a.com/${i}`, title: `I${i}`, titleKo: `아이템${i}`, summaryKo: `요약${i}`, status: "COLLECTED" }).run();
  }
}

describe("Pipeline Stages", () => {
  beforeEach(() => { db = createTestDb(); seedBase(); });

  it("Stage 1: 소스 연결만, 분석 없음", async () => {
    db.insert(ideas).values({ id: `${PFX}-idea-s1`, tenantId: TENANT, ownerId: USER, title: "S1" }).run();
    db.insert(ideaSources).values([
      { id: `${PFX}-is-1`, ideaId: `${PFX}-idea-s1`, radarItemId: `${PFX}-ri-1` },
      { id: `${PFX}-is-2`, ideaId: `${PFX}-idea-s1`, radarItemId: `${PFX}-ri-2` },
    ]).run();
    const srcs = await asDB(db).select().from(ideaSources).where(eq(ideaSources.ideaId, `${PFX}-idea-s1`));
    expect(srcs).toHaveLength(2);
    const [idea] = await asDB(db).select().from(ideas).where(eq(ideas.id, `${PFX}-idea-s1`));
    expect(idea?.analysisData).toBeNull();
  });

  it("Stage 2: Phase 1만 분석 (4/12)", async () => {
    db.insert(ideas).values({ id: `${PFX}-idea-s2`, tenantId: TENANT, ownerId: USER, title: "S2", analysisData: makeAnalysis(ALL_CATS.slice(0, 4)) }).run();
    const [idea] = await asDB(db).select().from(ideas).where(eq(ideas.id, `${PFX}-idea-s2`));
    const data = idea?.analysisData as Record<string, unknown>;
    expect(Object.keys(data)).toHaveLength(4);
    expect(data).toHaveProperty("market_research");
    expect(data).not.toHaveProperty("swot");
    expect(data).not.toHaveProperty("bmc");
  });

  it("Stage 2: 부분 분석에서 Proposal 불가 (12/12 필요)", () => {
    const partial = makeAnalysis(ALL_CATS.slice(0, 4));
    expect(Object.keys(partial).length).toBeLessThan(ALL_CATS.length);
  });

  it("Stage 3: 분석 완료 (12/12), Proposal 없음", async () => {
    db.insert(ideas).values({ id: `${PFX}-idea-s3`, tenantId: TENANT, ownerId: USER, title: "S3", analysisData: makeAnalysis(ALL_CATS) }).run();
    const [idea] = await asDB(db).select().from(ideas).where(eq(ideas.id, `${PFX}-idea-s3`));
    const data = idea?.analysisData as Record<string, unknown>;
    expect(Object.keys(data)).toHaveLength(12);
    const phases = new Set(Object.values(data).map((v) => (v as { phase: number }).phase));
    expect(phases).toEqual(new Set([1, 2, 3]));
    const props = await asDB(db).select().from(proposals);
    expect(props).toHaveLength(0);
  });

  it("Stage 4: Proposal 완료 (전 구간)", async () => {
    db.insert(ideas).values({ id: `${PFX}-idea-s4`, tenantId: TENANT, ownerId: USER, title: "S4", analysisData: makeAnalysis(ALL_CATS) }).run();
    db.insert(proposals).values({ id: `${PFX}-prop-01`, tenantId: TENANT, ownerId: USER, title: "P1", description: "t" }).run();
    for (let i = 0; i < SEC_TYPES.length; i++) {
      db.insert(proposalSections).values({ id: `${PFX}-ps-${i}`, proposalId: `${PFX}-prop-01`, type: SEC_TYPES[i], content: "충분한 콘텐츠 50자 이상이어야 합니다. 검증을 위한 테스트 데이터.", sortOrder: i+1 }).run();
    }
    const secs = await asDB(db).select().from(proposalSections).where(eq(proposalSections.proposalId, `${PFX}-prop-01`));
    expect(secs).toHaveLength(10);
    const types = new Set(secs.map(s => s.type));
    for (const t of SEC_TYPES) expect(types.has(t)).toBe(true);
  });

  it("혼합: 5개 아이디어 다른 단계", async () => {
    db.insert(ideas).values({ id: `${PFX}-m1`, tenantId: TENANT, ownerId: USER, title: "M1" }).run();
    db.insert(ideas).values({ id: `${PFX}-m2`, tenantId: TENANT, ownerId: USER, title: "M2", analysisData: makeAnalysis(ALL_CATS.slice(0,4)) }).run();
    db.insert(ideas).values({ id: `${PFX}-m3`, tenantId: TENANT, ownerId: USER, title: "M3", analysisData: makeAnalysis(ALL_CATS) }).run();
    db.insert(ideas).values({ id: `${PFX}-m4a`, tenantId: TENANT, ownerId: USER, title: "M4a", analysisData: makeAnalysis(ALL_CATS) }).run();
    db.insert(proposals).values({ id: `${PFX}-p4a`, tenantId: TENANT, ownerId: USER, title: "P4a", description: "t" }).run();
    db.insert(ideas).values({ id: `${PFX}-m4b`, tenantId: TENANT, ownerId: USER, title: "M4b", analysisData: makeAnalysis(ALL_CATS) }).run();
    db.insert(proposals).values({ id: `${PFX}-p4b`, tenantId: TENANT, ownerId: USER, title: "P4b", description: "t" }).run();

    const all = await asDB(db).select().from(ideas);
    expect(all).toHaveLength(5);
    const stages = all.map(i => !i.analysisData ? 0 : Object.keys(i.analysisData as Record<string, unknown>).length);
    expect(stages.sort((a: number, b: number) => a - b)).toEqual([0, 4, 12, 12, 12]);
    const allP = await asDB(db).select().from(proposals);
    expect(allP).toHaveLength(2);
  });
});
