/**
 * Venture Artifact → Markdown 변환기
 */

import type { VdArtifact, VdOpportunity, VdSprint } from "../db/schema";
import type { LeanCanvasContent } from "../schemas/opportunity.schema";
import { LEAN_CANVAS_BLOCKS } from "../schemas/opportunity.schema";

// ============================================================================
// TYPES
// ============================================================================

interface ExportOptions {
  includeMetadata?: boolean;
  includeTimestamps?: boolean;
}

interface SprintExportData {
  sprint: VdSprint;
  opportunities: Array<{
    opportunity: VdOpportunity;
    artifacts: VdArtifact[];
  }>;
}

// ============================================================================
// LEAN CANVAS → MARKDOWN
// ============================================================================

export function leanCanvasToMarkdown(
  content: LeanCanvasContent,
  title?: string
): string {
  const lines: string[] = [];

  if (title) {
    lines.push(`## ${title}`, "");
  }

  for (const block of LEAN_CANVAS_BLOCKS) {
    const key = block.key as keyof LeanCanvasContent;
    const data = content[key];

    if (!data) continue;

    lines.push(`### ${block.label}`);

    if (data.items && data.items.length > 0) {
      for (const item of data.items) {
        lines.push(`- ${item}`);
      }
    }

    if (data.notes && data.notes.trim()) {
      lines.push("");
      lines.push(`> ${data.notes}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// PITCH DECK → MARKDOWN
// ============================================================================

interface PitchDeckContent {
  slides?: Array<{
    title: string;
    content: string;
    notes?: string;
  }>;
  [key: string]: unknown;
}

export function pitchDeckToMarkdown(
  content: PitchDeckContent,
  title?: string
): string {
  const lines: string[] = [];

  if (title) {
    lines.push(`## ${title}`, "");
  }

  if (content.slides && Array.isArray(content.slides)) {
    for (let i = 0; i < content.slides.length; i++) {
      const slide = content.slides[i];
      lines.push(`### Slide ${i + 1}: ${slide.title}`);
      lines.push("");
      lines.push(slide.content);
      if (slide.notes) {
        lines.push("");
        lines.push(`> *Speaker notes: ${slide.notes}*`);
      }
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  } else {
    // 슬라이드 구조가 아닌 경우 JSON을 포맷팅
    lines.push("```json");
    lines.push(JSON.stringify(content, null, 2));
    lines.push("```");
  }

  return lines.join("\n");
}

// ============================================================================
// ONE PAGER → MARKDOWN
// ============================================================================

interface OnePagerContent {
  headline?: string;
  subheadline?: string;
  problem?: string;
  solution?: string;
  benefits?: string[];
  targetCustomer?: string;
  marketSize?: string;
  competitiveAdvantage?: string;
  callToAction?: string;
  [key: string]: unknown;
}

export function onePagerToMarkdown(
  content: OnePagerContent,
  title?: string
): string {
  const lines: string[] = [];

  if (title) {
    lines.push(`## ${title}`, "");
  }

  if (content.headline) {
    lines.push(`# ${content.headline}`, "");
  }

  if (content.subheadline) {
    lines.push(`*${content.subheadline}*`, "");
  }

  if (content.problem) {
    lines.push("### Problem");
    lines.push(content.problem, "");
  }

  if (content.solution) {
    lines.push("### Solution");
    lines.push(content.solution, "");
  }

  if (content.benefits && content.benefits.length > 0) {
    lines.push("### Key Benefits");
    for (const benefit of content.benefits) {
      lines.push(`- ${benefit}`);
    }
    lines.push("");
  }

  if (content.targetCustomer) {
    lines.push("### Target Customer");
    lines.push(content.targetCustomer, "");
  }

  if (content.marketSize) {
    lines.push("### Market Size");
    lines.push(content.marketSize, "");
  }

  if (content.competitiveAdvantage) {
    lines.push("### Competitive Advantage");
    lines.push(content.competitiveAdvantage, "");
  }

  if (content.callToAction) {
    lines.push("---");
    lines.push(`**${content.callToAction}**`, "");
  }

  // 알 수 없는 추가 필드들
  const knownKeys = [
    "headline",
    "subheadline",
    "problem",
    "solution",
    "benefits",
    "targetCustomer",
    "marketSize",
    "competitiveAdvantage",
    "callToAction",
  ];
  const extraKeys = Object.keys(content).filter((k) => !knownKeys.includes(k));

  if (extraKeys.length > 0) {
    lines.push("### Additional Information");
    for (const key of extraKeys) {
      const value = content[key];
      if (typeof value === "string") {
        lines.push(`**${key}:** ${value}`);
      } else if (Array.isArray(value)) {
        lines.push(`**${key}:**`);
        for (const item of value) {
          lines.push(`- ${item}`);
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// EXECUTIVE SUMMARY → MARKDOWN
// ============================================================================

interface ExecutiveSummaryContent {
  overview?: string;
  keyFindings?: string[];
  recommendations?: string[];
  nextSteps?: string[];
  risks?: string[];
  timeline?: string;
  budget?: string;
  [key: string]: unknown;
}

export function executiveSummaryToMarkdown(
  content: ExecutiveSummaryContent,
  title?: string
): string {
  const lines: string[] = [];

  if (title) {
    lines.push(`## ${title}`, "");
  }

  if (content.overview) {
    lines.push("### Overview");
    lines.push(content.overview, "");
  }

  if (content.keyFindings && content.keyFindings.length > 0) {
    lines.push("### Key Findings");
    for (const finding of content.keyFindings) {
      lines.push(`- ${finding}`);
    }
    lines.push("");
  }

  if (content.recommendations && content.recommendations.length > 0) {
    lines.push("### Recommendations");
    for (let i = 0; i < content.recommendations.length; i++) {
      lines.push(`${i + 1}. ${content.recommendations[i]}`);
    }
    lines.push("");
  }

  if (content.nextSteps && content.nextSteps.length > 0) {
    lines.push("### Next Steps");
    for (const step of content.nextSteps) {
      lines.push(`- [ ] ${step}`);
    }
    lines.push("");
  }

  if (content.risks && content.risks.length > 0) {
    lines.push("### Risks");
    for (const risk of content.risks) {
      lines.push(`- ${risk}`);
    }
    lines.push("");
  }

  if (content.timeline) {
    lines.push("### Timeline");
    lines.push(content.timeline, "");
  }

  if (content.budget) {
    lines.push("### Budget");
    lines.push(content.budget, "");
  }

  return lines.join("\n");
}

// ============================================================================
// ARTIFACT → MARKDOWN (Dispatcher)
// ============================================================================

export function artifactToMarkdown(artifact: VdArtifact): string {
  const content = artifact.content || {};

  switch (artifact.artifactType) {
    case "LEAN_CANVAS":
      return leanCanvasToMarkdown(content as LeanCanvasContent, artifact.title);

    case "PITCH_DECK":
      return pitchDeckToMarkdown(content as PitchDeckContent, artifact.title);

    case "ONE_PAGER":
      return onePagerToMarkdown(content as OnePagerContent, artifact.title);

    case "EXECUTIVE_SUMMARY":
      return executiveSummaryToMarkdown(
        content as ExecutiveSummaryContent,
        artifact.title
      );

    case "CUSTOM":
    default:
      // 기본: JSON 출력
      return [
        `## ${artifact.title}`,
        "",
        "```json",
        JSON.stringify(content, null, 2),
        "```",
      ].join("\n");
  }
}

// ============================================================================
// SPRINT EXPORT → MARKDOWN
// ============================================================================

export function sprintToMarkdown(
  data: SprintExportData,
  options: ExportOptions = {}
): string {
  const { sprint, opportunities } = data;
  const lines: string[] = [];

  // 헤더
  lines.push(`# ${sprint.name}`);
  lines.push("");

  if (sprint.description) {
    lines.push(sprint.description);
    lines.push("");
  }

  // 메타데이터
  if (options.includeMetadata) {
    lines.push("## Sprint Information");
    lines.push("");
    lines.push(`- **Status:** ${sprint.status}`);
    lines.push(`- **Current Day:** ${sprint.currentDay}`);
    if (options.includeTimestamps && sprint.createdAt) {
      lines.push(
        `- **Created:** ${new Date(sprint.createdAt).toLocaleDateString("ko-KR")}`
      );
    }
    if (options.includeTimestamps && sprint.startedAt) {
      lines.push(
        `- **Started:** ${new Date(sprint.startedAt).toLocaleDateString("ko-KR")}`
      );
    }
    if (options.includeTimestamps && sprint.completedAt) {
      lines.push(
        `- **Completed:** ${new Date(sprint.completedAt).toLocaleDateString("ko-KR")}`
      );
    }
    lines.push("");
  }

  // 목차 (Final 기회 목록)
  if (opportunities.length > 0) {
    lines.push("## Table of Contents");
    lines.push("");
    for (let i = 0; i < opportunities.length; i++) {
      const { opportunity } = opportunities[i];
      const anchor = opportunity.title
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]+/g, "-")
        .replace(/^-|-$/g, "");
      lines.push(`${i + 1}. [${opportunity.title}](#${anchor})`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // 각 기회별 산출물
  for (const { opportunity, artifacts } of opportunities) {
    lines.push(`# ${opportunity.title}`);
    lines.push("");

    if (opportunity.description) {
      lines.push(opportunity.description);
      lines.push("");
    }

    // 점수 표시
    const scores: string[] = [];
    if (opportunity.potentialScore !== null) {
      scores.push(`Potential: ${opportunity.potentialScore}`);
    }
    if (opportunity.confidenceScore !== null) {
      scores.push(`Confidence: ${opportunity.confidenceScore}`);
    }
    if (opportunity.depthScore !== null) {
      scores.push(`Depth: ${opportunity.depthScore}`);
    }
    if (opportunity.effortScore !== null) {
      scores.push(`Effort: ${opportunity.effortScore}`);
    }
    if (scores.length > 0) {
      lines.push(`> **Scores:** ${scores.join(" | ")}`);
      lines.push("");
    }

    if (opportunity.recommendation) {
      lines.push(`**Recommendation:** ${opportunity.recommendation}`);
      lines.push("");
    }

    // 산출물
    if (artifacts.length > 0) {
      for (const artifact of artifacts) {
        lines.push(artifactToMarkdown(artifact));
        lines.push("");
        lines.push("---");
        lines.push("");
      }
    } else {
      lines.push("*No artifacts generated yet.*");
      lines.push("");
    }
  }

  // 푸터
  lines.push("---");
  lines.push("");
  lines.push(`*Exported from Venture Discovery Sprint*`);
  if (options.includeTimestamps) {
    lines.push(`*Generated: ${new Date().toISOString()}*`);
  }

  return lines.join("\n");
}
