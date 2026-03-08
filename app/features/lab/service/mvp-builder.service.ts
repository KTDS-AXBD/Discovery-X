/**
 * MVP Builder Service — 4단계 Agent 루프
 * Proposal 데이터 분석 → Next.js MVP 코드 자동 생성
 */

import { eq, and, desc, sql } from "drizzle-orm";
import type { DB } from "~/db";
import {
  proposals,
  proposalSections,
  ideas,
  mvpBuilds,
} from "~/db";
import { callLLM } from "~/lib/ai";
import type { FallbackContext } from "~/lib/ai";

// ============================================================================
// Types
// ============================================================================

export interface MvpSpec {
  productName: string;
  tagline: string;
  features: { name: string; description: string; icon?: string }[];
  targetCustomer: string;
  valueProposition: string;
  apiEndpoints: {
    method: string;
    path: string;
    description: string;
    mockData: unknown;
  }[];
  faqItems: { question: string; answer: string }[];
}

export interface MvpArchitecture {
  pages: { path: string; description: string }[];
  apis: { path: string; method: string; description: string }[];
  components: { name: string; props: string; description: string }[];
  tailwindConfig: { primaryColor: string; fontFamily: string };
}

export interface MvpFile {
  path: string;
  content: string;
  language: string;
}

export type MvpBuildProgress =
  | { type: "step_start"; step: 1 | 2 | 3 | 4; label: string }
  | { type: "step_complete"; step: 1 | 2 | 3 | 4; data?: unknown }
  | {
      type: "file_generated";
      path: string;
      language: string;
      lines: number;
    }
  | { type: "error"; step: number; message: string }
  | {
      type: "complete";
      buildId: string;
      fileCount: number;
      totalLines: number;
    };

interface GenerateOptions {
  proposalId: string;
  tenantId: string;
  stack?: string;
  sections?: string[];
  apiKey: string;
  db: DB;
  fallbackCtx?: FallbackContext;
  onProgress: (event: MvpBuildProgress) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : text.trim();
  return JSON.parse(raw) as T;
}

function countLines(content: string): number {
  return content.split("\n").length;
}

function detectLanguage(path: string): string {
  if (path.endsWith(".tsx") || path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".md")) return "markdown";
  return "text";
}

// ============================================================================
// Service
// ============================================================================

export class MvpBuilderService {
  constructor(private db: DB) {}

  async generate(options: GenerateOptions): Promise<string> {
    const { onProgress } = options;

    // Step 1: 사업제안 분석
    onProgress({ type: "step_start", step: 1, label: "사업제안 분석" });
    const spec = await this.analyzeProposal(options);
    onProgress({ type: "step_complete", step: 1, data: spec });

    // Step 2: 아키텍처 설계
    onProgress({ type: "step_start", step: 2, label: "아키텍처 설계" });
    const arch = await this.designArchitecture(spec, options);
    onProgress({ type: "step_complete", step: 2, data: arch });

    // Step 3: 코드 생성
    onProgress({ type: "step_start", step: 3, label: "코드 생성" });
    const files = await this.generateCode(spec, arch, options);
    onProgress({ type: "step_complete", step: 3 });

    // Step 4: 검증
    onProgress({ type: "step_start", step: 4, label: "검증" });
    this.validateOutput(files);
    onProgress({ type: "step_complete", step: 4 });

    // DB 저장 — 같은 proposalId 기존 빌드 삭제 후 INSERT
    const buildId = crypto.randomUUID();
    const fileCount = files.length;
    const totalLines = files.reduce((sum, f) => sum + countLines(f.content), 0);

    await this.db
      .delete(mvpBuilds)
      .where(eq(mvpBuilds.proposalId, options.proposalId));

    await this.db.insert(mvpBuilds).values({
      id: buildId,
      proposalId: options.proposalId,
      tenantId: options.tenantId,
      stack: options.stack ?? "nextjs",
      sections: options.sections ?? [],
      projectName:
        spec.productName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "my-mvp",
      files,
      architecture: arch as unknown as Record<string, unknown>,
      summary: `${spec.productName} — ${spec.tagline}`,
      fileCount,
      totalLines,
      status: "completed",
    });

    onProgress({ type: "complete", buildId, fileCount, totalLines });
    return buildId;
  }

  // ---------- Step 1: 사업제안 분석 ----------

