/**
 * SourcePanel — 좌측 패널: 소스 탭 + 히스토리 탭 + 연관 소스
 * BD팀 PoC FR-01, FR-02, FR-05
 */
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";

interface RadarItem {
  id: string;
  title: string;
  titleKo?: string | null;
  summaryKo?: string | null;
  url: string;
  relevanceScore?: number | null;
  status?: string;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt?: string | null;
}

interface SimilarSource {
  id: string;
  title: string;
  summaryKo?: string | null;
  score: number;
}

interface SourcePanelProps {
  activeTab: "sources" | "history";
  onTabChange: (tab: "sources" | "history") => void;
  radarItems: RadarItem[];
  statusFilter: "all" | "new" | "viewed" | "archived";
  onStatusFilterChange: (filter: "all" | "new" | "viewed" | "archived") => void;
  onItemClick: (item: RadarItem) => void;
  onStartChat: (item: RadarItem) => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  similarSources: SimilarSource[];
}

const STATUS_FILTERS = [
  { key: "all" as const, label: "전체" },
  { key: "new" as const, label: "New" },
  { key: "viewed" as const, label: "읽음" },
  { key: "archived" as const, label: "보관" },
];

export function SourcePanel({
  activeTab,
  onTabChange,
  radarItems,
  statusFilter,
  onStatusFilterChange,
  onItemClick,
  onStartChat,
  conversations,
  activeConversationId,
  onSelectConversation,
  similarSources,
}: SourcePanelProps) {
  return (
    <div className="flex h-full flex-col border-r border-line">
      {/* Tab Header */}
      <div className="flex border-b border-line">
        <button
          onClick={() => onTabChange("sources")}
          className={`flex-1 px-3 py-2 text-xs font-medium ${
            activeTab === "sources"
              ? "border-b-2 border-fg-brand text-fg-brand"
              : "text-fg-tertiary hover:text-fg-secondary"
          }`}
        >
          소스
        </button>
        <button
          onClick={() => onTabChange("history")}
          className={`flex-1 px-3 py-2 text-xs font-medium ${
            activeTab === "history"
              ? "border-b-2 border-fg-brand text-fg-brand"
              : "text-fg-tertiary hover:text-fg-secondary"
          }`}
        >
          히스토리
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "sources" ? (
          <div>
            {/* Status Filter */}
            <div className="flex gap-1 p-2 border-b border-line">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => onStatusFilterChange(f.key)}
                  className={`px-2 py-1 text-xs rounded ${
                    statusFilter === f.key
                      ? "bg-surface-brand text-fg-on-brand"
                      : "text-fg-tertiary hover:bg-surface-hover"
                  }`}
                >
                  {f.label}
                  {f.key === "new" && radarItems.filter((i) => !i.status || i.status === "new").length > 0 && (
                    <span className="ml-1">
                      ({radarItems.filter((i) => !i.status || i.status === "new").length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Radar Items */}
            <div className="space-y-0">
              {radarItems.length === 0 ? (
                <p className="p-3 text-xs text-fg-tertiary">소스가 없습니다.</p>
              ) : (
                radarItems.map((item) => (
                  <div
                    key={item.id}
                    className="cursor-pointer border-b border-line p-3 hover:bg-surface-hover"
                    onClick={() => onItemClick(item)}
                  >
                    <p className="text-sm font-medium text-fg line-clamp-2">
                      {item.titleKo || item.title}
                    </p>
                    {item.summaryKo && (
                      <p className="mt-1 text-xs text-fg-tertiary line-clamp-1">
                        {item.summaryKo}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2">
                      {item.relevanceScore !== null && item.relevanceScore !== undefined && (
                        <Badge variant={item.relevanceScore >= 60 ? "success" : "secondary"} className="text-[10px]">
                          {item.relevanceScore}점
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-[10px] h-5 px-1.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartChat(item);
                        }}
                      >
                        대화
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-0">
            {conversations.length === 0 ? (
              <p className="p-3 text-xs text-fg-tertiary">대화 기록이 없습니다.</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`cursor-pointer border-b border-line p-3 ${
                    activeConversationId === conv.id
                      ? "bg-surface-secondary"
                      : "hover:bg-surface-hover"
                  }`}
                >
                  <p className="text-sm text-fg line-clamp-1">{conv.title}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Related Sources */}
      {similarSources.length > 0 && (
        <div className="border-t border-line p-2">
          <p className="text-[10px] font-medium text-fg-tertiary mb-1">연관 소스</p>
          {similarSources.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1 py-1 text-xs text-fg-secondary"
            >
              <span className="truncate flex-1">{s.title}</span>
              <Badge variant="secondary" className="text-[10px] shrink-0">{s.score}%</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
