/**
 * RadarService 수동 수집 테스트 (실 DB 기반)
 *
 * 대상: collectFromText, collectFromFile, sendToIdea, getOrCreateManualSource
 * DX-REQ-012 Phase 1A + 1B
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "tests/helpers/db";
import type { DB } from "~/db";
import { RadarService } from "~/features/radar/service/radar.service";
import {
  users,
  tenants,
  tenantMembers,
  radarSources,
  radarItems,
  ideas,
  ideaSources,
} from "~/db";
import { eq } from "drizzle-orm";

// ─── 상수 ───────────────────────────────────────────────────────────────

const TENANT_ID = "t-manual-test";
const USER_ID = "user-manual-1";

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
    .values({ id: USER_ID, email: "manual@test.com", name: "Manual User", role: "admin" })
    .run();

  db.insert(tenants)
    .values({ id: TENANT_ID, name: "Manual Tenant", slug: "manual-test", ownerUserId: USER_ID })
    .run();

  db.insert(tenantMembers)
    .values({ id: "tm-m1", tenantId: TENANT_ID, userId: USER_ID })
    .run();
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe("RadarService — 수동 수집", () => {
  // ══════════════════════════════════════════════
  // getOrCreateManualSource
  // ══════════════════════════════════════════════
  describe("getOrCreateManualSource", () => {
    it("처음 호출 시 __manual__ 소스 생성", async () => {
      const sourceId = await service.getOrCreateManualSource(TENANT_ID);
      expect(sourceId).toBeTruthy();

      const sources = db
        .select()
        .from(radarSources)
        .where(eq(radarSources.name, "__manual__"))
        .all();
      expect(sources).toHaveLength(1);
      expect(sources[0].collectionType).toBe("manual");
      expect(sources[0].tenantId).toBe(TENANT_ID);
    });

    it("재호출 시 동일 소스 ID 반환 (중복 생성 방지)", async () => {
      const id1 = await service.getOrCreateManualSource(TENANT_ID);
      const id2 = await service.getOrCreateManualSource(TENANT_ID);
      expect(id1).toBe(id2);

      const sources = db
        .select()
        .from(radarSources)
        .where(eq(radarSources.name, "__manual__"))
        .all();
      expect(sources).toHaveLength(1);
    });

    it("테넌트별 독립 __manual__ 소스 생성", async () => {
      const otherTenantId = "t-other";
      db.insert(tenants)
        .values({ id: otherTenantId, name: "Other", slug: "other", ownerUserId: USER_ID })
        .run();

      const id1 = await service.getOrCreateManualSource(TENANT_ID);
      const id2 = await service.getOrCreateManualSource(otherTenantId);
      expect(id1).not.toBe(id2);
    });
  });

  // ══════════════════════════════════════════════
  // collectFromText
  // ══════════════════════════════════════════════
  describe("collectFromText", () => {
    it("텍스트 메모 수집 — 정상 등록", async () => {
      const result = await service.collectFromText({
        title: "테스트 메모",
        content: "이것은 테스트 메모 내용입니다.",
        userId: USER_ID,
        tenantId: TENANT_ID,
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.item).toBeTruthy();

      const items = db.select().from(radarItems).all();
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe("테스트 메모");
      expect(items[0].contentType).toBe("memo");
      expect(items[0].rawContent).toBe("이것은 테스트 메모 내용입니다.");
      expect(items[0].parsedContent).toBe("이것은 테스트 메모 내용입니다.");
      expect(items[0].url).toContain("manual://");
    });

    it("동일 제목 중복 등록 시 isDuplicate 반환", async () => {
      await service.collectFromText({
        title: "중복 메모",
        content: "첫 번째",
        userId: USER_ID,
        tenantId: TENANT_ID,
      });

      const dup = await service.collectFromText({
        title: "중복 메모",
        content: "두 번째 (다른 내용)",
        userId: USER_ID,
        tenantId: TENANT_ID,
      });

      expect(dup.isDuplicate).toBe(true);
      const items = db.select().from(radarItems).all();
      expect(items).toHaveLength(1);
    });

    it("excerpt은 내용의 앞 200자", async () => {
      const longContent = "가".repeat(500);
      const result = await service.collectFromText({
        title: "긴 메모",
        content: longContent,
        userId: USER_ID,
        tenantId: TENANT_ID,
      });

      expect(result.isDuplicate).toBe(false);
      const item = db.select().from(radarItems).all()[0];
      expect(item.excerpt).toHaveLength(200);
    });
  });

  // ══════════════════════════════════════════════
  // collectFromFile
  // ══════════════════════════════════════════════
  describe("collectFromFile", () => {
    it("파일 수집 — 정상 등록 (contentType=document)", async () => {
      const result = await service.collectFromFile({
        title: "분석 보고서",
        content: "PDF에서 추출된 텍스트 내용",
        fileName: "report.pdf",
        fileType: "pdf",
        fileSize: 1024000,
        userId: USER_ID,
        tenantId: TENANT_ID,
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.item).toBeTruthy();

      const items = db.select().from(radarItems).all();
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe("분석 보고서");
      expect(items[0].contentType).toBe("document");
      expect(items[0].rawContent).toBe("PDF에서 추출된 텍스트 내용");
      expect(items[0].url).toContain("file://");
      expect(items[0].url).toContain("report.pdf");
    });

    it("itemMetadata에 파일 정보 저장", async () => {
      await service.collectFromFile({
        title: "문서 파일",
        content: "내용",
        fileName: "doc.docx",
        fileType: "docx",
        fileSize: 2048,
        userId: USER_ID,
        tenantId: TENANT_ID,
      });

      const item = db.select().from(radarItems).all()[0];
      const metadata = item.itemMetadata as { fileName: string; fileType: string; fileSize: number };
      expect(metadata.fileName).toBe("doc.docx");
      expect(metadata.fileType).toBe("docx");
      expect(metadata.fileSize).toBe(2048);
    });

    it("동일 제목 중복 등록 방지", async () => {
      await service.collectFromFile({
        title: "중복 파일",
        content: "첫 번째",
        fileName: "a.pdf",
        fileType: "pdf",
        fileSize: 1000,
        userId: USER_ID,
        tenantId: TENANT_ID,
      });

      const dup = await service.collectFromFile({
        title: "중복 파일",
        content: "두 번째",
        fileName: "b.pdf",
        fileType: "pdf",
        fileSize: 2000,
        userId: USER_ID,
        tenantId: TENANT_ID,
      });

      expect(dup.isDuplicate).toBe(true);
      const items = db.select().from(radarItems).all();
      expect(items).toHaveLength(1);
    });

    it("__manual__ 시스템 소스에 연결", async () => {
      await service.collectFromFile({
        title: "시스템 소스 테스트",
        content: "내용",
        fileName: "test.txt",
        fileType: "txt",
        fileSize: 100,
        userId: USER_ID,
        tenantId: TENANT_ID,
      });

      const item = db.select().from(radarItems).all()[0];
      const source = db
        .select()
        .from(radarSources)
        .where(eq(radarSources.id, item.sourceId))
        .all()[0];
      expect(source.name).toBe("__manual__");
      expect(source.collectionType).toBe("manual");
    });

    it("excerpt은 내용의 앞 200자", async () => {
      const longContent = "나".repeat(500);
      await service.collectFromFile({
        title: "긴 파일",
        content: longContent,
        fileName: "long.txt",
        fileType: "txt",
        fileSize: 1000,
        userId: USER_ID,
        tenantId: TENANT_ID,
      });

      const item = db.select().from(radarItems).all()[0];
      expect(item.excerpt).toHaveLength(200);
    });

    it("dedupeKey 생성 검증", async () => {
      await service.collectFromFile({
        title: "Dedupe Test",
        content: "content",
        fileName: "test.pdf",
        fileType: "pdf",
        fileSize: 100,
        userId: USER_ID,
        tenantId: TENANT_ID,
      });

      const item = db.select().from(radarItems).all()[0];
      expect(item.dedupeKey).toBeTruthy();
      expect(typeof item.dedupeKey).toBe("string");
      expect(item.dedupeKey!.length).toBe(64); // SHA-256 hex
    });
  });

  // ══════════════════════════════════════════════
  // sendToIdea
  // ══════════════════════════════════════════════
  describe("sendToIdea", () => {
    it("아이템에서 아이디어 생성 (link_type=primary)", async () => {
      // 아이템 준비
      const textResult = await service.collectFromText({
        title: "아이디어 후보",
        content: "좋은 아이디어 소스",
        userId: USER_ID,
        tenantId: TENANT_ID,
      });

      const itemId = (textResult.item as { id: string }).id;
      const result = await service.sendToIdea({
        itemId,
        userId: USER_ID,
        tenantId: TENANT_ID,
      });

      expect(result.ideaId).toBeTruthy();

      // ideas 테이블 확인
      const createdIdeas = db.select().from(ideas).all();
      expect(createdIdeas).toHaveLength(1);
      expect(createdIdeas[0].title).toBe("아이디어 후보");
      expect(createdIdeas[0].tenantId).toBe(TENANT_ID);

      // idea_sources 연결 확인
      const links = db.select().from(ideaSources).all();
      expect(links).toHaveLength(1);
      expect(links[0].linkType).toBe("primary");
      expect(links[0].createdBy).toBe("user");
      expect(links[0].radarItemId).toBe(itemId);
    });

    it("존재하지 않는 아이템 → 에러", async () => {
      await expect(
        service.sendToIdea({
          itemId: "nonexistent",
          userId: USER_ID,
          tenantId: TENANT_ID,
        }),
      ).rejects.toThrow("아이템을 찾을 수 없습니다.");
    });

    it("파일 수집 아이템에서도 아이디어 생성 가능", async () => {
      const fileResult = await service.collectFromFile({
        title: "PDF 인사이트",
        content: "PDF 내용에서 발견한 것",
        fileName: "insight.pdf",
        fileType: "pdf",
        fileSize: 5000,
        userId: USER_ID,
        tenantId: TENANT_ID,
      });

      const itemId = (fileResult.item as { id: string }).id;
      const result = await service.sendToIdea({
        itemId,
        userId: USER_ID,
        tenantId: TENANT_ID,
      });

      expect(result.ideaId).toBeTruthy();

      const createdIdeas = db.select().from(ideas).all();
      expect(createdIdeas).toHaveLength(1);
      expect(createdIdeas[0].title).toBe("PDF 인사이트");
    });
  });
});
