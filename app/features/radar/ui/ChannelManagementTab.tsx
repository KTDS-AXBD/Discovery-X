import { useState } from "react";
import { useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/Button";
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
import { AddDomainInline } from "./DomainTagSelect";
import { QueueStatusPanel } from "./QueueStatusPanel";
import type { RadarSource, RadarDomain } from "~/features/radar/db/schema";

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

interface SourceWithDomains {
  source: SerializedRadarSource;
  domains: SerializedRadarDomain[];
}

export interface ChannelManagementTabProps {
  sourcesWithDomains: SourceWithDomains[];
  domains: SerializedRadarDomain[];
  tenantId: string;
  isGatekeeper?: boolean;
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

// ============================================================================
// Component
// ============================================================================

export function ChannelManagementTab({
  sourcesWithDomains,
  domains,
  tenantId,
  isGatekeeper = false,
}: ChannelManagementTabProps) {
  // 모달 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [editSource, setEditSource] = useState<SerializedRadarSource | null>(null);
  const [editDomains, setEditDomains] = useState<SerializedRadarDomain[]>([]);

  // 필터 상태
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterDomainId, setFilterDomainId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // 도메인 생성 fetcher
  const domainFetcher = useFetcher();

  // 필터링
  const filtered = sourcesWithDomains.filter(({ source, domains: srcDomains }) => {
    if (filterType !== "all" && source.sourceType !== filterType) return false;
    if (filterStatus !== "all" && source.status !== filterStatus) return false;
    if (filterDomainId !== "all" && !srcDomains.some((d) => d.id === filterDomainId)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!source.name.toLowerCase().includes(q) && !source.url.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const handleEdit = (source: SerializedRadarSource, srcDomains: SerializedRadarDomain[]) => {
    setEditSource(source);
    setEditDomains(srcDomains);
    setModalOpen(true);
  };

  const handleAddNew = () => {
    setEditSource(null);
    setEditDomains([]);
    setModalOpen(true);
  };

  const handleDomainCreate = (name: string) => {
    domainFetcher.submit(
      { intent: "create", name },
      { method: "post", action: "/api/radar/domains" },
    );
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

        {/* 검색 */}
        <Input
          type="text"
          placeholder="채널 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 w-40 text-sm"
        />

        {/* 도메인 인라인 생성 */}
        <AddDomainInline onAdd={handleDomainCreate} />

        {/* 채널 추가 버튼 */}
        <Button size="sm" className="ml-auto" onClick={handleAddNew}>
          + 채널 추가
        </Button>
      </div>

      {/* 채널 목록 */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-fg-tertiary">
            {sourcesWithDomains.length === 0
              ? "등록된 채널이 없어요. 채널을 추가해 보세요."
              : "조건에 맞는 채널이 없어요."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(({ source, domains: srcDomains }) => (
            <ChannelCard
              key={source.id}
              source={source}
              domains={srcDomains}
              onEdit={handleEdit}
            />
          ))}
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
          }
        }}
        editSource={editSource}
        editDomains={editDomains}
        domains={domains}
        tenantId={tenantId}
        onDomainCreate={handleDomainCreate}
      />

      {/* 수집 현황 — gatekeeper+ 전용 [R1] */}
      {isGatekeeper && (
        <QueueStatusPanel tenantId={tenantId} />
      )}
    </div>
  );
}
