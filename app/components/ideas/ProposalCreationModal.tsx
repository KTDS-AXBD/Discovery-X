import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/Dialog";

interface ProposalCreationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ideaTitle?: string;
}

const PROPOSAL_TABS = [
  "가설",
  "타겟",
  "가치 제안",
  "수익 구조",
  "시나리오",
  "MVP",
  "실행 방안",
] as const;

export function ProposalCreationModal({
  open,
  onOpenChange,
  ideaTitle,
}: ProposalCreationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {ideaTitle || "아이디어"} — 사업 제안
          </DialogTitle>
          <DialogDescription>
            사업 계획서로 생성할 아이디어를 선택해주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4" style={{ minHeight: 400 }}>
          {/* Left: idea candidates */}
          <div className="flex w-64 shrink-0 flex-col rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)]">
            <div className="border-b border-[var(--axis-border-default)] px-4 py-2.5">
              <p className="text-xs font-semibold text-[var(--axis-text-secondary)]">
                생성된 아이디어
              </p>
            </div>
            <div className="flex flex-1 items-center justify-center px-4 py-8 text-center">
              <p className="text-xs text-[var(--axis-text-tertiary)]">
                AI 분석을 먼저 실행하면 아이디어 후보가 표시됩니다.
              </p>
            </div>
          </div>

          {/* Right: selected idea detail tabs */}
          <div className="flex flex-1 flex-col rounded-lg border border-[var(--axis-border-default)]">
            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto border-b border-[var(--axis-border-default)] px-3 scrollbar-none">
              {PROPOSAL_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className="shrink-0 px-2.5 py-2 text-xs text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
                >
                  {tab}
                </button>
              ))}
            </div>
            {/* Content placeholder */}
            <div className="flex flex-1 items-center justify-center px-4 py-8 text-center">
              <p className="text-xs text-[var(--axis-text-tertiary)]">
                왼쪽에서 아이디어를 선택하면 상세 내용이 표시됩니다.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[var(--axis-border-default)] pt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-[var(--axis-border-default)] px-4 py-2 text-sm text-[var(--axis-text-secondary)] transition-colors hover:bg-[var(--axis-surface-secondary)]"
          >
            취소
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--axis-surface-brand)] px-4 py-2 text-sm font-medium text-white opacity-50 cursor-not-allowed"
            disabled
            title="아이디어를 선택해주세요"
          >
            선택 완료
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
