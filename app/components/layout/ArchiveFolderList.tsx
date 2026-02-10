import { useState } from "react";
import { cn } from "~/lib/utils/cn";

interface Folder {
  id: string;
  name: string;
  count: number;
}

const DEFAULT_FOLDERS: Folder[] = [
  { id: "starred", name: "중요", count: 0 },
  { id: "research", name: "리서치", count: 0 },
  { id: "archive", name: "완료", count: 0 },
];

export function ArchiveFolderList() {
  const [expanded, setExpanded] = useState(false);
  const folders = DEFAULT_FOLDERS;

  return (
    <div className="px-3 pt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)]"
      >
        <span>보관함</span>
        <svg
          className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-1 space-y-0.5">
          {folders.map((folder) => (
            <button
              key={folder.id}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]"
            >
              <svg className="h-3.5 w-3.5 shrink-0 text-[var(--axis-text-tertiary)]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              <span className="flex-1 truncate text-left">{folder.name}</span>
              {folder.count > 0 && (
                <span className="text-[10px] text-[var(--axis-text-tertiary)]">{folder.count}</span>
              )}
            </button>
          ))}
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-secondary)]">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>폴더 추가</span>
          </button>
        </div>
      )}
    </div>
  );
}
