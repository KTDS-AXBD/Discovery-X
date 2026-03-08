import type {
  ParsedContent,
  ContentBlock,
  ParsedTable,
  SectionInput,
} from "../types.js";
import { HEADING_TYPE_MAP } from "./section-groups.js";

/** 산문 텍스트를 문장 단위로 분리 (한국어/영어 지원) */
export function splitIntoSentences(text: string): string[] {
  if (!text?.trim()) return [];
  return text
    .replace(/\*\*/g, "")
    .split(/(?<=[.!?다요음임됨함])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8)
    .map((s) => (s.length > 120 ? s.slice(0, 117) + "..." : s));
}

/** 마크다운을 구조화된 블록으로 파싱 (테이블 감지 포함) */
export function parseMarkdown(markdown: string): ParsedContent {
  if (!markdown?.trim()) return { keyInsight: "", blocks: [], tables: [] };

  const lines = markdown.split("\n");
  const blocks: ContentBlock[] = [];
  const tables: ParsedTable[] = [];
  let currentBlock: ContentBlock = { bullets: [], subBullets: {} };
  let firstParagraph = "";
  let lastHeading = "";

  // 마크다운 테이블 감지 + 파싱
  let tableBuffer: string[] = [];
  let inTable = false;

  function flushTable() {
    if (tableBuffer.length < 2) {
      tableBuffer = [];
      inTable = false;
      return;
    }
    const headerLine = tableBuffer[0];
    const dataLines = tableBuffer.slice(2); // skip separator line
    const headers = headerLine
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    const rows = dataLines
      .filter((l) => l.includes("|") && !l.match(/^[\s|:-]+$/))
      .map((l) =>
        l
          .split("|")
          .map((c) => c.replace(/\*\*/g, "").trim())
          .filter(Boolean),
      );
    if (headers.length >= 2 && rows.length >= 1) {
      tables.push({
        heading: lastHeading || undefined,
        headers,
        rows: rows.slice(0, 10),
      });
    }
    tableBuffer = [];
    inTable = false;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    // 테이블 행 감지
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      inTable = true;
      tableBuffer.push(trimmed);
      continue;
    }
    if (inTable) {
      // 구분행 (|---|---| 등)
      if (trimmed.match(/^[\s|:-]+$/) && trimmed.includes("|")) {
        tableBuffer.push(trimmed);
        continue;
      }
      flushTable();
    }

    if (!trimmed) continue;

    // 헤딩 → 새 블록 시작
    const headingMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      if (currentBlock.bullets.length > 0 || currentBlock.heading) {
        blocks.push(currentBlock);
      }
      lastHeading = headingMatch[1].replace(/\*\*/g, "").trim();
      currentBlock = {
        heading: lastHeading,
        bullets: [],
        subBullets: {},
      };
      continue;
    }

    // 하위 리스트 (들여쓰기된 - 또는 *)
    const subListMatch = rawLine.match(/^(\s{2,})[-*]\s+(.+)$/);
    if (subListMatch) {
      const parentIdx = currentBlock.bullets.length - 1;
      if (parentIdx >= 0) {
        if (!currentBlock.subBullets[parentIdx]) {
          currentBlock.subBullets[parentIdx] = [];
        }
        currentBlock.subBullets[parentIdx].push(
          subListMatch[2].replace(/\*\*/g, "").trim(),
        );
      }
      continue;
    }

    // 리스트 아이템
    const listMatch =
      trimmed.match(/^[-*]\s+(.+)$/) || trimmed.match(/^\d+\.\s+(.+)$/);
    if (listMatch) {
      currentBlock.bullets.push(listMatch[1].replace(/\*\*/g, "").trim());
      continue;
    }

    // 산문 텍스트 → 문장 단위로 분리하여 불릿화
    if (
      trimmed.length > 10 &&
      !trimmed.startsWith("|") &&
      !trimmed.startsWith("```")
    ) {
      if (!firstParagraph) firstParagraph = trimmed;
      const sentences = trimmed
        .split(/(?<=[.!?])\s+/)
        .filter((s) => s.length > 10);
      for (const sentence of sentences) {
        const cleaned = sentence.replace(/\*\*/g, "").trim();
        currentBlock.bullets.push(
          cleaned.length > 120 ? cleaned.slice(0, 117) + "..." : cleaned,
        );
      }
    }
  }

  if (currentBlock.bullets.length > 0 || currentBlock.heading) {
    blocks.push(currentBlock);
  }

  // 남은 테이블 버퍼 flush
  if (inTable) flushTable();

  // Key Insight: 첫 문단의 첫 문장 또는 첫 블릿
  const keyInsight =
    firstParagraph?.split(/[.!?]\s/)?.[0]?.replace(/\*\*/g, "").trim() ||
    blocks[0]?.bullets[0] ||
    "";

  return { keyInsight, blocks, tables };
}

/** 파싱된 블록을 슬라이드용 불릿 목록으로 변환 (최대 maxPerSlide개) */
export function flattenBlocks(
  blocks: ContentBlock[],
  maxPerSlide = 7,
): Array<{
  bullets: string[];
  subBullets: Record<number, string[]>;
  heading?: string;
}> {
  const pages: Array<{
    bullets: string[];
    subBullets: Record<number, string[]>;
    heading?: string;
  }> = [];
  let current: {
    bullets: string[];
    subBullets: Record<number, string[]>;
    heading?: string;
  } = {
    bullets: [],
    subBullets: {},
    heading: undefined,
  };

  for (const block of blocks) {
    for (let i = 0; i < block.bullets.length; i++) {
      if (current.bullets.length >= maxPerSlide) {
        pages.push(current);
        current = { bullets: [], subBullets: {}, heading: block.heading };
      }

      if (i === 0 && block.heading && current.bullets.length === 0) {
        current.heading = block.heading;
      }

      const newIdx = current.bullets.length;
      current.bullets.push(block.bullets[i]);
      if (block.subBullets[i]) {
        current.subBullets[newIdx] = block.subBullets[i];
      }
    }
  }

  if (current.bullets.length > 0) {
    pages.push(current);
  }

  return pages;
}

/** markdown 모드에서 H2 헤딩 기반 섹션 분할 */
export function splitByHeadings(markdown: string): SectionInput[] {
  const lines = markdown.split("\n");
  const sections: SectionInput[] = [];
  let currentTitle = "";
  let currentType = "content";
  let buffer: string[] = [];

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)$/);
    const h2Match = line.match(/^##\s+(.+)$/);

    if (h2Match) {
      // 이전 섹션 저장
      if (buffer.length > 0 || currentTitle) {
        sections.push({
          type: currentType,
          title: currentTitle || "Untitled",
          content: buffer.join("\n").trim(),
        });
      }
      currentTitle = h2Match[1].replace(/\*\*/g, "").trim();
      // 키워드 매칭으로 타입 추론
      currentType = inferSectionType(currentTitle);
      buffer = [];
      continue;
    }

    if (h1Match && sections.length === 0 && buffer.length === 0) {
      // H1은 전체 제목으로 무시 (title 파라미터 사용)
      continue;
    }

    buffer.push(line);
  }

  // 마지막 섹션
  if (buffer.length > 0 || currentTitle) {
    sections.push({
      type: currentType,
      title: currentTitle || "내용",
      content: buffer.join("\n").trim(),
    });
  }

  return sections;
}

function inferSectionType(heading: string): string {
  const lower = heading.toLowerCase();
  for (const [keyword, type] of Object.entries(HEADING_TYPE_MAP)) {
    if (lower.includes(keyword)) return type;
  }
  return "content";
}
