/**
 * Pipeline Integrity Validator 테스트 (14개)
 * 5대 원칙: 참조무결성, 필수필드, 균등분배, 전구간연결, 콘텐츠품질
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "tests/helpers/db";
import type { DB } from "~/db";
import { eq } from "drizzle-orm";
import { users, tenants, radarSources, radarRuns, radarItems } from "~/db";
import { ideas, ideaSources } from "~/features/ideas/db/schema";
import { proposals, proposalSections } from "~/features/proposals/db/schema";
import { PipelineIntegrityValidator } from "~/lib/pipeline/integrity";

const TENANT = "t-pipe"; const USER = "u-pipe"; const PFX = "tp";
let db: TestDB;
let validator: PipelineIntegrityValidator;
function asDB(d: TestDB) { return d as unknown as DB; }

const SECTION_TYPES = ["overview","content","hypothesis","target_market","target_customer","value_proposition","revenue_model","scenario","mvp","execution_plan"];

function seedValid() {
  db.insert(users).values({ id: USER, email: "p@t.com", name: "P", role: "admin" }).run();
  db.insert(tenants).values({ id: TENANT, name: "T", slug: "pipe", ownerUserId: USER }).run();
  db.insert(radarRuns).values({ id: `${PFX}-run-001`, tenantId: TENANT, status: "COMPLETED", sourcesChecked: 2, itemsCollected: 4 }).run();
  db.insert(radarSources).values([
    { id: `${PFX}-src-a`, name: "A", sourceType: "web", url: "https://a.com", userId: USER, tenantId: TENANT },
    { id: `${PFX}-src-b`, name: "B", sourceType: "web", url: "https://b.com", userId: USER, tenantId: TENANT },
  ]).run();
  for (const [s, n] of [["a",1],["a",2],["b",1],["b",2]] as const) {
    db.insert(radarItems).values({ id: `${PFX}-ri-${s}${n}`, sourceId: `${PFX}-src-${s}`, runId: `${PFX}-run-001`, urlHash: `h-${s}${n}`, url: `https://${s}.com/${n}`, title: `${s}${n}`, titleKo: `아이템 ${s}${n}`, summaryKo: `요약 ${s}${n}`, status: "COLLECTED" }).run();
  }
  db.insert(ideas).values([
    { id: `${PFX}-idea-a`, tenantId: TENANT, ownerId: USER, title: "A" },
    { id: `${PFX}-idea-b`, tenantId: TENANT, ownerId: USER, title: "B" },
  ]).run();
  db.insert(ideaSources).values([
    { id: `${PFX}-is-a1`, ideaId: `${PFX}-idea-a`, radarItemId: `${PFX}-ri-a1` },
    { id: `${PFX}-is-a2`, ideaId: `${PFX}-idea-a`, radarItemId: `${PFX}-ri-a2` },
    { id: `${PFX}-is-b1`, ideaId: `${PFX}-idea-b`, radarItemId: `${PFX}-ri-b1` },
    { id: `${PFX}-is-b2`, ideaId: `${PFX}-idea-b`, radarItemId: `${PFX}-ri-b2` },
  ]).run();
  db.insert(proposals).values({ id: `${PFX}-prop-01`, tenantId: TENANT, ownerId: USER, title: "P1", description: "t" }).run();
  for (let i = 0; i < SECTION_TYPES.length; i++) {
    db.insert(proposalSections).values({ id: `${PFX}-ps-01-${i}`, proposalId: `${PFX}-prop-01`, type: SECTION_TYPES[i], content: "이 섹션은 테스트를 위한 충분한 길이의 콘텐츠를 포함하고 있어요. 최소 50자 이상이어야 해요.", sortOrder: i+1 }).run();
  }
}

describe("PipelineIntegrityValidator", () => {
  beforeEach(() => { db = createTestDb(); validator = new PipelineIntegrityValidator(asDB(db)); });

  describe("정상 파이프라인 — 전체 통과", () => {
    beforeEach(seedValid);
    it("모든 검증 항목이 PASS", async () => {
      const r = await validator.validate(PFX, { sources: 2, items: 4, ideas: 2, links: 4, proposals: 1, sections: 10, itemsPerSource: 2, sectionsPerProposal: 10, minContentLength: 50 });
      expect(r.failed).toBe(0);
      expect(r.passed).toBe(r.total);
      expect(r.total).toBeGreaterThanOrEqual(13);
    });
    it("리포트에 prefix와 timestamp 포함", async () => {
      const r = await validator.validate(PFX);
      expect(r.prefix).toBe(PFX);
      expect(r.timestamp).toBeInstanceOf(Date);
    });
  });

  describe("원칙 1: 참조 무결성", () => {
    beforeEach(seedValid);
    it("TC-05: radar_items FK 정상", async () => {
      const r = await validator.validate(PFX);
      expect(r.checks.find(c => c.id === "TC-05")?.pass).toBe(true);
    });
    it("TC-09: idea_sources FK 정상", async () => {
      const r = await validator.validate(PFX);
      expect(r.checks.find(c => c.id === "TC-09")?.pass).toBe(true);
    });
    it("정상 데이터에서 고아 없음", async () => {
      const r = await validator.validate(PFX);
      expect(r.checks.find(c => c.id === "TC-05")?.actual).toBe(0);
    });
  });

  describe("원칙 2: 필수 필드", () => {
    beforeEach(seedValid);
    it("TC-04: titleKo, summaryKo 존재하면 PASS", async () => {
      const r = await validator.validate(PFX);
      expect(r.checks.find(c => c.id === "TC-04")?.pass).toBe(true);
    });
    it("titleKo NULL이면 FAIL", async () => {
      db.insert(radarItems).values({ id: `${PFX}-ri-bad`, sourceId: `${PFX}-src-a`, runId: `${PFX}-run-001`, urlHash: "h-bad", url: "https://bad.com", title: "Bad", titleKo: null, summaryKo: "ok", status: "COLLECTED" }).run();
      const r = await validator.validate(PFX, { items: 5 });
      expect(r.checks.find(c => c.id === "TC-04")?.pass).toBe(false);
    });
  });

  describe("원칙 3: 균등 분배", () => {
    beforeEach(seedValid);
    it("TC-06: 소스당 아이템 균등", async () => {
      const r = await validator.validate(PFX, { itemsPerSource: 2 });
      expect(r.checks.find(c => c.id === "TC-06")?.pass).toBe(true);
    });
    it("TC-12: proposal당 섹션 균등", async () => {
      const r = await validator.validate(PFX, { sectionsPerProposal: 10 });
      expect(r.checks.find(c => c.id === "TC-12")?.pass).toBe(true);
    });
  });

  describe("원칙 4: 전 구간 연결", () => {
    beforeEach(seedValid);
    it("TC-14: Radar->Ideas 연결 PASS", async () => {
      const r = await validator.validate(PFX);
      expect(r.checks.find(c => c.id === "TC-14")?.pass).toBe(true);
    });
    it("미연결이면 FAIL", async () => {
      db.insert(users).values({ id: "u2", email: "u2@t.com", name: "U2", role: "user" }).run();
      db.insert(radarRuns).values({ id: "ul-run-001", tenantId: TENANT, status: "COMPLETED", sourcesChecked: 1, itemsCollected: 1 }).run();
      db.insert(radarSources).values({ id: "ul-src-a", name: "UL", sourceType: "web", url: "https://u.com", userId: "u2", tenantId: TENANT }).run();
      db.insert(radarItems).values({ id: "ul-ri-a1", sourceId: "ul-src-a", runId: "ul-run-001", urlHash: "h-u1", url: "https://u.com/1", title: "UL", titleKo: "미연결", summaryKo: "미연결", status: "COLLECTED" }).run();
      db.insert(ideas).values({ id: "ul-idea-a", tenantId: TENANT, ownerId: USER, title: "UL" }).run();
      const r = await validator.validate("ul");
      expect(r.checks.find(c => c.id === "TC-14")?.pass).toBe(false);
    });
  });

  describe("원칙 5: 콘텐츠 품질", () => {
    beforeEach(seedValid);
    it("TC-13: 최소 길이 이상이면 PASS", async () => {
      const r = await validator.validate(PFX, { minContentLength: 50 });
      expect(r.checks.find(c => c.id === "TC-13")?.pass).toBe(true);
    });
    it("짧은 content면 FAIL", async () => {
      db.insert(proposals).values({ id: `${PFX}-prop-02`, tenantId: TENANT, ownerId: USER, title: "Short", description: "t" }).run();
      db.insert(proposalSections).values({ id: `${PFX}-ps-short`, proposalId: `${PFX}-prop-02`, type: "overview", content: "짧음", sortOrder: 1 }).run();
      const r = await validator.validate(PFX, { sections: 11, proposals: 2, minContentLength: 50 });
      expect(r.checks.find(c => c.id === "TC-13")?.pass).toBe(false);
    });
  });

  describe("자동 감지 모드", () => {
    beforeEach(seedValid);
    it("expectations 없이도 기본 검증 동작", async () => {
      const r = await validator.validate(PFX);
      expect(r.total).toBeGreaterThanOrEqual(10);
      expect(r.checks.find(c => c.id === "TC-06")).toBeUndefined();
    });
  });
});
