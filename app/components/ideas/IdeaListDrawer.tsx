import { Link, useFetcher } from "@remix-run/react";
import { cn } from "~/lib/utils/cn";
import { useSidebar } from "~/lib/context/sidebar-context";

interface IdeaItem {
  id: string;
  title: string;
  status: string;
  createdAt: string | number | null;
}

interface IdeaListDrawerProps {
  ideas: IdeaItem[];
  selectedIdeaId?: string;
}

export function IdeaListDrawer({ ideas, selectedIdeaId }: IdeaListDrawerProps) {
  const { open, close } = useSidebar();
  const fetcher = useFetcher();

  const handleNewIdea = () => {
    fetcher.submit(
      { title: "새 아이디어" },
      { method: "POST", action: "/api/ideas", encType: "application/json" }
    );
  };

  const isCreating = fetcher.state !== "idle";

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 transition-opacity"
          onClick={close}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-surface-panel shadow-xl transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <button
            type="button"
            onClick={close}
            className="flex items-center gap-1.5 text-sm text-fg-secondary hover:text-fg"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            목록
          </button>
        </div>

        {/* Idea list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <p className="px-2 pb-1.5 text-xs font-medium text-fg-tertiary">최근</p>
          <div className="space-y-0.5">
            {ideas.map((idea) => (
              <Link
                key={idea.id}
                to={`/ideas/${idea.id}`}
                onClick={close}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  selectedIdeaId === idea.id
                    ? "bg-surface-card font-medium text-fg"
                    : "text-fg-secondary hover:bg-surface-card-hover"
                )}
              >
                <svg className="h-4 w-4 shrink-0 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <span className="min-w-0 flex-1 truncate">{idea.title}</span>
              </Link>
            ))}
            {ideas.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-fg-tertiary">
                아직 아이디어가 없습니다.
              </p>
            )}
          </div>
        </div>

        {/* New idea button */}
        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={handleNewIdea}
            disabled={isCreating}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-sm text-fg-secondary transition-colors hover:bg-surface-secondary disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {isCreating ? "생성 중..." : "새 아이디어"}
          </button>
        </div>
      </div>
    </>
  );
}
