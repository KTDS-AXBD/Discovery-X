/**
 * Agent 응답에서 참조된 엔티티를 파싱하여 인용 블록을 생성한다.
 * tool_result에서 discovery_id, evidence_id, proposal_id를 추출.
 */

import type { ToolCallResult } from "./agent-pipeline";

export interface Citation {
  type: "discovery" | "evidence" | "proposal";
  id: string;
  title: string;
  url: string;
}

/** 인용 블록 마크다운 생성 */
export function buildCitationBlock(citations: Citation[]): string {
  if (citations.length === 0) return "";
  const unique = deduplicateCitations(citations);
  const lines = unique.map((c) => {
    const label =
      c.type === "discovery"
        ? "Discovery"
        : c.type === "evidence"
          ? "Evidence"
          : "Proposal";
    return `- [${label} #${c.id}](${c.url}) — "${c.title}"`;
  });
  return `\n\n---\n**[참조]**\n${lines.join("\n")}`;
}

/** tool_result 배열에서 Citation 추출 */
export function extractCitationsFromToolResults(
  toolResults: ToolCallResult[],
): Citation[] {
  const citations: Citation[] = [];

  for (const tr of toolResults) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(tr.result);
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== "object") continue;
    const obj = parsed as Record<string, unknown>;

    // 단일 discovery 결과 (get_discovery_detail)
    if (obj.discovery && typeof obj.discovery === "object") {
      const d = obj.discovery as Record<string, unknown>;
      if (d.id && d.title) {
        citations.push({
          type: "discovery",
          id: String(d.id),
          title: String(d.title),
          url: `/discoveries/${d.id}`,
        });
      }
      // 중첩 evidence 배열
      if (Array.isArray(obj.evidence)) {
        for (const ev of obj.evidence) {
          if (ev && typeof ev === "object" && ev.id) {
            citations.push({
              type: "evidence",
              id: String(ev.id),
              title: String(ev.title || ev.type || "Evidence"),
              url: `/discoveries/${d.id}#evidence-${ev.id}`,
            });
          }
        }
      }
    }

    // discovery 목록 결과 (list_discoveries, search_similar)
    if (Array.isArray(obj.discoveries)) {
      for (const d of obj.discoveries) {
        if (d && typeof d === "object" && d.id && d.title) {
          citations.push({
            type: "discovery",
            id: String(d.id),
            title: String(d.title),
            url: `/discoveries/${d.id}`,
          });
        }
      }
    }

    // proposal 결과
    if (obj.proposal && typeof obj.proposal === "object") {
      const p = obj.proposal as Record<string, unknown>;
      if (p.id && p.title) {
        citations.push({
          type: "proposal",
          id: String(p.id),
          title: String(p.title),
          url: `/proposals/${p.id}`,
        });
      }
    }

    // proposals 목록
    if (Array.isArray(obj.proposals)) {
      for (const p of obj.proposals) {
        if (p && typeof p === "object" && p.id && p.title) {
          citations.push({
            type: "proposal",
            id: String(p.id),
            title: String(p.title),
            url: `/proposals/${p.id}`,
          });
        }
      }
    }
  }

  return citations;
}

/** type+id 기준 중복 제거 */
function deduplicateCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((c) => {
    const key = `${c.type}:${c.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
