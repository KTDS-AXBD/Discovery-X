import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/Dialog";
import { Badge } from "~/components/ui/Badge";
import type { MethodPack } from "~/db";

interface MethodPackDetailDialogProps {
  pack: MethodPack | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TIER_COLORS: Record<string, { variant: "destructive" | "warning" | "secondary"; label: string }> = {
  "Tier-0": { variant: "destructive", label: "Tier-0 (필수)" },
  "Tier-1": { variant: "warning", label: "Tier-1 (권장)" },
  "Tier-2": { variant: "secondary", label: "Tier-2 (선택)" },
};

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-fg-tertiary">
        {title}
      </h4>
      <div className="text-sm text-fg">{children}</div>
    </div>
  );
}

export function MethodPackDetailDialog({ pack, open, onOpenChange }: MethodPackDetailDialogProps) {
  if (!pack) return null;

  const tierConfig = TIER_COLORS[pack.tier] || TIER_COLORS["Tier-2"];
  const applicableStages = pack.applicableStages as string[] | null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-fg-tertiary">{pack.id}</p>
              <DialogTitle className="mt-1 text-lg font-bold">{pack.nameKo}</DialogTitle>
            </div>
            <Badge variant={tierConfig.variant}>{tierConfig.label}</Badge>
          </div>
          <DialogDescription className="text-sm text-fg-secondary">
            {pack.category}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Quick Run / Timebox badges */}
          <div className="flex flex-wrap gap-2">
            {pack.quickRun === 1 && <Badge variant="success">2h Quick-Run</Badge>}
            {pack.timebox && (
              <span className="inline-flex items-center rounded-md bg-surface-secondary px-2 py-1 text-xs text-fg-tertiary">
                ⏱ {pack.timebox}
              </span>
            )}
            {pack.evidenceMinimum && (
              <span className="inline-flex items-center rounded-md bg-surface-secondary px-2 py-1 text-xs text-fg-tertiary">
                📋 {pack.evidenceMinimum}
              </span>
            )}
          </div>

          {/* When to Use */}
          {pack.whenToUse && (
            <DetailSection title="사용 시점">
              <p className="leading-relaxed">{pack.whenToUse}</p>
            </DetailSection>
          )}

          {/* Required Inputs */}
          {pack.requiredInputs && (
            <DetailSection title="필요 입력">
              <p className="leading-relaxed">{pack.requiredInputs}</p>
            </DetailSection>
          )}

          {/* Output Artifacts */}
          {pack.outputArtifacts && (
            <DetailSection title="산출물">
              <p className="leading-relaxed">{pack.outputArtifacts}</p>
            </DetailSection>
          )}

          {/* Applicable Stages */}
          {applicableStages && applicableStages.length > 0 && (
            <DetailSection title="적용 가능 단계">
              <div className="flex flex-wrap gap-1.5">
                {applicableStages.map((stage) => (
                  <span
                    key={stage}
                    className="inline-flex items-center rounded-full bg-surface-brand px-2 py-0.5 text-[10px] font-medium text-white"
                  >
                    {stage}
                  </span>
                ))}
              </div>
            </DetailSection>
          )}

          {/* Score Hooks */}
          {pack.scoreHooks && (
            <DetailSection title="점수 영향">
              <p className="leading-relaxed text-fg-secondary">{pack.scoreHooks}</p>
            </DetailSection>
          )}

          {/* Gate Hooks */}
          {pack.gateHooks && (
            <DetailSection title="Gate 연계">
              <p className="leading-relaxed text-fg-secondary">{pack.gateHooks}</p>
            </DetailSection>
          )}

          {/* Template Prompt (Quick-Run only) */}
          {pack.quickRun === 1 && pack.templatePrompt && (
            <DetailSection title="실행 프롬프트 템플릿">
              <div className="rounded-md bg-surface-secondary p-3">
                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-fg-secondary">
                  {pack.templatePrompt}
                </pre>
              </div>
            </DetailSection>
          )}

          {/* Output Schema (Quick-Run only) */}
          {pack.quickRun === 1 && pack.outputSchema && (
            <DetailSection title="출력 스키마">
              <div className="rounded-md bg-surface-secondary p-3">
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-fg-secondary">
                  {JSON.stringify(pack.outputSchema, null, 2)}
                </pre>
              </div>
            </DetailSection>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
