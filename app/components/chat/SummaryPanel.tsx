/**
 * SummaryPanel — 우측 패널: 소스 요약 + 아이디어 후보 + 템플릿 미리보기
 * BD팀 PoC FR-03, FR-07, FR-09
 */
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Card, CardContent } from "~/components/ui/Card";

interface RadarItem {
  id: string;
  title: string;
  titleKo?: string | null;
  summaryKo?: string | null;
  url: string;
  keyPoints?: string[] | null;
}

interface Discovery {
  id: string;
  title: string;
  seedSummary?: string | null;
  status: string;
  targetSegment?: string | null;
  valueProposition?: string | null;
}

interface SummaryPanelProps {
  activeSource: RadarItem | null;
  candidates: Discovery[];
  onSelectCandidate: (id: string) => void;
  selectedIdea: Discovery | null;
  onClose?: () => void;
}

export function SummaryPanel({
  activeSource,
  candidates,
  onSelectCandidate,
  selectedIdea,
  onClose,
}: SummaryPanelProps) {
  return (
    <div className="flex h-full flex-col border-l border-[var(--axis-border-default)] bg-[var(--dx-surface-panel,var(--axis-surface-default))]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--axis-border-default)] px-3 py-2">
        <span className="text-xs font-medium text-[var(--axis-text-secondary)]">요약</span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)] text-xs"
          >
            닫기
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Source Summary */}
        {activeSource && (
          <div>
            <h4 className="text-xs font-semibold text-[var(--axis-text-secondary)] mb-2">
              소스 요약
            </h4>
            <Card>
              <CardContent className="p-3">
                <p className="text-sm font-medium text-[var(--axis-text-primary)] mb-1">
                  {activeSource.titleKo || activeSource.title}
                </p>
                {activeSource.summaryKo && (
                  <p className="text-xs text-[var(--axis-text-secondary)] mb-2">
                    {activeSource.summaryKo}
                  </p>
                )}
                {activeSource.keyPoints && activeSource.keyPoints.length > 0 && (
                  <ul className="space-y-1">
                    {activeSource.keyPoints.map((point, i) => (
                      <li
                        key={i}
                        className="text-xs text-[var(--axis-text-secondary)] flex items-start gap-1"
                      >
                        <span className="text-[var(--axis-text-brand)] shrink-0">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                )}
                <a
                  href={activeSource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block text-xs text-[var(--axis-text-brand)] hover:underline truncate"
                >
                  원문 링크
                </a>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Idea Candidates */}
        {candidates.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-[var(--axis-text-secondary)] mb-2">
              아이디어 후보
            </h4>
            <div className="space-y-2">
              {candidates.map((c) => (
                <Card key={c.id} className="cursor-pointer hover:border-[var(--axis-text-brand)]">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--axis-text-primary)] line-clamp-2">
                          {c.title}
                        </p>
                        {c.seedSummary && (
                          <p className="mt-1 text-xs text-[var(--axis-text-tertiary)] line-clamp-2">
                            {c.seedSummary}
                          </p>
                        )}
                      </div>
                      <Badge variant={c.status === "IDEA_CARD" ? "success" : "secondary"} className="shrink-0 text-[10px]">
                        {c.status}
                      </Badge>
                    </div>
                    {c.status === "DISCOVERY" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full text-xs"
                        onClick={() => onSelectCandidate(c.id)}
                      >
                        선택
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Template Preview */}
        {selectedIdea && (
          <div>
            <h4 className="text-xs font-semibold text-[var(--axis-text-secondary)] mb-2">
              템플릿 미리보기
            </h4>
            <Card>
              <CardContent className="p-3 space-y-2">
                <TemplateField label="가설" value={selectedIdea.seedSummary} />
                <TemplateField label="타겟" value={selectedIdea.targetSegment} />
                <TemplateField label="가치 제안" value={selectedIdea.valueProposition} />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty State */}
        {!activeSource && candidates.length === 0 && !selectedIdea && (
          <div className="flex h-32 items-center justify-center">
            <p className="text-xs text-[var(--axis-text-tertiary)]">
              소스를 선택하거나 아이디어를 생성하면 여기에 표시됩니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <span className="text-[10px] font-medium text-[var(--axis-text-tertiary)]">{label}</span>
      <p className="text-xs text-[var(--axis-text-primary)]">
        {value || <span className="italic text-[var(--axis-text-tertiary)]">미입력</span>}
      </p>
    </div>
  );
}
