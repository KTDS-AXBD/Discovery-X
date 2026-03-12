import { useState, useMemo, useCallback } from "react";
import { useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "~/components/ui/Select";
import { Input } from "~/components/ui/Input";
import { ChannelCard } from "./ChannelCard";
import { ChannelFormModal } from "./ChannelFormModal";
import { ColorPicker } from "./ColorPicker";
import { AddDomainInline } from "./DomainTagSelect";
import { QueueStatusPanel } from "./QueueStatusPanel";
import type { RadarSource, RadarDomain, RadarFolder } from "~/features/radar/db/schema";

// ============================================================================
// Types
// Loader에서 JSON 직렬화 후 Date가 string이 되므로 직렬화 호환 타입 사용
// ============================================================================

type SerializedRadarSource = Omit<RadarSource, "createdAt" | "updatedAt" | "lastCollectedAt"> & {
  createdAt: string | Date;
  updatedAt: string | Date;
  lastCollectedAt: string | Date | null;
};

type SerializedRadarDomain = Omit<RadarDomain, "createdAt"> & {
  createdAt: string | Date;
};

type SerializedRadarFolder = Omit<RadarFolder, "createdAt"> & {
  createdAt: string | Date;
};

interface SourceWithDomains {
  source: SerializedRadarSource;
  domains: SerializedRadarDomain[];
  folders?: SerializedRadarFolder[];
}

export interface ChannelManagementTabProps {
  sourcesWithDomains: SourceWithDomains[];
  domains: SerializedRadarDomain[];
  folders?: SerializedRadarFolder[];
  tenantId: string;
  isGatekeeper?: boolean;
}

// ============================================================================
// 인라인 생성 컴포넌트 (폴더용)
// ============================================================================

function AddInline({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onAdd(trimmed);
      setValue("");
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-32 text-sm"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") { setOpen(false); setValue(""); }
        }}
      />
      <Button size="sm" onClick={handleSubmit} disabled={!value.trim()}>확인</Button>
      <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setValue(""); }}>취소</Button>
    </div>
  );
}

// ============================================================================
// 인라인 생성 컴포넌트 (폴더용 + 색상)
// ============================================================================

function AddFolderInline({ onAdd }: { onAdd: (name: string, color?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [color, setColor] = useState("");

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onAdd(trimmed, color || undefined);
      setValue("");
      setColor("");
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        + 폴더
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="폴더 이름"
        className="h-8 w-28 text-sm"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") { setOpen(false); setValue(""); setColor(""); }
        }}
      />
      <ColorPicker value={color} onChange={setColor} />
      <Button size="sm" onClick={handleSubmit} disabled={!value.trim()}>확인</Button>
      <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setValue(""); setColor(""); }}>취소</Button>
    </div>
  );
}

// ============================================================================
// 필터 유형
// ============================================================================

type FilterType = "all" | "rss" | "site" | "youtube" | "sns";
type FilterStatus = "all" | "ACTIVE" | "PAUSED" | "REVIEW" | "FAILED" | "ARCHIVED";

const SOURCE_TYPE_LABELS: Record<string, string> = {
  all: "전체 유형",
  rss: "RSS",
  site: "사이트",
  youtube: "YouTube",
  sns: "SNS",
};

const STATUS_LABELS: Record<string, string> = {
  all: "전체 상태",
  ACTIVE: "활성",
  PAUSED: "일시정지",
  REVIEW: "검토 필요",
  FAILED: "실패",
  ARCHIVED: "보관됨",
};

type GroupBy = "domain" | "folder" | "type" | "none";

const GROUP_BY_LABELS: Record<GroupBy, string> = {
  domain: "도메인별",
  folder: "폴더별",
  type: "유형별",
  none: "그룹 없음",
};

interface ChannelGroup {
  key: string;
  label: string;
  color?: string;
  items: SourceWithDomains[];
}

// ============================================================================
// Component
// ============================================================================

