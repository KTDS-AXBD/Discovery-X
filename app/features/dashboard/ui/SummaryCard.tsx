import { Link, useFetcher } from "@remix-run/react";
import { displayTitle } from "~/lib/utils/display-title";
import { cn } from "~/lib/utils/cn";

interface SummaryCardProps {
  item: {
    id: string;
    title: string;
    titleKo: string | null;
    summaryKo: string | null;
    summary: string | null;
    keyPoints: string[] | null;
    url: string;
  } | null;
  reaction: string | null;
}

export function SummaryCard({ item, reaction }: SummaryCardProps) {
  const fetcher = useFetcher();

  // Optimistic UI: prefer fetcher's submitted value
  const optimisticReaction = fetcher.formData
    ? (JSON.parse(fetcher.formData.get("json") as string ?? "{}").reaction ?? null)
    : reaction;

  function handleReaction(type: "like" | "dislike") {
    if (!item) return;
    const newReaction = optimisticReaction === type ? null : type;
    fetcher.submit(JSON.stringify({ reaction: newReaction }), {
      method: "PATCH",
      action: `/api/radar/items/${item.id}/reaction`,
      encType: "application/json",
    });
  }

  if (!item) {
    return (
      <div className="flex h-full flex-col bg-surface">
        <div className="shrink-0 border-b border-line px-6 py-4">
          <h2 className="text-base font-semibold text-fg">요약/정리</h2>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-fg-tertiary">소스를 선택하세요</p>
        </div>
      </div>
    );
  }

  // Parse summary into heading + body + bullets
  const rawSummary = item.summaryKo || item.summary || "";
  const lines = rawSummary.split("\n").filter((l) => l.trim());

  // Separate plain paragraphs and bullet lines
  const paragraphs: string[] = [];
  const bullets: string[] = [];
  let subHeading = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
      bullets.push(trimmed.replace(/^[-*•]\s*/, ""));
    } else if (trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
      subHeading = trimmed.replace(/^#+\s*/, "");
    } else if (!subHeading && paragraphs.length === 0 && bullets.length === 0 && trimmed.length > 0) {
      paragraphs.push(trimmed);
    } else if (trimmed.length > 0) {
      // Additional paragraphs after bullets or subheading
      if (bullets.length > 0 || subHeading) {
        bullets.push(trimmed);
      } else {
        paragraphs.push(trimmed);
      }
    }
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Header */}
      <div className="shrink-0 border-b border-line px-6 py-4">
        <h2 className="text-base font-semibold text-fg">요약/정리</h2>
      </div>

      {/* Scrollable Content */}
      <div className="flex flex-1 flex-col overflow-hidden px-6 py-4">
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface-deep">
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-6">
            <h3 className="mb-3 font-semibold text-fg">
              {displayTitle(item.titleKo, item.title, item.url)}
            </h3>

            <div className="space-y-3 text-sm leading-relaxed text-fg-secondary">
              {/* Summary paragraphs */}
              {paragraphs.length > 0 && (
                paragraphs.map((p, i) => <p key={i}>{p}</p>)
              )}

              {/* Sub heading + bullets */}
              {(subHeading || bullets.length > 0) && (
                <div>
                  {subHeading && (
                    <p className="mb-2 font-semibold text-fg">{subHeading}</p>
                  )}
                  {bullets.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5">
                      {bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Keywords */}
              {item.keyPoints && item.keyPoints.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-fg-tertiary">키워드</p>
                  <p>{item.keyPoints.join(", ")}</p>
                </div>
              )}

              {/* Original link */}
              {item.url && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-fg-tertiary">원본 링크</p>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-fg-brand hover:underline"
                  >
                    {item.url}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Fixed Footer */}
          <div className="shrink-0 border-t border-line p-6">
            {/* Reaction buttons */}
            <div className="mb-3 flex items-center gap-4">
              <button
                type="button"
                onClick={() => handleReaction("like")}
                className={cn(
                  "transition-colors",
                  optimisticReaction === "like"
                    ? "text-badge-success-text"
                    : "text-fg-tertiary hover:text-fg",
                )}
                aria-label="좋아요"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V3a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m7.723-9.022a3 3 0 0 0-1.498.159 6.041 6.041 0 0 0-2.06 1.29M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => handleReaction("dislike")}
                className={cn(
                  "transition-colors",
                  optimisticReaction === "dislike"
                    ? "text-badge-destructive-text"
                    : "text-fg-tertiary hover:text-fg",
                )}
                aria-label="싫어요"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715A12.137 12.137 0 0 1 2.25 12c0-2.848.992-5.464 2.649-7.521C5.287 3.997 5.886 3.75 6.504 3.75h4.369a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 0 0 7.5 19.75 2.25 2.25 0 0 0 9.75 22a.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384m-10.253 1.5H9.7m8.075-9.75c.01.05.027.1.05.148.593 1.2.925 2.55.925 3.977 0 1.487-.36 2.89-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.086 1.227-1.918 1.227h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 0 0 .303-.54" />
                </svg>
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Link
                to="/radar"
                className="rounded border border-line px-3 py-1 text-xs text-fg-secondary transition-colors hover:bg-surface-secondary"
              >
                소스 추후 확대
              </Link>
              <Link
                to={`/ideas?sourceItemId=${item.id}`}
                className="rounded bg-fg px-4 py-1 text-xs text-surface transition-colors hover:opacity-90"
              >
                레퍼리 삭제
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
