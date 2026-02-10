import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "@remix-run/react";

interface FilterBarProps {
  totalCount: number;
  filteredCount: number;
}

const STATUS_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: "COLLECTED", label: "수집됨" },
  { value: "SCORED", label: "스코어" },
  { value: "SEEDED", label: "시드" },
] as const;

export function FilterBar({ totalCount, filteredCount }: FilterBarProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const currentScore = searchParams.get("score") ?? "0";
  const currentStatus = searchParams.get("status") ?? "ALL";

  // Debounced search (300ms)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchParams((prev) => {
        if (searchTerm.trim()) {
          prev.set("q", searchTerm.trim());
        } else {
          prev.delete("q");
        }
        return prev;
      });
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[var(--dx-border-subtle,var(--axis-border-default))]">
      {/* Score filter */}
      <select
        value={currentScore}
        onChange={(e) =>
          setSearchParams((prev) => {
            if (e.target.value === "0") prev.delete("score");
            else prev.set("score", e.target.value);
            return prev;
          })
        }
        className="rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] px-2 py-1 text-xs text-[var(--axis-text-primary)] focus:border-[var(--axis-border-brand)] focus:outline-none"
      >
        <option value="0">전체 점수</option>
        <option value="40">40점 이상</option>
        <option value="60">60점 이상</option>
        <option value="80">80점 이상</option>
      </select>

      {/* Status tabs */}
      <div className="flex rounded-md border border-[var(--axis-border-default)] overflow-hidden">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() =>
              setSearchParams((prev) => {
                if (opt.value === "ALL") prev.delete("status");
                else prev.set("status", opt.value);
                return prev;
              })
            }
            className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
              currentStatus === opt.value
                ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-on-brand,#fff)]"
                : "bg-[var(--axis-surface-secondary)] text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-tertiary,var(--axis-surface-secondary))]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Search input */}
      <input
        type="search"
        placeholder="제목/요약 검색..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="flex-1 min-w-[120px] rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] px-2.5 py-1 text-xs text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-border-brand)] focus:outline-none"
      />

      {/* Count */}
      <span className="text-[10px] text-[var(--axis-text-tertiary)] whitespace-nowrap">
        {filteredCount}건{filteredCount !== totalCount && ` / ${totalCount}건`}
      </span>
    </div>
  );
}
