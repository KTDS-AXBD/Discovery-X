import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Card, CardContent } from "~/components/ui/Card";

interface Recommendation {
  id: string;
  nameKo: string;
  tier: string;
  category: string;
  quickRun: boolean;
  timebox: string | null;
  whenToUse: string | null;
  alreadyRunning: boolean;
  reason: string;
}

interface MethodRecommenderProps {
  recommendations: Recommendation[];
  onStart?: (methodPackId: string) => void;
}

export function MethodRecommender({
  recommendations,
  onStart,
}: MethodRecommenderProps) {
  if (recommendations.length === 0) {
    return (
      <p className="text-sm text-[var(--axis-text-tertiary)]">
        현재 단계에 적합한 방법론이 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {recommendations.map((rec, idx) => (
        <Card
          key={rec.id}
          className="overflow-hidden"
          style={{
            opacity: 0,
            animation: "dx-fade-in-up 0.3s ease-out forwards",
            animationDelay: `${idx * 80}ms`,
          }}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--axis-text-tertiary)]">
                    {rec.id}
                  </span>
                  <Badge
                    variant={
                      rec.tier === "Tier-0"
                        ? "destructive"
                        : rec.tier === "Tier-1"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {rec.tier}
                  </Badge>
                  {rec.quickRun && <Badge variant="success">2h</Badge>}
                </div>
                <h4 className="mt-1 text-sm font-semibold text-[var(--axis-text-primary)]">
                  {rec.nameKo}
                </h4>
                <p className="mt-0.5 text-xs text-[var(--axis-text-tertiary)]">
                  {rec.reason}
                </p>
              </div>

              <div className="flex-shrink-0">
                {rec.alreadyRunning ? (
                  <Badge variant="warning">실행 중</Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onStart?.(rec.id)}
                  >
                    실행
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
