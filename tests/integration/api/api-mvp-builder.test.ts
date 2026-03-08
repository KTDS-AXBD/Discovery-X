/**
 * MVP Builder API 통합 테스트
 *
 * 대상:
 * - GET /api/lab/mvp-builder?proposalId={id} — 기존 빌드 조회
 * - GET /api/lab/mvp-builder/$id/download — ZIP 다운로드
 *
 * 라우트 비즈니스 로직 재현 + DB 검증 패턴
 * - loader: proposalId + tenantId 복합 필터, desc(createdAt) 정렬
 * - download: status=completed + files.length>0 조건, tenantId 격리, ZIP round-trip
 */
import { describe, it, expect, beforeEach } from "vitest";
import { eq, and, desc } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, resetFixtureCounter } from "../../helpers/fixtures";
import { users, tenants, tenantMembers, proposals } from "~/db";
import { mvpBuilds } from "~/features/lab/db/schema";
import type { DB } from "~/db";

let db: TestDB;

const TENANT_ID = "t-mvp-api";
const TENANT_OTHER = "t-mvp-other";
const USER_ID = "u-mvp-api";
const USER_OTHER = "u-mvp-other";
const PROPOSAL_ID = "prop-api-1";
const PROPOSAL_OTHER = "prop-api-other";
const BUILD_ID = "build-api-1";

function asDB(d: TestDB) {
  return d as unknown as DB;
}

beforeEach(() => {
  resetFixtureCounter();
  db = createTestDb();

  db.insert(users)
    .values([
      makeUser({ id: USER_ID, name: "API User" }),
      makeUser({ id: USER_OTHER, name: "Other User" }),
    ])
    .run();

  db.insert(tenants)
    .values([
      { id: TENANT_ID, name: "MVP API Tenant", slug: "mvp-api", ownerUserId: USER_ID },
      { id: TENANT_OTHER, name: "Other Tenant", slug: "mvp-other", ownerUserId: USER_OTHER },
    ])
    .run();

  db.insert(tenantMembers)
    .values([
      { id: "tm-api-1", tenantId: TENANT_ID, userId: USER_ID },
      { id: "tm-api-2", tenantId: TENANT_OTHER, userId: USER_OTHER },
    ])
    .run();

  db.insert(proposals)
    .values([
      {
        id: PROPOSAL_ID,
        title: "테스트 사업제안",
        status: "DRAFT",
        tenantId: TENANT_ID,
        ownerId: USER_ID,
      },
      {
        id: PROPOSAL_OTHER,
        title: "다른 테넌트 제안",
        status: "DRAFT",
        tenantId: TENANT_OTHER,
        ownerId: USER_OTHER,
      },
    ])
    .run();
});

// ─── mvpBuilds 시드 ─────────────────────────────────────────────────────

function seedBuild(overrides?: Partial<typeof mvpBuilds.$inferInsert>) {
  const values = {
    id: BUILD_ID,
    proposalId: PROPOSAL_ID,
    tenantId: TENANT_ID,
    stack: "nextjs",
    projectName: "test-mvp",
    files: [
      { path: "package.json", content: '{"name":"test"}', language: "json" },
      { path: "app/page.tsx", content: "export default function Page() { return <div>Hi</div>; }", language: "typescript" },
      { path: "README.md", content: "# Test MVP", language: "markdown" },
    ],
    architecture: { pages: [], apis: [], components: [], tailwindConfig: {} },
    summary: "TestMVP — 테스트",
    fileCount: 3,
    totalLines: 5,
    status: "completed" as const,
    ...overrides,
  };

  db.insert(mvpBuilds).values(values).run();
  return values;
}

// ─── loader 로직 재현 헬퍼 (라우트 api.lab.mvp-builder.ts 동일 쿼리) ───

function queryBuildByProposal(proposalId: string, tenantId: string) {
  const [build] = db
    .select()
    .from(mvpBuilds)
    .where(and(eq(mvpBuilds.proposalId, proposalId), eq(mvpBuilds.tenantId, tenantId)))
    .orderBy(desc(mvpBuilds.createdAt))
    .limit(1)
    .all();
  return build ?? null;
}

function queryBuildForDownload(buildId: string, tenantId: string) {
  const [build] = db
    .select()
    .from(mvpBuilds)
    .where(and(eq(mvpBuilds.id, buildId), eq(mvpBuilds.tenantId, tenantId)))
    .all();
  return build ?? null;
}

