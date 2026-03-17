/**
 * CHANGELOG.md 파서 — 세션 단위로 구조화된 데이터 추출
 *
 * docs/CHANGELOG.md 포맷:
 *   ### 세션 NNN (YYYY-MM-DD)
 *   **제목**:
 *   - ✅/⚠️/ℹ️ 내용
 *   **검증 결과**:
 *   - ✅/⚠️/⏭️ 내용
 */

// --- Types ---

export type ItemStatus = "done" | "warning" | "info" | "skipped";

export interface ChangelogItem {
  status: ItemStatus;
  text: string;
}

export interface ChangelogSession {
  /** 세션 식별자 — 숫자 또는 접미사 포함 (예: "408", "393b") */
  id: string;
  /** 세션 번호 (정수 부분, 정렬/비교용) */
  numericId: number;
  /** 날짜 문자열 (YYYY-MM-DD) */
  date: string;
  /** 세션 제목 (볼드 라인) */
  title: string;
  /** 작업 항목 리스트 */
  items: ChangelogItem[];
  /** 검증 결과 리스트 */
  verification: ChangelogItem[];
  /** 참조된 F항목 번호들 (예: [46, 47]) */
  fItems: number[];
  /** 참조된 REQ 코드들 (예: ["DX-REQ-016"]) */
  reqCodes: string[];
}

export interface ChangelogParseResult {
  sessions: ChangelogSession[];
  totalCount: number;
}

// --- Parser ---

const SESSION_HEADER_RE = /^###\s+세션\s+(\d+[a-z]*)\s+\((\d{4}-\d{2}-\d{2})\)/;
const ITEM_EMOJI_RE = /^-\s+(✅|⚠️|ℹ️|⏭️)\s+(.+)$/;
const ITEM_PLAIN_RE = /^-\s+(.+)$/;
const TITLE_RE = /^\*\*(.+?)\*\*\s*:?\s*$/;
const F_ITEM_RE = /\bF(\d+)\b/g;
const REQ_CODE_RE = /\bDX-REQ-(\d+)\b/g;

function parseItemStatus(emoji: string): ItemStatus {
  switch (emoji) {
    case "✅":
      return "done";
    case "⚠️":
      return "warning";
    case "ℹ️":
      return "info";
    case "⏭️":
      return "skipped";
    default:
      return "info";
  }
}

function extractFItems(text: string): number[] {
  const matches = [...text.matchAll(F_ITEM_RE)];
  const nums = matches.map((m) => parseInt(m[1], 10));
  return [...new Set(nums)].sort((a, b) => a - b);
}

function extractReqCodes(text: string): string[] {
  const matches = [...text.matchAll(REQ_CODE_RE)];
  const codes = matches.map((m) => `DX-REQ-${m[1]}`);
  return [...new Set(codes)].sort();
}

/**
 * CHANGELOG.md 전문을 파싱하여 세션 목록을 반환한다.
 * 세션은 역순 (최신 먼저) 유지.
 */
export function parseChangelog(content: string): ChangelogParseResult {
  const lines = content.split("\n");
  const sessions: ChangelogSession[] = [];
  let current: ChangelogSession | null = null;
  let inVerification = false;

  for (const line of lines) {
    const headerMatch = line.match(SESSION_HEADER_RE);
    if (headerMatch) {
      // 이전 세션 마무리
      if (current) {
        finalize(current);
        sessions.push(current);
      }
      current = {
        id: headerMatch[1],
        numericId: parseInt(headerMatch[1], 10),
        date: headerMatch[2],
        title: "",
        items: [],
        verification: [],
        fItems: [],
        reqCodes: [],
      };
      inVerification = false;
      continue;
    }

    if (!current) continue;

    // 검증 결과 섹션 감지
    if (line.match(/^\*\*검증\s*결과\*\*/)) {
      inVerification = true;
      continue;
    }

    // 제목 감지 (첫 번째 볼드 라인)
    const titleMatch = line.match(TITLE_RE);
    if (titleMatch && !current.title && !inVerification) {
      current.title = titleMatch[1];
      continue;
    }

    // 불릿 항목 감지 (이모지 있는 항목 우선, 없으면 info로 fallback)
    const emojiMatch = line.match(ITEM_EMOJI_RE);
    if (emojiMatch) {
      const item: ChangelogItem = {
        status: parseItemStatus(emojiMatch[1]),
        text: emojiMatch[2],
      };
      if (inVerification) {
        current.verification.push(item);
      } else {
        current.items.push(item);
      }
    } else {
      const plainMatch = line.match(ITEM_PLAIN_RE);
      if (plainMatch) {
        const item: ChangelogItem = { status: "info", text: plainMatch[1] };
        if (inVerification) {
          current.verification.push(item);
        } else {
          current.items.push(item);
        }
      }
    }
  }

  // 마지막 세션 마무리
  if (current) {
    finalize(current);
    sessions.push(current);
  }

  return { sessions, totalCount: sessions.length };
}

/** 세션 본문에서 F항목/REQ 코드 추출 */
function finalize(session: ChangelogSession): void {
  const fullText = [
    session.title,
    ...session.items.map((i) => i.text),
    ...session.verification.map((i) => i.text),
  ].join(" ");

  session.fItems = extractFItems(fullText);
  session.reqCodes = extractReqCodes(fullText);
}

// --- Query helpers ---

export interface ChangelogFilter {
  /** F항목 번호 필터 */
  fItem?: number;
  /** 날짜 범위 시작 (YYYY-MM-DD) */
  dateFrom?: string;
  /** 날짜 범위 끝 (YYYY-MM-DD) */
  dateTo?: string;
  /** 텍스트 검색 (제목+항목) */
  search?: string;
}

export interface ChangelogQueryOptions {
  filter?: ChangelogFilter;
  /** 0-based 페이지 */
  page?: number;
  /** 페이지당 세션 수 (기본 10) */
  pageSize?: number;
}

/**
 * 파싱된 세션 목록에 필터+페이지네이션을 적용한다.
 */
export function queryChangelog(
  result: ChangelogParseResult,
  options: ChangelogQueryOptions = {}
): { sessions: ChangelogSession[]; total: number; page: number; pageSize: number } {
  const { filter, page = 0, pageSize = 10 } = options;
  let filtered = result.sessions;

  if (filter) {
    if (filter.fItem !== undefined) {
      filtered = filtered.filter((s) => s.fItems.includes(filter.fItem!));
    }
    if (filter.dateFrom) {
      filtered = filtered.filter((s) => s.date >= filter.dateFrom!);
    }
    if (filter.dateTo) {
      filtered = filtered.filter((s) => s.date <= filter.dateTo!);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      filtered = filtered.filter((s) => {
        const text = [s.title, ...s.items.map((i) => i.text)].join(" ").toLowerCase();
        return text.includes(q);
      });
    }
  }

  const total = filtered.length;
  const start = page * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  return { sessions: paged, total, page, pageSize };
}
