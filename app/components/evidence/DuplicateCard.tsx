import { Form } from "@remix-run/react";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Card, CardContent } from "~/components/ui/Card";

interface EvidenceSummary {
  id: string;
  type: string;
  strength: string;
  content: string;
}

interface DuplicateCardProps {
  candidate: {
    id: string;
    similarityScore: number;
    reason: string | null;
  };
  evidence1: EvidenceSummary | null;
  evidence2: EvidenceSummary | null;
  isSubmitting: boolean;
}

export function DuplicateCard({ candidate, evidence1, evidence2, isSubmitting }: DuplicateCardProps) {
  if (!evidence1 || !evidence2) return null;

  const scorePercent = Math.round(candidate.similarityScore * 100);

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {/* Score bar */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--axis-text-tertiary)]">유사도</span>
          <div className="flex items-center gap-2">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-[var(--axis-surface-tertiary)]">
              <div
                className="h-full rounded-full bg-[var(--axis-badge-warning-bg)]"
                style={{ width: `${scorePercent}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-[var(--axis-text-primary)]">{scorePercent}%</span>
          </div>
        </div>

        {candidate.reason && (
          <p className="text-xs text-[var(--axis-text-tertiary)]">{candidate.reason}</p>
        )}

        {/* Side-by-side comparison */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-[var(--axis-border-default)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--axis-text-tertiary)]">{evidence1.type}</span>
              <Badge variant={evidence1.strength === "A" ? "success" : evidence1.strength === "B" ? "info" : "warning"}>
                {evidence1.strength}급
              </Badge>
            </div>
            <p className="text-xs text-[var(--axis-text-secondary)]">{evidence1.content}</p>
          </div>
          <div className="rounded-md border border-[var(--axis-border-default)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--axis-text-tertiary)]">{evidence2.type}</span>
              <Badge variant={evidence2.strength === "A" ? "success" : evidence2.strength === "B" ? "info" : "warning"}>
                {evidence2.strength}급
              </Badge>
            </div>
            <p className="text-xs text-[var(--axis-text-secondary)]">{evidence2.content}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Form method="post">
            <input type="hidden" name="intent" value="review-duplicate" />
            <input type="hidden" name="candidateId" value={candidate.id} />
            <input type="hidden" name="decision" value="ignore" />
            <Button type="submit" variant="secondary" size="sm" disabled={isSubmitting}>
              무시
            </Button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="review-duplicate" />
            <input type="hidden" name="candidateId" value={candidate.id} />
            <input type="hidden" name="decision" value="merge" />
            <input type="hidden" name="mergeTargetId" value={evidence1.id} />
            <Button type="submit" size="sm" disabled={isSubmitting}>
              병합 (좌측 유지)
            </Button>
          </Form>
        </div>
      </CardContent>
    </Card>
  );
}
