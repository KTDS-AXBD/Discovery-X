/**
 * Document registry — imports docs/*.md at build time via Vite ?raw.
 */

import prdRaw from "../../../docs/specs/Discovery-X_Prototype_PRD_v0.1.md?raw";
import v14Raw from "../../../docs/specs/Discovery-X_v1.4.md?raw";
import kickoffRaw from "../../../docs/guides/KICKOFF_TEMPLATE.md?raw";
import runbookRaw from "../../../docs/guides/OPERATIONAL_RUNBOOK.md?raw";
import qaRaw from "../../../docs/guides/qa-checklist.md?raw";
import cheatSheetRaw from "../../../docs/guides/USER_CHEAT_SHEET.md?raw";
import userGuideRaw from "../../../docs/guides/user-guide.md?raw";

export type DocCategory = "planning" | "operations" | "guides";

export interface DocEntry {
  slug: string;
  title: string;
  description: string;
  content: string;
  category: DocCategory;
}

const CATEGORY_LABELS: Record<DocCategory, string> = {
  planning: "기획",
  operations: "운영",
  guides: "가이드",
};

export { CATEGORY_LABELS };

const docs: DocEntry[] = [
  {
    slug: "v1.4",
    title: "기획서 v1.4",
    description: "Discovery-X 최종 기획서",
    content: v14Raw,
    category: "planning",
  },
  {
    slug: "prd",
    title: "PRD v0.1",
    description: "프로토타입 요구사항 정의서",
    content: prdRaw,
    category: "planning",
  },
  {
    slug: "runbook",
    title: "운영 런북",
    description: "운영 절차 및 체크리스트",
    content: runbookRaw,
    category: "operations",
  },
  {
    slug: "qa-checklist",
    title: "QA 체크리스트",
    description: "품질 보증 점검 항목",
    content: qaRaw,
    category: "operations",
  },
  {
    slug: "kickoff",
    title: "킥오프 템플릿",
    description: "프로젝트 킥오프 가이드",
    content: kickoffRaw,
    category: "operations",
  },
  {
    slug: "user-guide",
    title: "사용자 가이드",
    description: "Discovery-X 사용법 안내",
    content: userGuideRaw,
    category: "guides",
  },
  {
    slug: "cheat-sheet",
    title: "치트시트",
    description: "빠른 참조 카드",
    content: cheatSheetRaw,
    category: "guides",
  },
];

export function getAllDocs(): DocEntry[] {
  return docs;
}

export function getDocBySlug(slug: string): DocEntry | undefined {
  return docs.find((d) => d.slug === slug);
}

