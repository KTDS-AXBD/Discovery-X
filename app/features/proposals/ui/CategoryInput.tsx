import { useState, useEffect, useRef, useCallback } from "react";

interface CategoryInputProps {
  defaultValue?: string;
}

export function CategoryInput({ defaultValue }: CategoryInputProps) {
  const [value, setValue] = useState(defaultValue || "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback((query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/proposals/categories?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        const result = data as { categories?: string[] };
        setSuggestions(result.categories || []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        name="category"
        id="category"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          fetchSuggestions(e.target.value);
        }}
        onFocus={() => {
          setOpen(true);
          fetchSuggestions(value);
        }}
        placeholder="예: Physical AI, 헬스케어, 핀테크..."
        autoComplete="off"
        className="w-full rounded-lg border border-line bg-surface-secondary px-3 py-2 text-sm text-fg placeholder:text-fg-tertiary focus:border-line-brand focus:outline-none"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-secondary"
                onClick={() => {
                  setValue(s);
                  setOpen(false);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
