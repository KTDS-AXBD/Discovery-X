import { useState } from "react";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import type { RadarDomain } from "~/features/radar/db/schema";

// ============================================================================
// Types
// Loader에서 JSON 직렬화 후 Date가 string이 되므로 직렬화 호환 타입 사용
// ============================================================================

type SerializedRadarDomain = Omit<RadarDomain, "createdAt"> & {
  createdAt: string | Date;
};

interface DomainTagSelectProps {
  domains: SerializedRadarDomain[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** 인라인에서 도메인 신규 생성 요청 */
  onCreateDomain?: (name: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function DomainTagSelect({
  domains,
  selectedIds,
  onChange,
  onCreateDomain,
}: DomainTagSelectProps) {
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const selectedDomains = domains.filter((d) => selectedIds.includes(d.id));
  const availableDomains = domains.filter(
    (d) => !selectedIds.includes(d.id) &&
      d.name.toLowerCase().includes(inputValue.toLowerCase()),
  );

  const handleSelect = (id: string) => {
    onChange([...selectedIds, id]);
    setInputValue("");
    setShowDropdown(false);
  };

  const handleRemove = (id: string) => {
    onChange(selectedIds.filter((sid) => sid !== id));
  };

  const handleCreateNew = () => {
    if (!inputValue.trim()) return;
    onCreateDomain?.(inputValue.trim());
    setInputValue("");
    setShowDropdown(false);
  };

  return (
    <div className="relative">
      {/* 선택된 도메인 뱃지 */}
      {selectedDomains.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {selectedDomains.map((domain) => (
            <Badge key={domain.id} variant="secondary" className="gap-1 pl-2 pr-1 py-0.5 text-xs">
              {domain.color && (
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: domain.color }}
                />
              )}
              {domain.name}
              <button
                type="button"
                className="ml-0.5 opacity-60 hover:opacity-100 text-xs"
                onClick={() => handleRemove(domain.id)}
                aria-label={`${domain.name} 제거`}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* 입력 + 드롭다운 */}
      <div className="relative">
        <Input
          type="text"
          placeholder="도메인 검색 또는 추가..."
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        />

        {showDropdown && (inputValue || availableDomains.length > 0) && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface-card shadow-md">
            {availableDomains.map((domain) => (
              <button
                key={domain.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-surface-card-hover text-left"
                onMouseDown={() => handleSelect(domain.id)}
              >
                {domain.color && (
                  <span
                    className="inline-block w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: domain.color }}
                  />
                )}
                <span>{domain.name}</span>
              </button>
            ))}

            {inputValue && onCreateDomain && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-fg-brand hover:bg-surface-card-hover border-t border-border"
                onMouseDown={handleCreateNew}
              >
                <span>+ &quot;{inputValue}&quot; 도메인 생성</span>
              </button>
            )}

            {availableDomains.length === 0 && !inputValue && (
              <div className="px-3 py-2 text-sm text-fg-tertiary">
                등록된 도메인이 없어요
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-1 text-xs text-fg-tertiary">도메인 분류는 선택사항이에요</p>
    </div>
  );
}

// ============================================================================
// 인라인 도메인 생성 버튼 (필터 바용)
// ============================================================================

interface AddDomainInlineProps {
  onAdd: (name: string) => void;
}

export function AddDomainInline({ onAdd }: AddDomainInlineProps) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  const handleSubmit = () => {
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue("");
    setOpen(false);
  };

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        + 도메인 추가
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="text"
        placeholder="도메인명"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); handleSubmit(); }
          if (e.key === "Escape") setOpen(false);
        }}
        className="w-32 h-8 text-sm"
        autoFocus
      />
      <Button size="sm" onClick={handleSubmit} className="h-8">저장</Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-8">취소</Button>
    </div>
  );
}
