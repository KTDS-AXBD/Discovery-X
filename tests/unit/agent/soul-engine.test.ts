/**
 * SoulEngine 테스트
 *
 * 테스트 대상:
 * - buildPrompt (useGraphProjection=false): 폴백 프롬프트 반환, projectionsSummary
 * - buildPrompt (useGraphProjection=true): SOUL 템플릿, USER.md, TOPIC.md, MATRIX.md,
 *   AgentSettings, autonomyLevel, tokenEstimate, projectionsSummary
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── 모킹 ──────────────────────────────────────────────────────────────

const mockGetProjection = vi.fn();
const mockGetByScopeId = vi.fn();

vi.mock("~/lib/graph/projection", () => ({
  ProjectionBuilder: class {
    getProjection = mockGetProjection;
  },
}));

vi.mock("~/lib/graph/store", () => ({
  GraphStore: class {
    getByScopeId = mockGetByScopeId;
  },
}));

vi.mock("~/features/chat/agent/system-prompt", () => ({
  buildSystemPrompt: vi.fn().mockReturnValue("fallback system prompt"),
}));

import { SoulEngine } from "~/features/chat/agent/soul-engine";
import type { DB } from "~/db";

// ─── 헬퍼 ──────────────────────────────────────────────────────────────

const fakeDb = {} as DB;

function createEngine(overrides: {
  userId?: string;
  topicId?: string;
  teamId?: string;
  autonomyLevel?: number;
  useGraphProjection?: boolean;
} = {}) {
  return new SoulEngine({
    db: fakeDb,
    userId: overrides.userId ?? "user-001",
    topicId: overrides.topicId,
    teamId: overrides.teamId,
    autonomyLevel: overrides.autonomyLevel ?? 3,
    useGraphProjection: overrides.useGraphProjection ?? false,
  });
}

// ─── 테스트 ─────────────────────────────────────────────────────────────

describe("SoulEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProjection.mockResolvedValue(null);
    mockGetByScopeId.mockResolvedValue(null);
  });

  // ─── buildPrompt (useGraphProjection=false) ────────────────────────

  describe("buildPrompt (useGraphProjection=false)", () => {
    it("폴백 프롬프트를 반환한다", async () => {
      const engine = createEngine({ useGraphProjection: false });
      const result = await engine.buildPrompt();

      expect(result.systemPrompt).toBe("fallback system prompt");
    });

    it("projectionsSummary에 USER.md=false", async () => {
      const engine = createEngine({ useGraphProjection: false });
      const result = await engine.buildPrompt();

      const userMd = result.projectionsSummary.find((p) => p.type === "USER.md");
      expect(userMd).toBeDefined();
      expect(userMd!.available).toBe(false);
    });

    it("tokenEstimate가 계산된다", async () => {
      const engine = createEngine({ useGraphProjection: false });
      const result = await engine.buildPrompt();

      expect(result.tokenEstimate).toBe(
        Math.ceil("fallback system prompt".length / 3.5)
      );
    });
  });

  // ─── buildPrompt (useGraphProjection=true) ─────────────────────────

  describe("buildPrompt (useGraphProjection=true)", () => {
    it("base SOUL 템플릿을 포함한다", async () => {
      const engine = createEngine({ useGraphProjection: true });
      const result = await engine.buildPrompt();

      expect(result.systemPrompt).toContain("Discovery-X Agent — SOUL");
      expect(result.systemPrompt).toContain("분석적이고 직설적인");
    });

    it("USER.md projection이 있으면 포함한다", async () => {
      mockGetProjection.mockImplementation(
        async (scope: string, _id: string, projType: string) => {
          if (scope === "user" && projType === "USER.md") {
            return { content: "## 사용자 프로필\n전문분야: AI/ML" };
          }
          return null;
        }
      );

      const engine = createEngine({ useGraphProjection: true });
      const result = await engine.buildPrompt();

      expect(result.systemPrompt).toContain("사용자 프로필");
      expect(result.systemPrompt).toContain("전문분야: AI/ML");

      const userMd = result.projectionsSummary.find((p) => p.type === "USER.md");
      expect(userMd!.available).toBe(true);
    });

    it("TOPIC.md — topicId 없으면 미조회", async () => {
      const engine = createEngine({ useGraphProjection: true }); // topicId 없음

      await engine.buildPrompt();

      // getProjection이 topic scope로 호출되지 않아야 함
      const topicCalls = mockGetProjection.mock.calls.filter(
        (call: unknown[]) => call[0] === "topic"
      );
      expect(topicCalls.length).toBe(0);
    });

    it("TOPIC.md — topicId 있으면 조회", async () => {
      mockGetProjection.mockImplementation(
        async (scope: string, id: string, projType: string) => {
          if (scope === "topic" && id === "topic-123" && projType === "TOPIC.md") {
            return { content: "## 토픽: AI 트렌드\n최근 동향 정리" };
          }
          return null;
        }
      );

      const engine = createEngine({
        useGraphProjection: true,
        topicId: "topic-123",
      });
      const result = await engine.buildPrompt();

      expect(result.systemPrompt).toContain("토픽: AI 트렌드");

      const topicMd = result.projectionsSummary.find((p) => p.type === "TOPIC.md");
      expect(topicMd!.available).toBe(true);
    });

    it("MATRIX.md — teamId 있으면 조회 + 매트릭스 맥락 템플릿 추가", async () => {
      mockGetProjection.mockImplementation(
        async (scope: string, id: string, projType: string) => {
          if (scope === "team" && id === "team-ax" && projType === "MATRIX.md") {
            return { content: "## 매트릭스 데이터\nAI x 금융: 스코어 85" };
          }
          return null;
        }
      );

      const engine = createEngine({
        useGraphProjection: true,
        teamId: "team-ax",
      });
      const result = await engine.buildPrompt();

      expect(result.systemPrompt).toContain("매트릭스 맥락");
      expect(result.systemPrompt).toContain("산업(X축) × 기능(Y축)");
      expect(result.systemPrompt).toContain("AI x 금융: 스코어 85");

      const matrixMd = result.projectionsSummary.find((p) => p.type === "MATRIX.md");
      expect(matrixMd!.available).toBe(true);
    });

    it("AgentSettings 노드 있으면 사용자 맞춤 설정 포함", async () => {
      mockGetByScopeId.mockResolvedValue({
        jsonld: {
          "@graph": [
            {
              "@type": "dx:AgentSettings",
              "dx:language": "ko",
              "dx:style": "detailed",
              "dx:customInstructions": "항상 예시를 포함해주세요",
            },
          ],
        },
      });

      const engine = createEngine({ useGraphProjection: true });
      const result = await engine.buildPrompt();

      expect(result.systemPrompt).toContain("사용자 맞춤 설정");
      expect(result.systemPrompt).toContain("응답 언어: 한국어");
      expect(result.systemPrompt).toContain("상세한 분석과 설명 포함");
      expect(result.systemPrompt).toContain("항상 예시를 포함해주세요");
    });

    it("AgentSettings 없으면 null → 설정 섹션 없음", async () => {
      mockGetByScopeId.mockResolvedValue({
        jsonld: {
          "@graph": [{ "@type": "dx:SomeOtherNode" }],
        },
      });

      const engine = createEngine({ useGraphProjection: true });
      const result = await engine.buildPrompt();

      expect(result.systemPrompt).not.toContain("사용자 맞춤 설정");
    });

    it("autonomyLevel 섹션을 포함한다", async () => {
      const engine = createEngine({
        useGraphProjection: true,
        autonomyLevel: 2,
      });
      const result = await engine.buildPrompt();

      expect(result.systemPrompt).toContain("자율도 레벨");
      expect(result.systemPrompt).toContain("현재 자율도: 2");
      expect(result.systemPrompt).toContain("Semi-auto");
    });

    it("tokenEstimate 계산 (길이/3.5)", async () => {
      const engine = createEngine({ useGraphProjection: true });
      const result = await engine.buildPrompt();

      const expected = Math.ceil(result.systemPrompt.length / 3.5);
      expect(result.tokenEstimate).toBe(expected);
    });

    it("projectionsSummary 정확성", async () => {
      mockGetProjection.mockImplementation(
        async (scope: string, _id: string, projType: string) => {
          if (scope === "user" && projType === "USER.md") {
            return { content: "유저 프로필" };
          }
          if (scope === "user" && projType === "BRIEFING.md") {
            return { content: "오늘의 브리핑" };
          }
          return null;
        }
      );

      const engine = createEngine({ useGraphProjection: true });
      const result = await engine.buildPrompt();

      const summary = result.projectionsSummary;
      expect(summary).toEqual(
        expect.arrayContaining([
          { type: "SOUL.md (base)", available: true },
          { type: "USER.md", available: true },
          { type: "BRIEFING.md", available: true },
          { type: "TOPIC.md", available: false },
          { type: "MATRIX.md", available: false },
        ])
      );
    });
  });
});
