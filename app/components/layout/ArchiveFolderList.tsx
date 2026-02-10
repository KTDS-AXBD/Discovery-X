import { useState, useRef, useEffect } from "react";
import { cn } from "~/lib/utils/cn";

export interface ArchiveFolder {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  itemCount: number;
}

interface ArchiveFolderListProps {
  folders: ArchiveFolder[];
  activeFolderId?: string;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onDropItem: (folderId: string, itemType: string, itemId: string) => void;
  onSelectFolder?: (id: string) => void;
}

export function ArchiveFolderList({
  folders,
  activeFolderId,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDropItem,
  onSelectFolder,
}: ArchiveFolderListProps) {
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) createInputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  const handleCreate = (value: string) => {
    const name = value.trim();
    if (name && name.length <= 20) {
      onCreateFolder(name);
    }
    setCreating(false);
  };

  const handleRename = (id: string, value: string) => {
    const name = value.trim();
    if (name && name.length <= 20) {
      onRenameFolder(id, name);
    }
    setEditingId(null);
  };

  const handleDrop = (folderId: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverId(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      if (data.itemType && data.itemId) {
        onDropItem(folderId, data.itemType, data.itemId);
      }
    } catch {
      /* invalid drag data */
    }
  };

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
            <div key={folder.id}>
              {pendingDeleteId === folder.id ? (
                <div className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-xs">
                  <span className="text-[var(--axis-text-error)]">삭제?</span>
                  <button
                    onClick={() => {
                      onDeleteFolder(folder.id);
                      setPendingDeleteId(null);
                    }}
                    className="rounded bg-[var(--axis-button-destructive-bg-default)] px-1.5 py-0.5 text-[var(--axis-button-destructive-text-default)] hover:bg-[var(--axis-button-destructive-bg-hover)]"
                  >
                    확인
                  </button>
                  <button
                    onClick={() => setPendingDeleteId(null)}
                    className="rounded bg-[var(--axis-surface-secondary)] px-1.5 py-0.5 text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-tertiary)]"
                  >
                    취소
                  </button>
                </div>
              ) : editingId === folder.id ? (
                <input
                  ref={editInputRef}
                  defaultValue={folder.name}
                  maxLength={20}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(folder.id, e.currentTarget.value);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={(e) => handleRename(folder.id, e.currentTarget.value)}
                  className="w-full rounded-md border border-[var(--axis-border-brand)] bg-[var(--axis-surface-default)] px-2 py-1.5 text-sm text-[var(--axis-text-primary)] outline-none"
                />
              ) : (
                <button
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]",
                    activeFolderId === folder.id && "bg-[var(--axis-surface-brand)] text-[var(--axis-text-primary)]",
                    dragOverId === folder.id && "bg-[var(--axis-surface-brand)] ring-1 ring-[var(--axis-border-brand)]",
                  )}
                  onClick={() => onSelectFolder?.(folder.id)}
                  onDoubleClick={() => setEditingId(folder.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverId(folder.id);
                  }}
                  onDragLeave={() => setDragOverId(null)}
                  onDrop={(e) => handleDrop(folder.id, e)}
                >
                  <svg className="h-3.5 w-3.5 shrink-0 text-[var(--axis-text-tertiary)]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                  <span className="flex-1 truncate text-left">{folder.name}</span>
                  {folder.itemCount > 0 && (
                    <span className="text-[10px] text-[var(--axis-text-tertiary)]">{folder.itemCount}</span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteId(folder.id);
                    }}
                    className="ml-auto hidden shrink-0 rounded p-0.5 text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-error)] group-hover:inline"
                    aria-label={`${folder.name} 삭제`}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </button>
              )}
            </div>
          ))}

          {creating ? (
            <input
              ref={createInputRef}
              placeholder="새 폴더 이름..."
              maxLength={20}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate(e.currentTarget.value);
                if (e.key === "Escape") setCreating(false);
              }}
              onBlur={(e) => {
                if (e.currentTarget.value.trim()) {
                  handleCreate(e.currentTarget.value);
                } else {
                  setCreating(false);
                }
              }}
              className="w-full rounded-md border border-[var(--axis-border-brand)] bg-[var(--axis-surface-default)] px-2 py-1.5 text-sm text-[var(--axis-text-primary)] outline-none placeholder:text-[var(--axis-text-tertiary)]"
            />
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-secondary)]"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>폴더 추가</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
