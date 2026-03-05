import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/Dialog";
import { Button } from "~/components/ui/Button";
import { OnboardingStep } from "./OnboardingStep";

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

const TOTAL_STEPS = 3;

export function OnboardingModal({ open, onComplete, onSkip }: OnboardingModalProps) {
  const [step, setStep] = useState(1);

  const handleNext = useCallback(() => {
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
    } else {
      onComplete();
    }
  }, [step, onComplete]);

  const handlePrev = useCallback(() => {
    if (step > 1) setStep((s) => s - 1);
  }, [step]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onSkip()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Discovery-X 시작 가이드</DialogTitle>
          <DialogDescription>
            핵심 워크플로우를 {TOTAL_STEPS}단계로 안내합니다.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i + 1 === step
                  ? "w-6 bg-[var(--axis-color-primary)]"
                  : i + 1 < step
                    ? "w-2 bg-[var(--axis-color-primary)] opacity-50"
                    : "w-2 bg-[var(--axis-border-default)]"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[240px]">
          {step === 1 && <StepPipeline />}
          {step === 2 && <StepIdeaToProposal />}
          {step === 3 && <StepCollaboration />}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <div>
            {step > 1 ? (
              <Button variant="ghost" size="sm" onClick={handlePrev}>
                이전
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={onSkip}>
                건너뛰기
              </Button>
            )}
          </div>
          <Button size="sm" onClick={handleNext}>
            {step === TOTAL_STEPS ? "시작하기" : "다음"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Step 1: Discovery 파이프라인 ──────────────────────────────────────

function StepPipeline() {
  const stages = [
    { label: "DISCOVERY", desc: "관찰에서 시작" },
    { label: "IDEA_CARD", desc: "아이디어 정리" },
    { label: "HYPOTHESIS", desc: "가설 수립" },
    { label: "EXPERIMENT", desc: "실험 설계/실행" },
    { label: "EVIDENCE", desc: "근거 수집" },
    { label: "GATE 1", desc: "사업제안 판단" },
    { label: "SPRINT", desc: "빠른 검증" },
    { label: "GATE 2", desc: "최종 판단" },
    { label: "HANDOFF", desc: "이관/보류/중단" },
  ];

  return (
    <OnboardingStep stepNumber={1} title="Discovery 파이프라인">
      <p className="mb-3">
        관찰에서 시작해 근거 기반으로 사업 아이디어를 검증하는 11단계 흐름입니다.
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {stages.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1">
            <span className="inline-flex items-center rounded bg-[var(--axis-surface-raised)] px-2 py-1 text-xs font-medium text-[var(--axis-text-primary)]">
              {s.label}
            </span>
            {i < stages.length - 1 && (
              <svg className="h-3 w-3 text-[var(--axis-text-tertiary)]" viewBox="0 0 12 12" fill="none">
                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--axis-text-tertiary)]">
        각 단계마다 명확한 전환 조건이 있으며, 최대 4주 또는 실험 2회의 타임박스가 적용됩니다.
      </p>
    </OnboardingStep>
  );
}

// ── Step 2: 아이디어 → 사업제안 전환 ──────────────────────────────────

function StepIdeaToProposal() {
  const flow = [
    { icon: "💡", title: "아이디어 카드", desc: "자유롭게 아이디어를 메모하고 태그합니다." },
    { icon: "🔬", title: "가설 수립", desc: "검증 가능한 가설로 정제합니다." },
    { icon: "📡", title: "Radar 연동", desc: "시장 신호와 트렌드를 자동으로 수집합니다." },
    { icon: "📋", title: "사업제안 승격", desc: "Gate 통과 후 공식 사업제안으로 전환합니다." },
  ];

  return (
    <OnboardingStep stepNumber={2} title="아이디어에서 사업제안까지">
      <p className="mb-3">
        아이디어를 체계적으로 검증하여 사업제안으로 승격하는 경로입니다.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {flow.map((item) => (
          <div
            key={item.title}
            className="rounded-lg border border-[var(--axis-border-default)] p-3"
          >
            <div className="mb-1 text-lg">{item.icon}</div>
            <div className="text-xs font-medium text-[var(--axis-text-primary)]">
              {item.title}
            </div>
            <div className="text-xs text-[var(--axis-text-tertiary)]">{item.desc}</div>
          </div>
        ))}
      </div>
    </OnboardingStep>
  );
}

// ── Step 3: 팀 협업 / Topic ──────────────────────────────────────────

function StepCollaboration() {
  const features = [
    { title: "Topic 생성", desc: "주제별 워크스페이스를 만들어 Discovery를 그룹핑합니다." },
    { title: "멤버 초대", desc: "Owner / Editor / Viewer 역할로 팀원을 초대합니다." },
    { title: "브리핑 자동 생성", desc: "AI가 Discovery 진행 현황을 자동으로 요약합니다." },
    { title: "팀 지식 베이스", desc: "축적된 근거와 실험 결과를 팀 전체가 활용합니다." },
  ];

  return (
    <OnboardingStep stepNumber={3} title="팀 협업과 Topic">
      <p className="mb-3">
        Topic을 중심으로 팀이 함께 Discovery를 운영합니다.
      </p>
      <div className="space-y-2">
        {features.map((f) => (
          <div key={f.title} className="flex gap-3 rounded-lg border border-[var(--axis-border-default)] p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--axis-surface-raised)] text-xs font-bold text-[var(--axis-color-primary)]">
              {f.title.charAt(0)}
            </div>
            <div>
              <div className="text-xs font-medium text-[var(--axis-text-primary)]">{f.title}</div>
              <div className="text-xs text-[var(--axis-text-tertiary)]">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </OnboardingStep>
  );
}
