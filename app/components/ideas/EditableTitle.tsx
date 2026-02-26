import { useState, useRef, useEffect, useCallback } from "react";

interface EditableTitleProps {
  ideaId: string;
  initialTitle: string;
  onTitleUpdated: (newTitle: string) => void;
}

export function EditableTitle({ ideaId, initialTitle, onTitleUpdated }: EditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [savedTitle, setSavedTitle] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(initialTitle);
    setSavedTitle(initialTitle);
  }, [initialTitle]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const saveTitle = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === savedTitle) {
      setTitle(savedTitle);
      setEditing(false);
      return;
    }
    setSavedTitle(trimmed);
    setEditing(false);
    onTitleUpdated(trimmed);

    try {
      const res = await fetch("/api/ideas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ideaId, title: trimmed }),
      });
      if (!res.ok) {
        setTitle(savedTitle);
        setSavedTitle(savedTitle);
      }
    } catch {
      setTitle(savedTitle);
      setSavedTitle(savedTitle);
    }
  }, [title, savedTitle, ideaId, onTitleUpdated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveTitle();
    } else if (e.key === "Escape") {
      setTitle(savedTitle);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={handleKeyDown}
        maxLength={200}
        className="w-full truncate rounded-md border border-line bg-surface px-2 py-1 text-lg font-semibold text-fg outline-none ring-1 ring-fg-brand/30 focus:ring-fg-brand"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex min-w-0 items-center gap-1.5 truncate rounded-md px-2 py-1 text-left text-lg font-semibold text-fg transition-colors hover:bg-surface-secondary"
      title="클릭하여 제목 편집"
    >
      <span className="truncate">{title || "아이디어"}</span>
      <svg className="h-3.5 w-3.5 shrink-0 text-fg-tertiary opacity-0 transition-opacity group-hover:opacity-100" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
      </svg>
    </button>
  );
}