  private async analyzeProposal(options: GenerateOptions): Promise<MvpSpec> {
    const sections = await this.db
      .select()
      .from(proposalSections)
      .where(eq(proposalSections.proposalId, options.proposalId));

    const [proposal] = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, options.proposalId));

    if (!proposal) {
      throw new Error(`Proposal not found: ${options.proposalId}`);
    }

    // 같은 tenant의 최근 ideas analysisData (참고 자료)
    const recentIdeas = await this.db
      .select({ analysisData: ideas.analysisData })
      .from(ideas)
      .where(
        and(
          eq(ideas.tenantId, options.tenantId),
          sql`${ideas.analysisData} IS NOT NULL`,
        ),
      )
      .orderBy(desc(ideas.createdAt))
      .limit(5);

    const sectionSummary = sections
      .map((s) => `[${s.type}]\n${s.content}`)
      .join("\n\n");

    const ideasContext =
      recentIdeas.length > 0
        ? `\n\n## 참고: 최근 아이디어 분석 데이터\n${recentIdeas
            .map((i) => JSON.stringify(i.analysisData))
            .join("\n")}`
        : "";

    const prompt = `다음 사업제안 데이터를 분석하여 MVP 명세를 JSON으로 반환해라. 반드시 유효한 JSON만 반환.

## 사업제안: ${proposal.title}
${proposal.description ?? ""}

## 섹션 내용
${sectionSummary}
${ideasContext}

## 출력 형식 (JSON)
{
  "productName": "영문 프로젝트명 (kebab-case 가능)",
  "tagline": "한국어 한 줄 설명",
  "features": [
    { "name": "기능명", "description": "설명", "icon": "이모지 1개" }
  ],
  "targetCustomer": "대상 고객 한 줄 설명",
  "valueProposition": "핵심 가치제안 한 줄",
  "apiEndpoints": [
    { "method": "GET", "path": "/api/example", "description": "설명", "mockData": {} }
  ],
  "faqItems": [
    { "question": "질문", "answer": "답변" }
  ]
}

features는 3~5개, apiEndpoints는 2~4개, faqItems는 3~5개로 구성해라.`;

    const response = await callLLM(
      options.apiKey,
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      },
      options.fallbackCtx,
    );

    const text =
      response.content[0].type === "text" ? (response.content[0].text ?? "") : "";
    return extractJson<MvpSpec>(text);
  }

  // ---------- Step 2: 아키텍처 설계 ----------

  private async designArchitecture(
    spec: MvpSpec,
    options: GenerateOptions,
  ): Promise<MvpArchitecture> {
    const prompt = `다음 MVP 명세를 기반으로 Next.js App Router 프로젝트 구조를 설계해라. JSON만 반환.

## MVP 명세
${JSON.stringify(spec, null, 2)}

## 출력 형식 (JSON)
{
  "pages": [
    { "path": "app/page.tsx", "description": "메인 랜딩페이지" }
  ],
  "apis": [
    { "path": "app/api/example/route.ts", "method": "GET", "description": "설명" }
  ],
  "components": [
    { "name": "Hero", "props": "title: string, subtitle: string", "description": "히어로 섹션" }
  ],
  "tailwindConfig": {
    "primaryColor": "#3B82F6",
    "fontFamily": "Pretendard, sans-serif"
  }
}

규칙:
- pages에 app/layout.tsx와 app/page.tsx 필수 포함
- apis는 MVP 명세의 apiEndpoints에 대응
- components는 페이지에서 사용할 재사용 컴포넌트 3~6개
- tailwindConfig의 primaryColor는 프로젝트 성격에 맞는 색상`;

    const response = await callLLM(
      options.apiKey,
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      },
      options.fallbackCtx,
    );

    const text =
      response.content[0].type === "text" ? (response.content[0].text ?? "") : "";
    return extractJson<MvpArchitecture>(text);
  }

  // ---------- Step 3: 코드 생성 ----------

  private async generateCode(
    spec: MvpSpec,
    arch: MvpArchitecture,
    options: GenerateOptions,
  ): Promise<MvpFile[]> {
    const files: MvpFile[] = [];

    const fileOrder: { path: string; description: string }[] = [
      { path: "package.json", description: "프로젝트 의존성 및 스크립트" },
      {
        path: "tailwind.config.ts",
        description: `Tailwind CSS 설정 (primary: ${arch.tailwindConfig.primaryColor})`,
      },
      { path: "app/layout.tsx", description: "공통 레이아웃" },
      {
        path: "app/page.tsx",
        description: "메인 랜딩페이지 (히어로 + 기능소개 + FAQ)",
      },
      ...arch.apis.map((api) => ({
        path: api.path,
        description: `${api.method} ${api.description}`,
      })),
      ...arch.components.map((comp) => ({
        path: `components/${comp.name}.tsx`,
        description: comp.description,
      })),
      { path: "README.md", description: "프로젝트 실행 가이드" },
    ];

    const contextSummary = `## 프로젝트 정보
- 이름: ${spec.productName}
- 설명: ${spec.tagline}
- 대상 고객: ${spec.targetCustomer}
- 핵심 가치: ${spec.valueProposition}

## 기능 목록
${spec.features.map((f) => `- ${f.icon ?? "•"} ${f.name}: ${f.description}`).join("\n")}

## API 엔드포인트
${spec.apiEndpoints.map((e) => `- ${e.method} ${e.path}: ${e.description}`).join("\n")}

## 아키텍처
${JSON.stringify(arch, null, 2)}`;

    for (const fileDef of fileOrder) {
      const previousFiles = files
        .slice(-3)
        .map(
          (f) => `### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``,
        )
        .join("\n\n");

      const prompt = `다음 Next.js MVP 프로젝트의 파일을 생성해라. 코드만 반환하고 설명은 넣지 마라.

${contextSummary}

${previousFiles ? `## 이미 생성된 파일 (참조용)\n${previousFiles}\n` : ""}
## 생성할 파일
- 경로: ${fileDef.path}
- 설명: ${fileDef.description}

규칙:
- TypeScript/TSX 사용
- Tailwind CSS 클래스 사용 (primary color: ${arch.tailwindConfig.primaryColor})
- 한국어 UI 텍스트
- 코드 블록 마크다운 없이 순수 코드만 반환
- API 라우트는 정적 mock 데이터 반환
- import 경로는 프로젝트 내 상대경로 또는 @/ alias 사용`;

      const response = await callLLM(
        options.apiKey,
        {
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          messages: [{ role: "user", content: prompt }],
        },
        options.fallbackCtx,
      );

      const rawText =
        response.content[0].type === "text" ? (response.content[0].text ?? "") : "";

      const fenced = rawText.match(
        /```(?:typescript|tsx|json|css|markdown|md)?\s*([\s\S]*?)```/,
      );
      const content = fenced ? fenced[1].trim() : rawText.trim();
      const language = detectLanguage(fileDef.path);
      const lines = countLines(content);

      files.push({ path: fileDef.path, content, language });

      options.onProgress({
        type: "file_generated",
        path: fileDef.path,
        language,
        lines,
      });
    }

    return files;
  }

  // ---------- Step 4: 검증 ----------

  private validateOutput(files: MvpFile[]): void {
    const filePaths = new Set(files.map((f) => f.path));

    for (const file of files) {
      if (file.language !== "typescript") continue;

      const importMatches = file.content.matchAll(
        /from\s+["'](?:@\/|\.\.?\/)([^"']+)["']/g,
      );
      for (const match of importMatches) {
        const importPath = match[1];
        const candidates = [
          importPath,
          `${importPath}.tsx`,
          `${importPath}.ts`,
          `${importPath}/index.tsx`,
          `${importPath}/index.ts`,
        ];
        const found = candidates.some((c) => filePaths.has(c));
        if (!found) {
          console.warn(
            `[mvp-builder] ${file.path}: import "${importPath}" — 대상 파일 미발견 (외부 패키지일 수 있음)`,
          );
        }
      }
    }

    const pkgFile = files.find((f) => f.path === "package.json");
    if (pkgFile) {
      try {
        const pkg = JSON.parse(pkgFile.content) as {
          dependencies?: Record<string, string>;
        };
        const deps = Object.keys(pkg.dependencies ?? {});
        const allCode = files
          .filter((f) => f.language === "typescript")
          .map((f) => f.content)
          .join("\n");

        for (const dep of deps) {
          if (["react", "react-dom", "next", "typescript"].includes(dep))
            continue;
          if (
            !allCode.includes(`from "${dep}`) &&
            !allCode.includes(`from '${dep}`)
          ) {
            console.warn(
              `[mvp-builder] package.json dependency "${dep}" — 실제 import에서 미사용`,
            );
          }
        }
      } catch {
        console.warn("[mvp-builder] package.json 파싱 실패");
      }
    }
  }
}