// ─── GET /api/lab/mvp-builder — 빌드 조회 ─────────────────────────────

describe("GET /api/lab/mvp-builder — 빌드 조회", () => {
  it("proposalId + tenantId 복합 필터로 빌드를 조회한다", () => {
    seedBuild();

    const build = queryBuildByProposal(PROPOSAL_ID, TENANT_ID);

    expect(build).not.toBeNull();
    expect(build!.id).toBe(BUILD_ID);
    expect(build!.projectName).toBe("test-mvp");
    expect(build!.status).toBe("completed");
    expect(build!.fileCount).toBe(3);
    expect(build!.files).toHaveLength(3);
  });

  it("빌드가 없으면 null을 반환한다", () => {
    const build = queryBuildByProposal("non-existent", TENANT_ID);
    expect(build).toBeNull();
  });

  it("다른 테넌트의 빌드는 proposalId가 같아도 조회할 수 없다", () => {
    seedBuild();

    // 같은 proposalId지만 다른 tenantId로 쿼리
    const build = queryBuildByProposal(PROPOSAL_ID, TENANT_OTHER);
    expect(build).toBeNull();
  });

  it("같은 proposalId의 최신 빌드(desc createdAt)를 반환한다", () => {
    // createdAt 초 단위이므로 명시적으로 다른 값 부여
    const past = new Date("2025-01-01T00:00:00Z");
    const now = new Date("2025-06-01T00:00:00Z");

    db.insert(mvpBuilds)
      .values({
        id: "old-build",
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_ID,
        stack: "nextjs",
        projectName: "old-mvp",
        files: [],
        fileCount: 0,
        totalLines: 0,
        status: "completed",
        createdAt: past,
      })
      .run();

    db.insert(mvpBuilds)
      .values({
        id: "new-build",
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_ID,
        stack: "nextjs",
        projectName: "new-mvp",
        files: [],
        fileCount: 0,
        totalLines: 0,
        status: "completed",
        createdAt: now,
      })
      .run();

    const build = queryBuildByProposal(PROPOSAL_ID, TENANT_ID);

    expect(build).not.toBeNull();
    expect(build!.id).toBe("new-build");
    expect(build!.projectName).toBe("new-mvp");
  });

  it("generating 상태의 빌드도 조회된다", () => {
    seedBuild({ status: "generating" });

    const build = queryBuildByProposal(PROPOSAL_ID, TENANT_ID);
    expect(build).not.toBeNull();
    expect(build!.status).toBe("generating");
  });

  it("failed 상태의 빌드도 조회된다 (에러 메시지 포함)", () => {
    seedBuild({ status: "failed", errorMessage: "LLM timeout" });

    const build = queryBuildByProposal(PROPOSAL_ID, TENANT_ID);
    expect(build).not.toBeNull();
    expect(build!.status).toBe("failed");
    expect(build!.errorMessage).toBe("LLM timeout");
  });
});

// ─── mvpBuilds 스키마 검증 ─────────────────────────────────────────────

