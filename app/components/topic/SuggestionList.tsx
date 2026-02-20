import { useFetcher } from "@remix-run/react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/Button";

interface JsonLdNode {
  "@id": string;
  "@type": string;
  [key: string]: unknown;
}

interface EnrichmentSuggestion {
  nodes?: JsonLdNode[];
  reason: string;
}

interface PendingSuggestion {
  id: number;
  enrichment: EnrichmentSuggestion;
  actorId: string;
  createdAt: string;
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

const typeBadgeColors: Record<string, string> = {
  "dx:Signal": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  "dx:Concept": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  "dx:Trend": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  "dx:Risk": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  "dx:Opportunity": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

function TypeBadge({ type }: { type: string }) {
  const colors = typeBadgeColors[type] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  const label = type.replace("dx:", "");
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${colors}`}>
      {label}
    </span>
  );
}

function NodePreview({ node }: { node: JsonLdNode }) {
  const displayKeys = Object.keys(node).filter(
    (k) => !k.startsWith("@") && k !== "dx:createdAt" && k !== "dx:createdBy",
  );
  return (
    <div className="mt-1 rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] px-3 py-2">
      <div className="flex items-center gap-2">
        <TypeBadge type={node["@type"]} />
        <span className="text-xs text-[var(--axis-text-tertiary)]">
          {node["@id"]}
        </span>
      </div>
      {displayKeys.length > 0 && (
        <dl className="mt-1.5 space-y-0.5">
          {displayKeys.slice(0, 4).map((key) => (
            <div key={key} className="flex gap-2 text-xs">
              <dt className="shrink-0 font-medium text-[var(--axis-text-secondary)]">
                {key.replace("dx:", "")}:
              </dt>
              <dd className="truncate text-[var(--axis-text-primary)]">
                {String(node[key])}
              </dd>
            </div>
          ))}
          {displayKeys.length > 4 && (
            <p className="text-[10px] text-[var(--axis-text-tertiary)]">
              +{displayKeys.length - 4}개 속성
            </p>
          )}
        </dl>
      )}
    </div>
  );
}

export function SuggestionList({ topicId }: { topicId: string }) {
  const listFetcher = useFetcher<{ suggestions: PendingSuggestion[] }>();
  const actionFetcher = useFetcher<{ success?: boolean; error?: string }>();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (listFetcher.state === "idle" && !listFetcher.data) {
      listFetcher.load(`/api/topics/${topicId}/suggestions`);
    }
  }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps

  // action 완료 후 목록 리로드
  useEffect(() => {
    if (actionFetcher.state === "idle" && actionFetcher.data) {
      listFetcher.load(`/api/topics/${topicId}/suggestions`);
    }
  }, [actionFetcher.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions = listFetcher.data?.suggestions ?? [];
  const isActing = actionFetcher.state !== "idle";

  const handleApprove = (suggestionId: number) => {
    actionFetcher.submit(
      JSON.stringify({ action: "approve" }),
      {
        method: "post",
        action: `/api/topics/${topicId}/suggestions/${suggestionId}`,
        encType: "application/json",
      },
    );
    setRejectingId(null);
    setRejectReason("");
  };

  const handleReject = (suggestionId: number) => {
    actionFetcher.submit(
      JSON.stringify({ action: "reject", reason: rejectReason || undefined }),
      {
        method: "post",
        action: `/api/topics/${topicId}/suggestions/${suggestionId}`,
        encType: "application/json",
      },
    );
    setRejectingId(null);
    setRejectReason("");
  };

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-[var(--axis-text-primary)]">
          Agent 제안{" "}
          <span className="font-normal text-[var(--axis-text-tertiary)]">
            ({suggestions.length})
          </span>
        </h3>
        <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
          Agent가 Topic Graph에 추가를 제안한 노드입니다. 승인하면 Graph에 반영됩니다.
        </p>
      </div>

      {listFetcher.state === "loading" && (
        <p className="text-sm text-[var(--axis-text-tertiary)]">
          제안을 불러오는 중...
        </p>
      )}

      {suggestions.length === 0 && listFetcher.state !== "loading" ? (
        <p className="text-sm text-[var(--axis-text-tertiary)]">
          대기 중인 제안이 없습니다
        </p>
      ) : (
        <ul className="space-y-4">
          {suggestions.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-default)] p-4"
            >
              {/* 헤더: agent 정보 + 시간 */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--axis-text-secondary)]">
                  <span className="inline-block rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                    agent
                  </span>
                  <span className="ml-1.5">{s.actorId}</span>
                </span>
                <span className="text-[10px] text-[var(--axis-text-tertiary)]">
                  {formatDate(s.createdAt)}
                </span>
              </div>

              {/* 제안 사유 */}
              <p className="mt-2 text-sm text-[var(--axis-text-primary)]">
                {s.enrichment.reason}
              </p>

              {/* 제안 노드 미리보기 */}
              {s.enrichment.nodes && s.enrichment.nodes.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {s.enrichment.nodes.map((node) => (
                    <NodePreview key={node["@id"]} node={node} />
                  ))}
                </div>
              )}

              {/* 거절 사유 입력 */}
              {rejectingId === s.id && (
                <div className="mt-3">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="거절 사유 (선택)"
                    className="w-full rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] px-3 py-1.5 text-sm text-[var(--axis-text-primary)] outline-none placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-text-brand)]"
                  />
                </div>
              )}

              {/* 액션 버튼 */}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleApprove(s.id)}
                  disabled={isActing}
                >
                  승인
                </Button>
                {rejectingId === s.id ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReject(s.id)}
                      disabled={isActing}
                      className="text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      거절 확인
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason("");
                      }}
                    >
                      취소
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRejectingId(s.id)}
                    disabled={isActing}
                  >
                    거절
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
