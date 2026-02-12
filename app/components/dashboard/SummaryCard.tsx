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

function SectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] px-2 py-0.5 text-[11px] font-semibold text-[var(--axis-text-secondary)]">
      {children}
    </span>
  );
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
      <div className="dx-panel p-5">
        <h3 className="mb-4 text-base font-bold text-[var(--axis-text-primary)]">요약/정리</h3>
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-[var(--axis-text-tertiary)]">소스를 선택하세요</p>
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
    <div className="dx-panel p-5">
      <h3 className="mb-4 text-base font-bold text-[var(--axis-text-primary)]">요약/정리</h3>

      <div className="space-y-4">
        {/* 핵심 요약 */}
        <div>
          <SectionBadge>핵심 요약</SectionBadge>
          <div className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--axis-text-secondary)]">
            {paragraphs.length > 0 ? (
              paragraphs.map((p, i) => <p key={i}>{p}</p>)
            ) : (
              <p>{displayTitle(item.titleKo, item.title)}</p>
            )}
          </div>
        </div>

        {/* 소제목 + 불릿 리스트 */}
        {(subHeading || bullets.length > 0) && (
          <div>
            {subHeading && (
              <p className="mb-1 text-sm font-bold text-[var(--axis-text-primary)]">
                {subHeading}
              </p>
            )}
            {bullets.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--axis-text-secondary)]">
                {bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 키워드 */}
        {item.keyPoints && item.keyPoints.length > 0 && (
          <div>
            <SectionBadge>키워드</SectionBadge>
            <p className="mt-2 text-sm text-[var(--axis-text-secondary)]">
              {item.keyPoints.join(", ")}
            </p>
          </div>
        )}

        {/* 원본 링크 */}
        {item.url && (
          <div>
            <SectionBadge>원본 링크</SectionBadge>
            <div className="mt-2">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--axis-text-link)] hover:underline"
              >
                {item.url}
              </a>
            </div>
          </div>
        )}

        {/* 하단: 반응 아이콘 + 액션 버튼 */}
        <div className="flex items-center justify-between border-t border-[var(--axis-border-default)] pt-4">
          {/* 좌: 좋아요/싫어요 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleReaction("like")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                optimisticReaction === "like"
                  ? "bg-[var(--axis-badge-success-bg,#D1FAE5)] text-[var(--axis-badge-success-text,#065F46)]"
                  : "text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]",
              )}
              aria-label="좋아요"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V3a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m7.723-9.022a3 3 0 0 0-1.498.159 6.041 6.041 0 0 0-2.06 1.29M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => handleReaction("dislike")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                optimisticReaction === "dislike"
                  ? "bg-[var(--axis-badge-destructive-bg,#FEE2E2)] text-[var(--axis-badge-destructive-text,#991B1B)]"
                  : "text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]",
              )}
              aria-label="싫어요"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715A12.137 12.137 0 0 1 2.25 12c0-2.848.992-5.464 2.649-7.521C5.287 3.997 5.886 3.75 6.504 3.75h4.369a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 0 0 7.5 19.75 2.25 2.25 0 0 0 9.75 22a.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384m-10.253 1.5H9.7m8.075-9.75c.01.05.027.1.05.148.593 1.2.925 2.55.925 3.977 0 1.487-.36 2.89-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.086 1.227-1.918 1.227h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 0 0 .303-.54" />
              </svg>
            </button>
          </div>

          {/* 우: 액션 버튼 */}
          <div className="flex gap-2">
            <Link
              to="/radar"
              className="rounded-md border border-[var(--axis-border-default)] px-4 py-1.5 text-sm font-medium text-[var(--axis-text-secondary)] transition-colors hover:bg-[var(--axis-surface-secondary)]"
            >
              소스 수집 관리
            </Link>
            <Link
              to={`/ideas?sourceItemId=${item.id}`}
              className="rounded-md bg-[var(--axis-text-brand,#2563EB)] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90"
            >
              아이디어 생성
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