export function ChannelManagementTab({
  sourcesWithDomains,
  domains,
  folders = [],
  tenantId,
  isGatekeeper = false,
}: ChannelManagementTabProps) {
  // 모달 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [editSource, setEditSource] = useState<SerializedRadarSource | null>(null);
  const [editDomains, setEditDomains] = useState<SerializedRadarDomain[]>([]);
  const [editFolders, setEditFolders] = useState<SerializedRadarFolder[]>([]);

  // 폴더 편집 인라인 상태
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [editFolderColor, setEditFolderColor] = useState("");

  // 필터 상태
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterDomainId, setFilterDomainId] = useState<string>("all");
  const [filterFolderId, setFilterFolderId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // 그룹핑 상태
  const [groupBy, setGroupBy] = useState<GroupBy>("domain");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // 도메인/폴더 생성 fetcher
  const domainFetcher = useFetcher();
  const folderFetcher = useFetcher();

  // 필터링
  const filtered = sourcesWithDomains.filter((item) => {
    const { source, domains: srcDomains } = item;
    if (filterType !== "all" && source.sourceType !== filterType) return false;
    if (filterStatus !== "all" && source.status !== filterStatus) return false;
    if (filterDomainId !== "all" && !srcDomains.some((d) => d.id === filterDomainId)) return false;
    if (filterFolderId !== "all" && !(item.folders ?? []).some((f: SerializedRadarFolder) => f.id === filterFolderId)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!source.name.toLowerCase().includes(q) && !source.url.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // 그룹핑
  const groups = useMemo((): ChannelGroup[] => {
    if (groupBy === "none") {
      return [{ key: "all", label: `전체 (${filtered.length})`, items: filtered }];
    }

    const map = new Map<string, ChannelGroup>();

    for (const item of filtered) {
      if (groupBy === "domain") {
        if (item.domains.length === 0) {
          const g = map.get("__uncategorized") ?? { key: "__uncategorized", label: "미분류", items: [] };
          g.items.push(item);
          map.set("__uncategorized", g);
        } else {
          for (const d of item.domains) {
            const g = map.get(d.id) ?? { key: d.id, label: d.name, color: d.color ?? undefined, items: [] };
            g.items.push(item);
            map.set(d.id, g);
          }
        }
      } else if (groupBy === "folder") {
        const itemFolders = item.folders ?? [];
        if (itemFolders.length === 0) {
          const g = map.get("__uncategorized") ?? { key: "__uncategorized", label: "미분류", items: [] };
          g.items.push(item);
          map.set("__uncategorized", g);
        } else {
          for (const f of itemFolders) {
            const g = map.get(f.id) ?? { key: f.id, label: f.name, color: f.color ?? undefined, items: [] };
            g.items.push(item);
            map.set(f.id, g);
          }
        }
      } else {
        // type 그룹핑
        const typeKey = item.source.sourceType ?? "unknown";
        const label = SOURCE_TYPE_LABELS[typeKey] ?? typeKey;
        const g = map.get(typeKey) ?? { key: typeKey, label, items: [] };
        g.items.push(item);
        map.set(typeKey, g);
      }
    }

    // 정렬: 미분류는 맨 뒤, 나머지는 항목 수 내림차순
    return [...map.values()].sort((a, b) => {
      if (a.key === "__uncategorized") return 1;
      if (b.key === "__uncategorized") return -1;
      return b.items.length - a.items.length;
    });
  }, [filtered, groupBy]);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleEdit = (source: SerializedRadarSource, srcDomains: SerializedRadarDomain[]) => {
    setEditSource(source);
    setEditDomains(srcDomains);
    const srcFolders = sourcesWithDomains.find(s => s.source.id === source.id)?.folders ?? [];
    setEditFolders(srcFolders);
    setModalOpen(true);
  };

  const handleAddNew = () => {
    setEditSource(null);
    setEditDomains([]);
    setEditFolders([]);
    setModalOpen(true);
  };

  const handleDomainCreate = (name: string) => {
    domainFetcher.submit(
      { intent: "create", name },
      { method: "post", action: "/api/radar/domains" },
    );
  };

  const handleFolderCreate = (name: string) => {
    folderFetcher.submit(
      { intent: "create", name },
      { method: "post", action: "/api/radar/folders" },
    );
  };

  const handleFolderDelete = (id: string) => {
    if (!confirm("이 폴더를 삭제하시겠습니까? 채널은 삭제되지 않아요.")) return;
    folderFetcher.submit(
      { intent: "delete", id },
      { method: "post", action: "/api/radar/folders" },
    );
  };

  const handleFolderUpdate = (id: string) => {
    const data: Record<string, string> = { intent: "update", id };
    if (editFolderName) data.name = editFolderName;
    if (editFolderColor) data.color = editFolderColor;
    folderFetcher.submit(data, { method: "post", action: "/api/radar/folders" });
    setEditingFolderId(null);
  };

  const handleFolderReorder = (folderId: string, direction: "up" | "down") => {
    const sorted = [...(folders ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const idx = sorted.findIndex((f) => f.id === folderId);
    if (direction === "up" && idx <= 0) return;
    if (direction === "down" && idx >= sorted.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
    folderFetcher.submit(
      { intent: "reorder", orderedIds: JSON.stringify(sorted.map((f) => f.id)) },
      { method: "post", action: "/api/radar/folders" },
    );
  };

  const handleFolderCreateWithColor = (name: string, color?: string) => {
    const data: Record<string, string> = { intent: "create", name };
    if (color) data.color = color;
    folderFetcher.submit(data, { method: "post", action: "/api/radar/folders" });
  };

  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 유형 필터 */}
        <Select
          value={filterType}
          onValueChange={(v) => setFilterType(v as FilterType)}
        >
          <SelectTrigger className="w-32 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SOURCE_TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 상태 필터 */}
        <Select
          value={filterStatus}
          onValueChange={(v) => setFilterStatus(v as FilterStatus)}
        >
          <SelectTrigger className="w-32 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 도메인 필터 */}
        {domains.length > 0 && (
          <Select
            value={filterDomainId}
            onValueChange={setFilterDomainId}
          >
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="전체 도메인" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 도메인</SelectItem>
              {domains.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* 폴더 필터 */}
        {(folders ?? []).length > 0 && (
          <Select value={filterFolderId} onValueChange={setFilterFolderId}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="전체 폴더" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 폴더</SelectItem>
              {(folders ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* 검색 */}
        <Input
          type="text"
          placeholder="채널 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 w-40 text-sm"
        />

        {/* 그룹핑 선택 */}
        <Select
          value={groupBy}
          onValueChange={(v) => setGroupBy(v as GroupBy)}
        >
          <SelectTrigger className="w-32 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(GROUP_BY_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 도메인/폴더 인라인 생성 */}
        <AddDomainInline onAdd={handleDomainCreate} />
        <AddFolderInline onAdd={handleFolderCreateWithColor} />

        {/* 채널 추가 버튼 */}
        <Button size="sm" className="ml-auto" onClick={handleAddNew}>
          + 채널 추가
        </Button>
      </div>

      {/* 채널 목록 (그룹별 접이식) */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-fg-tertiary">
            {sourcesWithDomains.length === 0
              ? "등록된 채널이 없어요. 채널을 추가해 보세요."
              : "조건에 맞는 채널이 없어요."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.key);
            return (
              <div key={group.key} className="rounded-lg border border-line">
                {/* 그룹 헤더 */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-secondary"
                >
                  <svg
                    className={`h-4 w-4 shrink-0 text-fg-tertiary transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  {group.color && (
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: group.color }}
                    />
                  )}
                  <span className="text-sm font-semibold text-fg">{group.label}</span>
                  <Badge variant="secondary" className="text-xs">
                    {group.items.length}
                  </Badge>
                  {/* 폴더 편집/순서/삭제 버튼 (폴더 그룹핑 시, 미분류 제외) */}
                  {groupBy === "folder" && group.key !== "__uncategorized" && (
                    <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {editingFolderId === group.key ? (
                        <>
                          <Input
                            value={editFolderName}
                            onChange={(e) => setEditFolderName(e.target.value)}
                            className="h-6 w-24 text-xs"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleFolderUpdate(group.key);
                              if (e.key === "Escape") setEditingFolderId(null);
                            }}
                            autoFocus
                          />
                          <ColorPicker value={editFolderColor} onChange={setEditFolderColor} />
                          <button type="button" onClick={() => handleFolderUpdate(group.key)}
                            className="text-fg-brand hover:text-fg text-xs px-1">✓</button>
                          <button type="button" onClick={() => setEditingFolderId(null)}
                            className="text-fg-tertiary hover:text-fg text-xs px-1">✕</button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => handleFolderReorder(group.key, "up")}
                            className="text-fg-tertiary hover:text-fg transition-colors p-0.5" title="위로">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                            </svg>
                          </button>
                          <button type="button" onClick={() => handleFolderReorder(group.key, "down")}
                            className="text-fg-tertiary hover:text-fg transition-colors p-0.5" title="아래로">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                          </button>
                          <button type="button" onClick={() => {
                            setEditingFolderId(group.key);
                            setEditFolderName(group.label);
                            setEditFolderColor(group.color ?? "");
                          }} className="text-fg-tertiary hover:text-fg transition-colors p-0.5" title="편집">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                            </svg>
                          </button>
                          <button type="button" onClick={() => handleFolderDelete(group.key)}
                            className="text-fg-tertiary hover:text-fg-error transition-colors p-0.5" title="삭제">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </button>

                {/* 그룹 내 채널 카드 */}
                {!isCollapsed && (
                  <div className="space-y-2 px-4 pb-3">
                    {group.items.map(({ source, domains: srcDomains }) => (
                      <ChannelCard
                        key={source.id}
                        source={source}
                        domains={srcDomains}
                        onEdit={handleEdit}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 채널 추가/편집 모달 */}
      <ChannelFormModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setEditSource(null);
            setEditDomains([]);
            setEditFolders([]);
          }
        }}
        editSource={editSource}
        editDomains={editDomains}
        domains={domains}
        tenantId={tenantId}
        onDomainCreate={handleDomainCreate}
        folders={folders}
        editFolders={editFolders}
        onFolderCreate={(name) => handleFolderCreateWithColor(name)}
      />

      {/* 수집 현황 — gatekeeper+ 전용 [R1] */}
      {isGatekeeper && (
        <QueueStatusPanel tenantId={tenantId} />
      )}
    </div>
  );
}
