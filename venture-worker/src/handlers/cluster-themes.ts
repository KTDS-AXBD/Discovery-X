/**
 * CLUSTER_THEMES 핸들러
 * - 기회들을 테마별로 클러스터링
 */

import type { Env, VdTaskQueueItem, TaskHandler } from "../types";
import { callClaude } from "../lib/claude";
import { getOpportunities, insertTheme, updateOpportunityTheme, insertWorkEvent } from "../db";
import { generateUUID } from "../lib/uuid";

const SYSTEM_PROMPT = `당신은 비즈니스 기회 분류 전문가입니다.
여러 기회들을 분석하여 의미 있는 테마/클러스터로 그룹화합니다.

테마는:
- 전략적으로 의미 있는 그룹이어야 합니다
- 각 테마는 명확한 특성을 가져야 합니다
- 테마 이름은 직관적이어야 합니다
- 계층 구조가 가능합니다 (상위 테마 - 하위 테마)

기회가 여러 테마에 속할 수 있지만, 주 테마 하나를 지정해야 합니다.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    themes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "테마 이름 (30자 이내)",
          },
          description: {
            type: "string",
            description: "테마 설명 (100자 이내)",
          },
          parentThemeName: {
            type: "string",
            description: "상위 테마 이름 (있는 경우)",
          },
          opportunityIndices: {
            type: "array",
            items: { type: "integer" },
            description: "이 테마에 속하는 기회 인덱스 (0부터 시작)",
          },
        },
        required: ["name", "description", "opportunityIndices"],
      },
      minItems: 1,
      maxItems: 10,
    },
  },
  required: ["themes"],
};

interface ClusterThemesInput {
  sprintId: string;
  opportunityIds?: string[];
}

interface ThemeOutput {
  name: string;
  description: string;
  parentThemeName?: string;
  opportunityIndices: number[];
}

interface ClaudeOutput {
  themes: ThemeOutput[];
}

export const clusterThemesHandler: TaskHandler = {
  taskType: "CLUSTER_THEMES",

  async execute(env: Env, task: VdTaskQueueItem): Promise<Record<string, unknown>> {
    const input = task.input as ClusterThemesInput | null;
    if (!input?.sprintId) {
      throw new Error("sprintId is required");
    }

    // 1. 기회 조회
    const opportunities = await getOpportunities(env.DB, input.sprintId, input.opportunityIds);
    if (opportunities.length === 0) {
      return { themesCreated: 0, message: "No opportunities found" };
    }

    // 2. 프롬프트 구성
    const opportunityDescriptions = opportunities.map((o, i) => {
      return `[${i}] ${o.title}
   ${o.description || ""}
   대상: ${o.target_segment || "미지정"}`;
    });

    const userPrompt = `다음 비즈니스 기회들을 의미 있는 테마로 클러스터링하세요:

${opportunityDescriptions.join("\n\n")}

클러스터링 지침:
1. 유사한 가치 제안, 대상 고객, 기술 영역을 기준으로 그룹화
2. 각 테마에 명확한 이름과 설명 부여
3. 필요시 상위-하위 테마 계층 구조 사용
4. 모든 기회가 최소 하나의 테마에 속해야 함
5. 3-7개의 테마가 적절함`;

    // 3. Claude API 호출
    const result = await callClaude<ClaudeOutput>({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.CLAUDE_MODEL,
      system: SYSTEM_PROMPT,
      user: userPrompt,
      schema: OUTPUT_SCHEMA,
    });

    // 4. 테마 저장 (부모 테마 먼저)
    const themeNameToId = new Map<string, string>();
    const createdThemes: string[] = [];

    // 부모가 없는 테마 먼저 처리
    const sortedThemes = [...result.themes].sort((a, b) => {
      if (!a.parentThemeName && b.parentThemeName) return -1;
      if (a.parentThemeName && !b.parentThemeName) return 1;
      return 0;
    });

    for (const theme of sortedThemes) {
      const themeId = generateUUID();
      themeNameToId.set(theme.name, themeId);

      const parentThemeId = theme.parentThemeName
        ? themeNameToId.get(theme.parentThemeName) || null
        : null;

      await insertTheme(env.DB, {
        id: themeId,
        sprint_id: input.sprintId,
        name: theme.name,
        description: theme.description,
        parent_theme_id: parentThemeId,
        opportunity_count: theme.opportunityIndices.length,
        depth_score: null,
        metadata: JSON.stringify({ generatedBy: "venture-worker" }),
      });

      createdThemes.push(themeId);

      // 기회에 테마 연결
      for (const idx of theme.opportunityIndices) {
        if (idx >= 0 && idx < opportunities.length) {
          await updateOpportunityTheme(env.DB, opportunities[idx].id, themeId);
        }
      }
    }

    // 5. Work Event 기록
    await insertWorkEvent(env.DB, {
      id: generateUUID(),
      sprintId: input.sprintId,
      eventType: "THEMES_CLUSTERED",
      actorType: "agent",
      entityType: "task",
      entityId: task.id,
      metadata: { count: createdThemes.length, themeIds: createdThemes },
    });

    return {
      themesCreated: createdThemes.length,
      themeIds: createdThemes,
    };
  },
};