describe("mvpBuilds 스키마", () => {
  it("files JSON 컬럼에 배열을 저장하고 읽는다", () => {
    const files = [
      { path: "a.tsx", content: "code A", language: "typescript" },
      { path: "b.json", content: "{}", language: "json" },
    ];

    db.insert(mvpBuilds)
      .values({
        id: "schema-test-1",
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_ID,
        stack: "nextjs",
        projectName: "schema-test",
        files,
        fileCount: 2,
        totalLines: 3,
        status: "completed",
      })
      .run();

    const [saved] = db
      .select()
      .from(mvpBuilds)
      .where(eq(mvpBuilds.id, "schema-test-1"))
      .all();

    expect(saved.files).toEqual(files);
  });

  it("architecture JSON 컬럼에 객체를 저장한다", () => {
    const arch = {
      pages: [{ path: "app/page.tsx", description: "메인" }],
      apis: [],
      components: [],
      tailwindConfig: { primaryColor: "#000" },
    };

    db.insert(mvpBuilds)
      .values({
        id: "schema-test-2",
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_ID,
        stack: "nextjs",
        projectName: "schema-test-2",
        files: [],
        architecture: arch,
        fileCount: 0,
        totalLines: 0,
        status: "completed",
      })
      .run();

    const [saved] = db
      .select()
      .from(mvpBuilds)
      .where(eq(mvpBuilds.id, "schema-test-2"))
      .all();

    expect(saved.architecture).toEqual(arch);
  });

  it("sections JSON 컬럼에 문자열 배열을 저장한다", () => {
    db.insert(mvpBuilds)
      .values({
        id: "schema-test-3",
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_ID,
        stack: "nextjs",
        sections: ["hero", "features", "faq"],
        projectName: "schema-test-3",
        files: [],
        fileCount: 0,
        totalLines: 0,
        status: "completed",
      })
      .run();

    const [saved] = db
      .select()
      .from(mvpBuilds)
      .where(eq(mvpBuilds.id, "schema-test-3"))
      .all();

    expect(saved.sections).toEqual(["hero", "features", "faq"]);
  });

  it("status 기본값은 generating이다", () => {
    db.insert(mvpBuilds)
      .values({
        id: "schema-test-4",
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_ID,
        stack: "nextjs",
        projectName: "schema-test-4",
        files: [],
        fileCount: 0,
        totalLines: 0,
      })
      .run();

    const [saved] = db
      .select()
      .from(mvpBuilds)
      .where(eq(mvpBuilds.id, "schema-test-4"))
      .all();

    expect(saved.status).toBe("generating");
  });

  it("errorMessage를 저장할 수 있다", () => {
    db.insert(mvpBuilds)
      .values({
        id: "schema-test-5",
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_ID,
        stack: "nextjs",
        projectName: "schema-test-5",
        files: [],
        fileCount: 0,
        totalLines: 0,
        status: "failed",
        errorMessage: "LLM 호출 실패",
      })
      .run();

    const [saved] = db
      .select()
      .from(mvpBuilds)
      .where(eq(mvpBuilds.id, "schema-test-5"))
      .all();

    expect(saved.status).toBe("failed");
    expect(saved.errorMessage).toBe("LLM 호출 실패");
  });
});

// ─── GET /api/lab/mvp-builder/$id/download — 다운로드 로직 ────────────

describe("GET /api/lab/mvp-builder/$id/download — 다운로드", () => {
  it("completed 빌드를 ZIP으로 다운로드한다", async () => {
    const { zipSync, unzipSync, strToU8, strFromU8 } = await import("fflate");
    const built = seedBuild();

    const build = queryBuildForDownload(BUILD_ID, TENANT_ID);
    expect(build).not.toBeNull();
    expect(build!.status).toBe("completed");
    expect(build!.files.length).toBeGreaterThan(0);

    // ZIP 생성 (라우트 로직 재현)
    const entries: Record<string, Uint8Array> = {};
    for (const f of build!.files) {
      entries[f.path] = strToU8(f.content);
    }
    const zipped = zipSync(entries);

    expect(zipped).toBeInstanceOf(Uint8Array);
    expect(zipped.length).toBeGreaterThan(0);

    // round-trip: 압축 → 해제 → 원본 content 일치 검증
    const unzipped = unzipSync(zipped);
    for (const f of built.files) {
      expect(unzipped[f.path]).toBeDefined();
      expect(strFromU8(unzipped[f.path])).toBe(f.content);
    }
  });

  it("존재하지 않는 빌드 ID면 null을 반환한다", () => {
    seedBuild();
    const build = queryBuildForDownload("non-existent", TENANT_ID);
    expect(build).toBeNull();
  });

  it("다른 테넌트의 빌드 ID로는 다운로드할 수 없다", () => {
    seedBuild();

    // 빌드 존재하지만 다른 tenantId로 쿼리
    const build = queryBuildForDownload(BUILD_ID, TENANT_OTHER);
    expect(build).toBeNull();
  });

  it("status가 generating이면 다운로드 불가 (라우트 400 조건)", () => {
    seedBuild({ status: "generating" });

    const build = queryBuildForDownload(BUILD_ID, TENANT_ID);
    expect(build).not.toBeNull();
    // 라우트는 status !== "completed" 이면 400
    expect(build!.status).not.toBe("completed");
  });

  it("status가 failed이면 다운로드 불가", () => {
    seedBuild({ status: "failed", errorMessage: "API 오류" });

    const build = queryBuildForDownload(BUILD_ID, TENANT_ID);
    expect(build).not.toBeNull();
    expect(build!.status).toBe("failed");
    expect(build!.status).not.toBe("completed");
  });

  it("files가 빈 배열이면 다운로드 불가 (라우트 400 조건)", () => {
    seedBuild({ files: [], fileCount: 0 });

    const build = queryBuildForDownload(BUILD_ID, TENANT_ID);
    expect(build).not.toBeNull();
    expect(build!.status).toBe("completed");
    // 라우트는 files.length === 0 이면 400
    expect(build!.files.length).toBe(0);
  });

  it("ZIP 파일명이 projectName.zip 형식이다", () => {
    seedBuild({ projectName: "my-awesome-mvp" });

    const build = queryBuildForDownload(BUILD_ID, TENANT_ID);
    const filename = `${build!.projectName}.zip`;
    expect(filename).toBe("my-awesome-mvp.zip");
  });

  it("다수 파일의 ZIP round-trip이 정확하다", async () => {
    const { zipSync, unzipSync, strToU8, strFromU8 } = await import("fflate");
    const manyFiles = Array.from({ length: 10 }, (_, i) => ({
      path: `src/component-${i}.tsx`,
      content: `export function Comp${i}() { return <div>${i}</div>; }`,
      language: "typescript",
    }));

    seedBuild({ id: "many-files", files: manyFiles, fileCount: 10, totalLines: 10 });

    const build = queryBuildForDownload("many-files", TENANT_ID);

    const entries: Record<string, Uint8Array> = {};
    for (const f of build!.files) {
      entries[f.path] = strToU8(f.content);
    }
    const zipped = zipSync(entries);
    const unzipped = unzipSync(zipped);

    expect(Object.keys(unzipped)).toHaveLength(10);
    for (const f of manyFiles) {
      expect(strFromU8(unzipped[f.path])).toBe(f.content);
    }
  });
});

