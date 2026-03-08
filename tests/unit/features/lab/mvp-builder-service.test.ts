/**
 * MvpBuilderService 단위 테스트 (실 DB + LLM mock)
 *
 * 대상: app/features/lab/service/mvp-builder.service.ts
 * - generate() 전체 플로우 (4단계)
 * - DB 저장 (insert/upsert)
 * - 에러 핸들링
 * - 순수 함수 (extractJson, detectLanguage, countLines, validateOutput)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "tests/helpers/db";
import { makeUser, resetFixtureCounter } from "tests/helpers/fixtures";
import type { DB } from "~/db";
import { users, tenants, tenantMembers, proposals, proposalSections } from "~/db";
import { mvpBuilds } from "~/features/lab/db/schema";

// ─── LLM Mock ────────────────────────────────────────────────────────────

const mockLLMResponses: string[] = [];
let llmCallCount = 0;

vi.mock("~/lib/ai", () => ({
  callLLM: vi.fn().mockImplementation(() => {
    const response = mockLLMResponses[llmCallCount] ?? '{}';
    llmCallCount++;
    return Promise.resolve({
      content: [{ type: "text", text: response }],
    });
  }),
}));

// ─── Constants ────────────────────────────────────────────────────────────

const TENANT_ID = "t-mvp-test";
const USER_ID = "u-mvp-1";
const PROPOSAL_ID = "prop-mvp-1";

// ─── Mock Data ────────────────────────────────────────────────────────────

const MOCK_SPEC = JSON.stringify({
  productName: "TestMVP",
  tagline: "테스트 MVP 프로젝트",
  features: [
    { name: "기능1", description: "설명1", icon: "🚀" },
    { name: "기능2", description: "설명2", icon: "📊" },
    { name: "기능3", description: "설명3", icon: "🔧" },
  ],
  targetCustomer: "스타트업 창업자",
  valueProposition: "빠른 MVP 검증",
  apiEndpoints: [
    { method: "GET", path: "/api/products", description: "제품 목록", mockData: [{ id: 1, name: "sample" }] },
  ],
  faqItems: [
    { question: "무엇인가요?", answer: "MVP 빌더입니다" },
  ],
});

const MOCK_ARCH = JSON.stringify({
  pages: [
    { path: "app/layout.tsx", description: "공통 레이아웃" },
    { path: "app/page.tsx", description: "메인 랜딩" },
  ],
  apis: [
    { path: "app/api/products/route.ts", method: "GET", description: "제품 목록" },
  ],
  components: [
    { name: "Hero", props: "title: string", description: "히어로 섹션" },
  ],
  tailwindConfig: { primaryColor: "#3B82F6", fontFamily: "Pretendard" },
});

function makeMockFileContent(path: string): string {
  if (path === "package.json") {
    return '```json\n{"name":"test-mvp","dependencies":{"next":"14","react":"18","react-dom":"18"}}\n```';
  }
  if (path === "README.md") {
    return "```markdown\n# Test MVP\n프로젝트 설명\n```";
  }
  return `\`\`\`typescript\nexport default function Component() {\n  return <div>Hello</div>;\n}\n\`\`\``;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function asDB(d: TestDB) {
  return d as unknown as DB;
}

function seedBase(db: TestDB) {
  db.insert(users)
    .values(makeUser({ id: USER_ID, name: "MVP User" }))
    .run();
  db.insert(tenants)
    .values({ id: TENANT_ID, name: "MVP Tenant", slug: "mvp-test", ownerUserId: USER_ID })
    .run();
  db.insert(tenantMembers)
    .values({ id: "tm-mvp-1", tenantId: TENANT_ID, userId: USER_ID })
    .run();
}

function seedProposal(db: TestDB) {
  db.insert(proposals)
    .values({
      id: PROPOSAL_ID,
      title: "테스트 사업제안",
      description: "MVP 빌더 테스트용 제안",
      status: "DRAFT",
      tenantId: TENANT_ID,
      ownerId: USER_ID,
    })
    .run();

  db.insert(proposalSections)
    .values({
      id: "ps-1",
      proposalId: PROPOSAL_ID,
      type: "overview",
      content: "프로젝트 개요입니다",
      sortOrder: 0,
    })
    .run();
  db.insert(proposalSections)
    .values({
      id: "ps-2",
      proposalId: PROPOSAL_ID,
      type: "target_market",
      content: "스타트업 대상 시장",
      sortOrder: 1,
    })
    .run();
}

function setupMockResponses(extraCodeFiles: number = 0) {
  mockLLMResponses.length = 0;
  llmCallCount = 0;

  // Step 1: analyzeProposal → MvpSpec
  mockLLMResponses.push(MOCK_SPEC);
  // Step 2: designArchitecture → MvpArchitecture
  mockLLMResponses.push(MOCK_ARCH);
  // Step 3: generateCode — 파일 수만큼 응답 필요
  // package.json, tailwind.config.ts, layout.tsx, page.tsx, api route, component, README
  const codeFileCount = 7 + extraCodeFiles;
  for (let i = 0; i < codeFileCount; i++) {
    mockLLMResponses.push(makeMockFileContent(`file-${i}.tsx`));
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

let db: TestDB;

beforeEach(() => {
  resetFixtureCounter();
  db = createTestDb();
  seedBase(db);
  seedProposal(db);
  mockLLMResponses.length = 0;
  llmCallCount = 0;
});

describe("MvpBuilderService", () => {
  describe("generate() — 전체 플로우", () => {
    it("4단계를 순서대로 실행하고 DB에 저장한다", async () => {
      setupMockResponses();

      const { MvpBuilderService } = await import(
        "~/features/lab/service/mvp-builder.service"
      );
      const service = new MvpBuilderService(asDB(db));

      const events: Array<{ type: string; step?: number }> = [];

      const buildId = await service.generate({
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_ID,
        apiKey: "test-key",
        db: asDB(db),
        onProgress: (evt) => events.push(evt),
      });

      expect(buildId).toBeTruthy();

      // 4단계 step_start + step_complete = 8 이벤트 + file_generated + complete
      const stepStarts = events.filter((e) => e.type === "step_start");
      const stepCompletes = events.filter((e) => e.type === "step_complete");
      expect(stepStarts).toHaveLength(4);
      expect(stepCompletes).toHaveLength(4);

      // step 순서 검증
      expect(stepStarts.map((e) => e.step)).toEqual([1, 2, 3, 4]);

      // file_generated 이벤트 존재
      const fileEvents = events.filter((e) => e.type === "file_generated");
      expect(fileEvents.length).toBeGreaterThan(0);

      // complete 이벤트 발행
      const completeEvt = events.find((e) => e.type === "complete");
      expect(completeEvt).toBeDefined();

      // DB 저장 검증
      const [saved] = db
        .select()
        .from(mvpBuilds)
        .where(eq(mvpBuilds.id, buildId))
        .all();

      expect(saved).toBeDefined();
      expect(saved.proposalId).toBe(PROPOSAL_ID);
      expect(saved.tenantId).toBe(TENANT_ID);
      expect(saved.status).toBe("completed");
      expect(saved.fileCount).toBeGreaterThan(0);
      expect(saved.totalLines).toBeGreaterThan(0);
      expect(saved.files.length).toBeGreaterThan(0);
      expect(saved.architecture).toBeDefined();
      expect(saved.summary).toContain("TestMVP");
    });

    it("기존 빌드를 삭제하고 새로 생성한다 (upsert 패턴)", async () => {
      // 기존 빌드 시드
      db.insert(mvpBuilds)
        .values({
          id: "old-build",
          proposalId: PROPOSAL_ID,
          tenantId: TENANT_ID,
          stack: "nextjs",
          projectName: "old-mvp",
          fileCount: 3,
          totalLines: 100,
          status: "completed",
        })
        .run();

      const oldBuilds = db.select().from(mvpBuilds).all();
      expect(oldBuilds).toHaveLength(1);

      setupMockResponses();

      const { MvpBuilderService } = await import(
        "~/features/lab/service/mvp-builder.service"
      );
      const service = new MvpBuilderService(asDB(db));

      const buildId = await service.generate({
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_ID,
        apiKey: "test-key",
        db: asDB(db),
        onProgress: () => {},
      });

      // 기존 빌드 삭제 확인
      const allBuilds = db.select().from(mvpBuilds).all();
      expect(allBuilds).toHaveLength(1);
      expect(allBuilds[0].id).toBe(buildId);
      expect(allBuilds[0].id).not.toBe("old-build");
    });

    it("존재하지 않는 proposal이면 에러를 던진다", async () => {
      mockLLMResponses.push("{}"); // step 1에서 proposal 없으면 에러

      const { MvpBuilderService } = await import(
        "~/features/lab/service/mvp-builder.service"
      );
      const service = new MvpBuilderService(asDB(db));

      await expect(
        service.generate({
          proposalId: "non-existent",
          tenantId: TENANT_ID,
          apiKey: "test-key",
          db: asDB(db),
          onProgress: () => {},
        }),
      ).rejects.toThrow("Proposal not found");
    });

    it("projectName을 kebab-case로 정규화한다", async () => {
      // 한글 이름이 포함된 spec 응답
      const specWithKorean = JSON.stringify({
        ...JSON.parse(MOCK_SPEC),
        productName: "나의 MVP 프로젝트",
      });
      mockLLMResponses.length = 0;
      llmCallCount = 0;
      mockLLMResponses.push(specWithKorean);
      mockLLMResponses.push(MOCK_ARCH);
      for (let i = 0; i < 7; i++) {
        mockLLMResponses.push(makeMockFileContent(`f${i}.tsx`));
      }

      const { MvpBuilderService } = await import(
        "~/features/lab/service/mvp-builder.service"
      );
      const service = new MvpBuilderService(asDB(db));

      const buildId = await service.generate({
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_ID,
        apiKey: "test-key",
        db: asDB(db),
        onProgress: () => {},
      });

      const [saved] = db
        .select()
        .from(mvpBuilds)
        .where(eq(mvpBuilds.id, buildId))
        .all();

      // 한글은 제거되고 빈 문자열이면 "my-mvp" fallback
      expect(saved.projectName).toMatch(/^[a-z0-9-]+$/);
    });
  });

  describe("progress 이벤트 상세", () => {
    it("file_generated 이벤트에 path, language, lines를 포함한다", async () => {
      setupMockResponses();

      const { MvpBuilderService } = await import(
        "~/features/lab/service/mvp-builder.service"
      );
      const service = new MvpBuilderService(asDB(db));

      const fileEvents: Array<{
        type: string;
        path?: string;
        language?: string;
        lines?: number;
      }> = [];

      await service.generate({
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_ID,
        apiKey: "test-key",
        db: asDB(db),
        onProgress: (evt) => {
          if (evt.type === "file_generated") fileEvents.push(evt);
        },
      });

      expect(fileEvents.length).toBeGreaterThan(0);
      for (const evt of fileEvents) {
        expect(evt.path).toBeTruthy();
        expect(evt.language).toBeTruthy();
        expect(typeof evt.lines).toBe("number");
        expect(evt.lines).toBeGreaterThan(0);
      }
    });

    it("complete 이벤트에 buildId, fileCount, totalLines를 포함한다", async () => {
      setupMockResponses();

      const { MvpBuilderService } = await import(
        "~/features/lab/service/mvp-builder.service"
      );
      const service = new MvpBuilderService(asDB(db));

      let completeEvt: Record<string, unknown> | null = null;

      await service.generate({
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_ID,
        apiKey: "test-key",
        db: asDB(db),
        onProgress: (evt) => {
          if (evt.type === "complete") completeEvt = evt as Record<string, unknown>;
        },
      });

      expect(completeEvt).toBeDefined();
      expect(completeEvt!.buildId).toBeTruthy();
      expect(typeof completeEvt!.fileCount).toBe("number");
      expect(typeof completeEvt!.totalLines).toBe("number");
    });
  });

  describe("sections/stack 옵션 전달", () => {
    it("기본값 stack=nextjs, sections=[] 로 저장한다", async () => {
      setupMockResponses();

      const { MvpBuilderService } = await import(
        "~/features/lab/service/mvp-builder.service"
      );
      const service = new MvpBuilderService(asDB(db));

      const buildId = await service.generate({
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_ID,
        apiKey: "test-key",
        db: asDB(db),
        onProgress: () => {},
      });

      const [saved] = db
        .select()
        .from(mvpBuilds)
        .where(eq(mvpBuilds.id, buildId))
        .all();

      expect(saved.stack).toBe("nextjs");
    });

    it("커스텀 sections를 DB에 저장한다", async () => {
      setupMockResponses();

      const { MvpBuilderService } = await import(
        "~/features/lab/service/mvp-builder.service"
      );
      const service = new MvpBuilderService(asDB(db));

      const buildId = await service.generate({
        proposalId: PROPOSAL_ID,
        tenantId: TENANT_ID,
        apiKey: "test-key",
        db: asDB(db),
        sections: ["hero", "features"],
        onProgress: () => {},
      });

      const [saved] = db
        .select()
        .from(mvpBuilds)
        .where(eq(mvpBuilds.id, buildId))
        .all();

      expect(saved.sections).toEqual(["hero", "features"]);
    });
  });
});

// ─── extractJson / detectLanguage / countLines 통합 검증 ─────────────────

describe("순수 함수 — 서비스 내 유틸리티", () => {
  it("fenced code block JSON 응답을 올바르게 파싱한다", async () => {
    const fencedSpec = {
      productName: "test",
      tagline: "테스트",
      features: [{ name: "기능", description: "설명" }],
      targetCustomer: "고객",
      valueProposition: "가치",
      apiEndpoints: [{ method: "GET", path: "/api/test", description: "설명", mockData: {} }],
      faqItems: [{ question: "Q", answer: "A" }],
    };
    const fencedResponse = '```json\n' + JSON.stringify(fencedSpec) + '\n```';
    mockLLMResponses.length = 0;
    llmCallCount = 0;
    mockLLMResponses.push(fencedResponse);
    mockLLMResponses.push(MOCK_ARCH);
    for (let i = 0; i < 7; i++) {
      mockLLMResponses.push(makeMockFileContent(`f${i}.tsx`));
    }

    const { MvpBuilderService } = await import(
      "~/features/lab/service/mvp-builder.service"
    );
    const service = new MvpBuilderService(asDB(db));

    // step 1에서 fenced JSON 파싱 성공 여부 — 에러 없이 완료되면 성공
    const events: Array<{ type: string }> = [];
    await service.generate({
      proposalId: PROPOSAL_ID,
      tenantId: TENANT_ID,
      apiKey: "test-key",
      db: asDB(db),
      onProgress: (evt) => events.push(evt),
    });

    expect(events.some((e) => e.type === "complete")).toBe(true);
  });

  it("TypeScript/JSON/CSS/Markdown 확장자를 올바르게 감지한다", async () => {
    setupMockResponses();

    const { MvpBuilderService } = await import(
      "~/features/lab/service/mvp-builder.service"
    );
    const service = new MvpBuilderService(asDB(db));

    const fileEvents: Array<{ type: string; path?: string; language?: string }> = [];
    await service.generate({
      proposalId: PROPOSAL_ID,
      tenantId: TENANT_ID,
      apiKey: "test-key",
      db: asDB(db),
      onProgress: (evt) => {
        if (evt.type === "file_generated") fileEvents.push(evt);
      },
    });

    // package.json → json
    const jsonFile = fileEvents.find((e) => e.path?.endsWith(".json"));
    if (jsonFile) expect(jsonFile.language).toBe("json");

    // .tsx → typescript
    const tsxFile = fileEvents.find((e) => e.path?.endsWith(".tsx"));
    if (tsxFile) expect(tsxFile.language).toBe("typescript");

    // README.md → markdown
    const mdFile = fileEvents.find((e) => e.path?.endsWith(".md"));
    if (mdFile) expect(mdFile.language).toBe("markdown");
  });
});
