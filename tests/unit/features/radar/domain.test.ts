/**
 * Domain CRUD 단위 테스트 (실 DB 기반)
 *
 * 대상: RadarService — listDomains, createDomain, deleteDomain [F1], setSourceDomains
 * 커버: 도메인 생성/조회/삭제, M:N 연결, 앱 레벨 cascade [F1]
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "tests/helpers/db";
import type { DB } from "~/db";
import { RadarService } from "~/features/radar/service/radar.service";
import { users, tenants, tenantMembers, radarSources } from "~/db";
import { radarDomains, radarSourceDomains } from "~/features/radar/db/schema";
import { eq } from "drizzle-orm";

// ─── 상수 ───────────────────────────────────────────────────────────────

const TENANT_ID = "t-domain-test";
const USER_ID = "user-domain-1";

// ─── Setup ──────────────────────────────────────────────────────────────

let db: TestDB;
let service: RadarService;

function asDB(d: TestDB) {
  return d as unknown as DB;
}

beforeEach(() => {
  db = createTestDb();
  service = new RadarService(asDB(db));

  db.insert(users)
    .values({ id: USER_ID, email: "domain@test.com", name: "Domain User", role: "admin" })
    .run();

  db.insert(tenants)
    .values({ id: TENANT_ID, name: "Domain Tenant", slug: "domain-test", ownerUserId: USER_ID })
    .run();

  db.insert(tenantMembers)
    .values({ id: "tm-d1", tenantId: TENANT_ID, userId: USER_ID })
    .run();
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe("Domain CRUD", () => {
  // ══════════════════════════════════════════════
  // listDomains
  // ══════════════════════════════════════════════
  describe("listDomains", () => {
    it("빈 도메인 목록 반환", async () => {
      const result = await service.listDomains(TENANT_ID);
      expect(result).toHaveLength(0);
    });

    it("테넌트별 도메인만 반환", async () => {
      const OTHER_TENANT = "t-other";
      db.insert(tenants)
        .values({ id: OTHER_TENANT, name: "Other", slug: "other", ownerUserId: USER_ID })
        .run();

      db.insert(radarDomains)
        .values([
          { id: "d1", name: "기술 트렌드", tenantId: TENANT_ID },
          { id: "d2", name: "시장 분석", tenantId: TENANT_ID },
          { id: "d3", name: "타 테넌트", tenantId: OTHER_TENANT },
        ])
        .run();

      const result = await service.listDomains(TENANT_ID);
      expect(result).toHaveLength(2);
      expect(result.map((d) => d.id)).toEqual(expect.arrayContaining(["d1", "d2"]));
    });
  });

  // ══════════════════════════════════════════════
  // createDomain
  // ══════════════════════════════════════════════
  describe("createDomain", () => {
    it("도메인 생성 후 ID 반환", async () => {
      const id = await service.createDomain({
        name: "기술 트렌드",
        tenantId: TENANT_ID,
      });
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("description, color 옵션 필드 저장", async () => {
      const id = await service.createDomain({
        name: "시장 분석",
        description: "시장 트렌드 분석",
        color: "#3b82f6",
        tenantId: TENANT_ID,
      });

      const rows = db.select().from(radarDomains).where(eq(radarDomains.id, id)).all();
      expect(rows[0].description).toBe("시장 트렌드 분석");
      expect(rows[0].color).toBe("#3b82f6");
    });

    it("생성된 도메인이 listDomains에 반영", async () => {
      await service.createDomain({ name: "경쟁사", tenantId: TENANT_ID });

      const domains = await service.listDomains(TENANT_ID);
      expect(domains).toHaveLength(1);
      expect(domains[0].name).toBe("경쟁사");
    });
  });

  // ══════════════════════════════════════════════
  // deleteDomain [F1] — 앱 레벨 cascade
  // ══════════════════════════════════════════════
  describe("deleteDomain [F1]", () => {
    it("도메인 삭제 시 radar_source_domains도 삭제", async () => {
      // 소스 + 도메인 생성
      db.insert(radarSources)
        .values({ id: "s1", name: "Test", sourceType: "rss", url: "https://a.com", tenantId: TENANT_ID })
        .run();
      db.insert(radarDomains)
        .values({ id: "d1", name: "기술", tenantId: TENANT_ID })
        .run();
      db.insert(radarSourceDomains)
        .values({ id: "rsd1", sourceId: "s1", domainId: "d1" })
        .run();

      // 도메인 삭제
      await service.deleteDomain("d1");

      // 도메인 삭제 확인
      const domains = db.select().from(radarDomains).where(eq(radarDomains.id, "d1")).all();
      expect(domains).toHaveLength(0);

      // radar_source_domains cascade 삭제 확인 [F1]
      const links = db.select().from(radarSourceDomains).where(eq(radarSourceDomains.domainId, "d1")).all();
      expect(links).toHaveLength(0);
    });

    it("연결 없는 도메인도 정상 삭제", async () => {
      db.insert(radarDomains)
        .values({ id: "d2", name: "독립 도메인", tenantId: TENANT_ID })
        .run();

      await service.deleteDomain("d2");

      const domains = db.select().from(radarDomains).where(eq(radarDomains.id, "d2")).all();
      expect(domains).toHaveLength(0);
    });
  });

  // ══════════════════════════════════════════════
  // setSourceDomains (M:N 연결 동기화)
  // ══════════════════════════════════════════════
  describe("setSourceDomains", () => {
    it("소스-도메인 연결 설정", async () => {
      db.insert(radarSources)
        .values({ id: "s1", name: "Test", sourceType: "rss", url: "https://a.com", tenantId: TENANT_ID })
        .run();
      db.insert(radarDomains)
        .values([
          { id: "d1", name: "기술", tenantId: TENANT_ID },
          { id: "d2", name: "시장", tenantId: TENANT_ID },
        ])
        .run();

      await service.setSourceDomains("s1", ["d1", "d2"]);

      const links = db.select().from(radarSourceDomains).where(eq(radarSourceDomains.sourceId, "s1")).all();
      expect(links).toHaveLength(2);
      expect(links.map((l) => l.domainId)).toEqual(expect.arrayContaining(["d1", "d2"]));
    });

    it("기존 연결 삭제 후 새 연결로 교체", async () => {
      db.insert(radarSources)
        .values({ id: "s1", name: "Test", sourceType: "rss", url: "https://a.com", tenantId: TENANT_ID })
        .run();
      db.insert(radarDomains)
        .values([
          { id: "d1", name: "기술", tenantId: TENANT_ID },
          { id: "d2", name: "시장", tenantId: TENANT_ID },
          { id: "d3", name: "경쟁사", tenantId: TENANT_ID },
        ])
        .run();

      // 첫 번째 설정
      await service.setSourceDomains("s1", ["d1", "d2"]);
      // 두 번째 설정 (d2 제거, d3 추가)
      await service.setSourceDomains("s1", ["d1", "d3"]);

      const links = db.select().from(radarSourceDomains).where(eq(radarSourceDomains.sourceId, "s1")).all();
      expect(links).toHaveLength(2);
      expect(links.map((l) => l.domainId)).toEqual(expect.arrayContaining(["d1", "d3"]));
      expect(links.map((l) => l.domainId)).not.toContain("d2");
    });

    it("빈 배열로 설정 시 모든 연결 삭제", async () => {
      db.insert(radarSources)
        .values({ id: "s1", name: "Test", sourceType: "rss", url: "https://a.com", tenantId: TENANT_ID })
        .run();
      db.insert(radarDomains)
        .values({ id: "d1", name: "기술", tenantId: TENANT_ID })
        .run();
      db.insert(radarSourceDomains)
        .values({ id: "rsd1", sourceId: "s1", domainId: "d1" })
        .run();

      await service.setSourceDomains("s1", []);

      const links = db.select().from(radarSourceDomains).where(eq(radarSourceDomains.sourceId, "s1")).all();
      expect(links).toHaveLength(0);
    });
  });
});