// ─── 빌드 삭제 (upsert) 패턴 검증 ──────────────────────────────────────

describe("빌드 삭제 후 재생성 (upsert 패턴)", () => {
  it("같은 proposalId의 기존 빌드를 삭제한다", () => {
    seedBuild();

    // 기존 빌드 존재 확인
    let builds = db
      .select()
      .from(mvpBuilds)
      .where(eq(mvpBuilds.proposalId, PROPOSAL_ID))
      .all();
    expect(builds).toHaveLength(1);

    // 삭제
    db.delete(mvpBuilds)
      .where(eq(mvpBuilds.proposalId, PROPOSAL_ID))
      .run();

    builds = db
      .select()
      .from(mvpBuilds)
      .where(eq(mvpBuilds.proposalId, PROPOSAL_ID))
      .all();
    expect(builds).toHaveLength(0);
  });

  it("다른 proposalId의 빌드는 삭제하지 않는다", () => {
    seedBuild();

    // 다른 proposal 빌드
    db.insert(mvpBuilds)
      .values({
        id: "other-build",
        proposalId: PROPOSAL_OTHER,
        tenantId: TENANT_OTHER,
        stack: "nextjs",
        projectName: "other-mvp",
        files: [],
        fileCount: 0,
        totalLines: 0,
        status: "completed",
      })
      .run();

    // PROPOSAL_ID 빌드만 삭제
    db.delete(mvpBuilds)
      .where(eq(mvpBuilds.proposalId, PROPOSAL_ID))
      .run();

    const remaining = db.select().from(mvpBuilds).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("other-build");
  });
});

// ─── 멀티테넌트 격리 ──────────────────────────────────────────────────

describe("멀티테넌트 격리", () => {
  it("두 테넌트가 각각 같은 proposalId 패턴의 빌드를 가져도 격리된다", () => {
    // TENANT_ID의 빌드
    seedBuild({ id: "build-t1" });

    // TENANT_OTHER의 빌드 (다른 proposal)
    db.insert(mvpBuilds)
      .values({
        id: "build-t2",
        proposalId: PROPOSAL_OTHER,
        tenantId: TENANT_OTHER,
        stack: "nextjs",
        projectName: "other-mvp",
        files: [{ path: "index.tsx", content: "hello", language: "typescript" }],
        fileCount: 1,
        totalLines: 1,
        status: "completed",
      })
      .run();

    // 각 테넌트는 자기 빌드만 조회
    const build1 = queryBuildByProposal(PROPOSAL_ID, TENANT_ID);
    const build2 = queryBuildByProposal(PROPOSAL_OTHER, TENANT_OTHER);

    expect(build1!.id).toBe("build-t1");
    expect(build2!.id).toBe("build-t2");

    // 교차 조회 불가
    expect(queryBuildByProposal(PROPOSAL_ID, TENANT_OTHER)).toBeNull();
    expect(queryBuildByProposal(PROPOSAL_OTHER, TENANT_ID)).toBeNull();

    // 다운로드도 격리
    expect(queryBuildForDownload("build-t1", TENANT_OTHER)).toBeNull();
    expect(queryBuildForDownload("build-t2", TENANT_ID)).toBeNull();
  });
});

