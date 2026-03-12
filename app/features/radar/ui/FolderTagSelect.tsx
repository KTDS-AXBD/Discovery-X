import { useState } from "react";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import type { RadarFolder } from "~/features/radar/db/schema";

// ============================================================================
// Types
// Loader에서 JSON 직렬화 후 Date가 string이 되므로 직렬화 호환 타입 사용
// ============================================================================

type SerializedRadarFolder = Omit<RadarFolder, "createdAt"> & {
  createdAt: string | Date;
};

interface FolderTagSelectProps {
  folders: SerializedRadarFolder[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** 인라인에서 폴더 신규 생성 요청 */
  onCreateFolder?: (name: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function FolderTagSelect({
  folders,
  selectedIds,
  onChange,
  onCreateFolder,
}: FolderTagSelectProps) {
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const selectedFolders = folders.filter((f) => selectedIds.includes(f.id));
  const availableFolders = folders.filter(
    (f) => !selectedIds.includes(f.id) &&
      f.name.toLowerCase().includes(inputValue.toLowerCase()),
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
    onCreateFolder?.(inputValue.trim());
    setInputValue("");
    setShowDropdown(false);
  };

  return (
    <div className="relative">
      {/* 선택된 폴더 뱃지 */}
      {selectedFolders.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {selectedFolders.map((folder) => (
            <Badge key={folder.id} variant="secondary" className="gap-1 pl-2 pr-1 py-0.5 text-xs">
              {folder.color && (
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: folder.color }}
                />
              )}
              {folder.name}
              <button
                type="button"
                className="ml-0.5 opacity-60 hover:opacity-100 text-xs"
                onClick={() => handleRemove(folder.id)}
                aria-label={`${folder.name} 제거`}
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
          placeholder="폴더 검색 또는 추가..."
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        />

        {showDropdown && (inputValue || availableFolders.length > 0) && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface-card shadow-md">
            {availableFolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-surface-card-hover text-left"
                onMouseDown={() => handleSelect(folder.id)}
              >
                {folder.color && (
                  <span
                    className="inline-block w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: folder.color }}
                  />
                )}
                <span>{folder.name}</span>
              </button>
            ))}

            {inputValue && onCreateFolder && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-fg-brand hover:bg-surface-card-hover border-t border-border"
                onMouseDown={handleCreateNew}
              >
                <span>+ &quot;{inputValue}&quot; 폴더 생성</span>
              </button>
            )}

            {availableFolders.length === 0 && !inputValue && (
              <div className="px-3 py-2 text-sm text-fg-tertiary">
                등록된 폴더가 없어요
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-1 text-xs text-fg-tertiary">폴더 분류는 선택사항이에요</p>
    </div>
  );
}
