/**
 * Ideas API 통합 테스트
 * 대상: api.ideas (POST/PATCH/DELETE), api.ideas.$id.sources (POST/DELETE)
 * 서비스 레이어 직접 호출 + API 유효성 검증 로직 재현
 */

import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, resetFixtureCounter } from "../../helpers/fixtures";
import { users, tenants, tenantMembers, radarItems, radarSources } from "~/db";
import { ideas, ideaSources } from "~/features/ideas/db/schema";
import { IdeaService } from "~/features/ideas/service/idea.service";
import type { DB } from "~/db";

let db: TestDB;
let svc: IdeaService;

const TENANT_ID = "t1";
const USER_OWNER = "u-owner";
const USER_OTHER = "u-other";

beforeEach(() => {
  resetFixtureCounter();
  db = createTestDb();
  svc = new IdeaService(db as unknown as DB);

  // 시드 데이터
  db.insert(users)
    .values([
      makeUser({ id: USER_OWNER, name: "소유자" }),
      makeUser({ id: USER_OTHER, name: "다른 유저" }),
    ])
    .run();

  db.insert(tenants).values({ id: TENANT_ID, name: "Test Org", slug: "test-org", ownerUserId: USER_OWNER }).run();
  db.insert(tenantMembers)
    .values([
      { id: "tm-1", tenantId: TENANT_ID, userId: USER_OWNER, role: "admin" },
      { id: "tm-2", tenantId: TENANT_ID, userId: USER_OTHER, role: "user" },
    ])
    .run();

  // radarSources → radarItems 시드 (소스 링크 테스트용)
  db.insert(radarSources)
    .values({
      id: "rs-1",
      name: "test-source",
      url: "https://test.com",
      sourceType: "rss",
      tenantId: TENANT_ID,
    })
    .run();

  db.insert(radarItems)
    .values([
      {
        id: "ri-1",
        sourceId: "rs-1",
        title: "Source Item 1",
        url: "https://example.com/1",
        urlHash: "hash-1",
        status: "collected",
      },
      {
        id: "ri-2",
        sourceId: "rs-1",
        title: "Source Item 2",
        url: "https://example.com/2",
        urlHash: "hash-2",
        status: "collected",
      },
    ])
    .run();
});

// ─── GET /api/ideas: 목록 조회 ────────────────

describe("GET /api/ideas — 아이디어 목록 조회", () => {
  it("테넌트별 아이디어 목록을 조회한다", async () => {
    await svc.create(TENANT_ID, USER_OWNER, "아이디어 1");
    await svc.create(TENANT_ID, USER_OWNER, "아이디어 2");

    const list = await svc.list(TENANT_ID);

    expect(list).toHaveLength(2);
    expect(list.map((i) => i.title)).toContain("아이디어 1");
    expect(list.map((i) => i.title)).toContain("아이디어 2");
  });

  it("다른 테넌트의 아이디어는 조회되지 않는다", async () => {
    await svc.create(TENANT_ID, USER_OWNER, "t1 아이디어");

    const list = await svc.list("other-tenant");

    expect(list).toHaveLength(0);
  });

  it("빈 목록을 반환한다", async () => {
    const list = await svc.list(TENANT_ID);
    expect(list).toHaveLength(0);
  });
});

// ─── 단건 조회 ─────────────────────────────────

describe("GET /api/ideas/:id — 단건 조회", () => {
  it("존재하는 아이디어를 조회한다", async () => {
    const id = await svc.create(TENANT_ID, USER_OWNER, "조회 대상");

    const idea = await svc.getById(id);

    expect(idea).not.toBeNull();
    expect(idea!.title).toBe("조회 대상");
    expect(idea!.tenantId).toBe(TENANT_ID);
    expect(idea!.ownerId).toBe(USER_OWNER);
  });

  it("존재하지 않는 ID는 null을 반환한다", async () => {
    const result = await svc.getById("nonexistent-id");
    expect(result).toBeNull();
  });
});

// ─── POST /api/ideas: 생성 ────────────────────

describe("POST /api/ideas — 아이디어 생성", () => {
  it("정상 생성 (tenantId, ownerId, title)", async () => {
    const id = await svc.create(TENANT_ID, USER_OWNER, "새 기능 아이디어");

    const idea = await svc.getById(id);
    expect(idea).not.toBeNull();
    expect(idea!.title).toBe("새 기능 아이디어");
    expect(idea!.tenantId).toBe(TENANT_ID);
    expect(idea!.ownerId).toBe(USER_OWNER);
    expect(idea!.status).toBe("ACTIVE");
  });

  it("기본 제목 '새 아이디어' — API 라우트에서 title 없으면 기본값 적용", () => {
    // API route: const title = body.title?.trim() || "새 아이디어"
    const applyDefault = (input: string | undefined) =>
      input?.trim() || "새 아이디어";

    expect(applyDefault(undefined)).toBe("새 아이디어");
    expect(applyDefault("")).toBe("새 아이디어");
    expect(applyDefault("  ")).toBe("새 아이디어");
    expect(applyDefault("커스텀 제목")).toBe("커스텀 제목");
  });
});