// ─── 상태 라이프사이클 ──────────────────────────────────────────────

describe("상태 라이프사이클", () => {
  it("generating → completed 전이 시 files/fileCount/totalLines가 채워진다", () => {
    // 초기: generating
    seedBuild({
      status: "generating",
      files: [],
      fileCount: 0,
      totalLines: 0,
    });

    let build = queryBuildByProposal(PROPOSAL_ID, TENANT_ID);
    expect(build!.status).toBe("generating");
    expect(build!.files).toHaveLength(0);

    // 완료 시 update 시뮬레이션
    const completedFiles = [
      { path: "app/page.tsx", content: "export default function() {}", language: "typescript" },
    ];
    db.update(mvpBuilds)
      .set({
        status: "completed",
        files: completedFiles,
        fileCount: 1,
        totalLines: 1,
      })
      .where(eq(mvpBuilds.id, BUILD_ID))
      .run();

    build = queryBuildByProposal(PROPOSAL_ID, TENANT_ID);
    expect(build!.status).toBe("completed");
    expect(build!.files).toHaveLength(1);
    expect(build!.fileCount).toBe(1);
  });

  it("generating → failed 전이 시 errorMessage가 기록된다", () => {
    seedBuild({ status: "generating" });

    db.update(mvpBuilds)
      .set({ status: "failed", errorMessage: "API rate limit" })
      .where(eq(mvpBuilds.id, BUILD_ID))
      .run();

    const build = queryBuildByProposal(PROPOSAL_ID, TENANT_ID);
    expect(build!.status).toBe("failed");
    expect(build!.errorMessage).toBe("API rate limit");
  });

  it("completed 빌드를 재생성하면 기존 삭제 후 새 빌드로 교체된다", () => {
    seedBuild({ id: "v1-build", projectName: "v1-mvp" });

    // 기존 삭제 + 새 빌드 삽입 (서비스 upsert 패턴 재현)
    db.delete(mvpBuilds)
      .where(eq(mvpBuilds.proposalId, PROPOSAL_ID))
      .run();

    db.insert(mvpBuilds)
      .values({
        id: "v2-build",
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_ID,
        stack: "nextjs",
        projectName: "v2-mvp",
        files: [{ path: "app/page.tsx", content: "v2", language: "typescript" }],
        fileCount: 1,
        totalLines: 1,
        status: "completed",
      })
      .run();

    const allBuilds = db
      .select()
      .from(mvpBuilds)
      .where(eq(mvpBuilds.proposalId, PROPOSAL_ID))
      .all();

    expect(allBuilds).toHaveLength(1);
    expect(allBuilds[0].id).toBe("v2-build");
    expect(allBuilds[0].projectName).toBe("v2-mvp");
  });
});

// ─── 인덱스 + 복합 쿼리 ──────────────────────────────────────────────

describe("인덱스 + 복합 쿼리 검증", () => {
  it("proposalId 인덱스로 빠르게 조회한다", () => {
    seedBuild();
    const result = db
      .select()
      .from(mvpBuilds)
      .where(eq(mvpBuilds.proposalId, PROPOSAL_ID))
      .all();
    expect(result).toHaveLength(1);
  });

  it("tenantId 인덱스로 빠르게 조회한다", () => {
    seedBuild();
    const result = db
      .select()
      .from(mvpBuilds)
      .where(eq(mvpBuilds.tenantId, TENANT_ID))
      .all();
    expect(result).toHaveLength(1);
  });

  it("proposalId + tenantId AND 복합 조건이 정확히 동작한다", () => {
    seedBuild();

    // 다른 테넌트에 같은 proposalId의 빌드 시뮬레이션 (현실에선 FK로 방지)
    db.insert(mvpBuilds)
      .values({
        id: "cross-build",
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_OTHER,
        stack: "nextjs",
        projectName: "cross-mvp",
        files: [],
        fileCount: 0,
        totalLines: 0,
        status: "completed",
      })
      .run();

    // AND 복합 조건으로 정확한 빌드만 반환
    const build = queryBuildByProposal(PROPOSAL_ID, TENANT_ID);
    expect(build!.id).toBe(BUILD_ID);

    const crossBuild = queryBuildByProposal(PROPOSAL_ID, TENANT_OTHER);
    expect(crossBuild!.id).toBe("cross-build");
  });
});
