/**
 * IdeaCandidateCards — 후보 카드 3개 (선택 버튼)
 * BD팀 PoC FR-07
 */
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Card, CardContent } from "~/components/ui/Card";

interface Candidate {
  id: string;
  title: string;
  seedSummary?: string | null;
  status: string;
}

interface IdeaCandidateCardsProps {
  candidates: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export function IdeaCandidateCards({
  candidates,
  selectedId,
  onSelect,
  disabled,
}: IdeaCandidateCardsProps) {
  if (candidates.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-[var(--axis-text-secondary)]">
        아이디어 후보 ({candidates.length}개)
      </p>
      <div className="grid gap-2 grid-cols-1">
        {candidates.map((c, i) => {
          const isSelected = selectedId === c.id;
          const isDropped = c.status === "DROP";

          return (
            <Card
              key={c.id}
              className={`transition-all ${
                isSelected
                  ? "border-[var(--axis-text-brand)] ring-1 ring-[var(--axis-text-brand)]"
                  : isDropped
                    ? "opacity-50"
                    : "hover:border-[var(--axis-text-brand)]"
              }`}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-bold text-[var(--axis-text-brand)]">
                        #{i + 1}
                      </span>
                      <p className="text-sm font-medium text-[var(--axis-text-primary)] line-clamp-1">
                        {c.title}
                      </p>
                    </div>
                    {c.seedSummary && (
                      <p className="text-xs text-[var(--axis-text-tertiary)] line-clamp-2">
                        {c.seedSummary}
                      </p>
                    )}
                  </div>
                  {isDropped ? (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      미선택
                    </Badge>
                  ) : isSelected ? (
                    <Badge variant="success" className="shrink-0 text-[10px]">
                      선택됨
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-xs h-6 px-2"
                      onClick={() => onSelect(c.id)}
                      disabled={disabled}
                    >
                      선택
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