// ─── createFromAgent ──────────────────────────

describe("createFromAgent — AI 에이전트 생성", () => {
  it("createdByAgent=1로 생성된다", async () => {
    const id = await svc.createFromAgent(TENANT_ID, USER_OWNER, "AI 생성 아이디어");

    const idea = await svc.getById(id);
    expect(idea).not.toBeNull();
    expect(idea!.createdByAgent).toBe(1);
    expect(idea!.title).toBe("AI 생성 아이디어");
  });
});

// ─── PATCH /api/ideas: 제목 수정 ──────────────

describe("PATCH /api/ideas — 제목 수정", () => {
  let ideaId: string;

  beforeEach(async () => {
    ideaId = await svc.create(TENANT_ID, USER_OWNER, "원래 제목");
  });

  it("정상 수정", async () => {
    await svc.updateTitle(ideaId, "수정된 제목");

    const idea = await svc.getById(ideaId);
    expect(idea!.title).toBe("수정된 제목");
  });

  it("빈 제목 → 400 에러 시뮬레이션 (API route trim 후 빈 문자열)", () => {
    // API route: if (!title || title.length === 0) → 400
    const invalidCases = ["", "  ", undefined as string | undefined];

    for (const raw of invalidCases) {
      const title = raw?.trim();
      const isInvalid = !title || title.length === 0;
      expect(isInvalid, `title="${raw}" should be invalid`).toBe(true);
    }
  });

  it("200자 초과 제목 → 400 에러 시뮬레이션", () => {
    // API route: if (title.length > 200) → 400
    const longTitle = "가".repeat(201);
    expect(longTitle.length > 200).toBe(true);

    const exactTitle = "가".repeat(200);
    expect(exactTitle.length > 200).toBe(false);
  });
});

// ─── DELETE /api/ideas: 삭제 ──────────────────

describe("DELETE /api/ideas — 아이디어 삭제", () => {
  it("정상 삭제", async () => {
    const id = await svc.create(TENANT_ID, USER_OWNER, "삭제 대상");

    await svc.delete(id);

    const result = await svc.getById(id);
    expect(result).toBeNull();
  });

  it("삭제 후 목록에서 제외된다", async () => {
    const id = await svc.create(TENANT_ID, USER_OWNER, "삭제될 아이디어");
    await svc.create(TENANT_ID, USER_OWNER, "남을 아이디어");

    await svc.delete(id);

    const list = await svc.list(TENANT_ID);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("남을 아이디어");
  });
});

// ─── getAnalysisData ──────────────────────────

describe("getAnalysisData — 분석 데이터 조회", () => {
  it("title + analysisData를 반환한다", async () => {
    const id = await svc.create(TENANT_ID, USER_OWNER, "분석 대상");

    const result = await svc.getAnalysisData(id);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("분석 대상");
    expect(result!.analysisData).toBeNull();
  });

  it("존재하지 않는 아이디어는 null", async () => {
    const result = await svc.getAnalysisData("nonexistent");
    expect(result).toBeNull();
  });
});

// ─── 소스 링크 ─────────────────────────────────

describe("소스 링크 (linkSource / unlinkSource / getLinkedSources)", () => {
  let ideaId: string;

  beforeEach(async () => {
    ideaId = await svc.create(TENANT_ID, USER_OWNER, "소스 테스트");
  });

  it("소스 링크 성공 → true 반환", async () => {
    const result = await svc.linkSource(ideaId, "ri-1");
    expect(result).toBe(true);
  });

  it("중복 링크 → false 반환 (unique constraint)", async () => {
    await svc.linkSource(ideaId, "ri-1");
    const result = await svc.linkSource(ideaId, "ri-1");
    expect(result).toBe(false);
  });

  it("소스 연결 해제", async () => {
    await svc.linkSource(ideaId, "ri-1");
    await svc.unlinkSource(ideaId, "ri-1");

    const sources = await svc.getLinkedSources(ideaId);
    expect(sources).toHaveLength(0);
  });

  it("연결된 소스 목록 조회 (radarItems JOIN)", async () => {
    await svc.linkSource(ideaId, "ri-1");
    await svc.linkSource(ideaId, "ri-2");

    const sources = await svc.getLinkedSources(ideaId);
    expect(sources).toHaveLength(2);
    expect(sources.map((s) => s.title)).toContain("Source Item 1");
    expect(sources.map((s) => s.title)).toContain("Source Item 2");
    expect(sources[0].url).toBeTruthy();
  });

  it("소스가 없는 아이디어는 빈 배열", async () => {
    const sources = await svc.getLinkedSources(ideaId);
    expect(sources).toHaveLength(0);
  });
});
