import { useState, useCallback, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

interface PrdOnboardingModalProps {
  open: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

const TOTAL_STEPS = 3;

const subscribe = () => () => {};

const STEPS = [
  {
    icon: "\u{1F4DD}",
    title: "\uC778\uD130\uBDF0 \uC791\uC131",
    desc: "8\uAC1C \uC139\uC158\uC758 \uC9C8\uBB38\uC5D0 \uB2F5\uBCC0\uD558\uBA74 AI\uAC00 PRD\uB97C \uC0DD\uC131\uD574\uC694.",
    details: [
      "\uAC01 \uC139\uC158\uC5D0 \uC608\uC2DC \uB2F5\uBCC0\uC774 \uC900\uBE44\uB418\uC5B4 \uC788\uC5B4\uC694",
      "\uC911\uAC04\uC5D0 \uC800\uC7A5\uB418\uB2C8 \uD55C\uBC88\uC5D0 \uB2E4 \uC791\uC131\uD558\uC9C0 \uC54A\uC544\uB3C4 \uB3FC\uC694",
      "8\uAC1C \uC139\uC158\uC744 \uBAA8\uB450 \uC644\uB8CC\uD558\uBA74 PRD\uB97C \uC0DD\uC131\uD560 \uC218 \uC788\uC5B4\uC694",
    ],
  },
  {
    icon: "\u{1F916}",
    title: "AI \uAC80\uD1A0",
    desc: "\uC5EC\uB7EC AI \uBAA8\uB378\uC774 PRD\uB97C \uB3D9\uC2DC\uC5D0 \uAC80\uD1A0\uD558\uACE0 \uD53C\uB4DC\uBC31\uC744 \uC918\uC694.",
    details: [
      "\uAC80\uD1A0 \uACB0\uACFC\uB294 \uC2A4\uCF54\uC5B4\uCE74\uB4DC\uC640 \uAC1C\uC120 \uC81C\uC548\uC73C\uB85C \uC81C\uACF5\uB3FC\uC694",
      "\uD53C\uB4DC\uBC31\uC744 \uBC18\uC601\uD558\uC5EC PRD\uB97C \uAC1C\uC120\uD560 \uC218 \uC788\uC5B4\uC694",
      "\uAC80\uD1A0\uB294 \uBA87 \uBD84 \uC815\uB3C4 \uAC78\uB9B4 \uC218 \uC788\uC5B4\uC694",
    ],
  },
  {
    icon: "\u{1F680}",
    title: "\uCC29\uC218 \uD310\uB2E8",
    desc: "\uAC80\uD1A0 \uACB0\uACFC\uB97C \uBC14\uD0D5\uC73C\uB85C \uD504\uB85C\uC81D\uD2B8 \uCC29\uC218 \uC5EC\uBD80\uB97C \uD310\uB2E8\uD574\uC694.",
    details: [
      "READY / CONDITIONAL / NOT READY \uD310\uC815",
      "\uB9CC\uC871\uB3C4 \uD3C9\uAC00\uB97C \uB0A8\uAE30\uBA74 PRD \uD504\uB85C\uC138\uC2A4\uAC00 \uC644\uB8CC\uB3FC\uC694",
      "\uD655\uC815\uB41C PRD\uB294 \uC0AC\uC5C5\uC81C\uC548\uACFC \uC5F0\uACB0\uD560 \uC218 \uC788\uC5B4\uC694",
    ],
  },
] as const;

export function PrdOnboardingModal({ open, onComplete, onSkip }: PrdOnboardingModalProps) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [step, setStep] = useState(0);

  const handleNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
    } else {
      onComplete();
    }
  }, [step, onComplete]);

  const handlePrev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  // Esc -> skip
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSkip();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onSkip]);

  if (!open || !mounted) return null;

  const current = STEPS[step];

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[10000] bg-black/55"
        onClick={onSkip}
      />

      {/* Card */}
      <div
        className="fixed top-1/2 left-1/2 z-[10001] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-fg">PRD Studio \uAC00\uC774\uB4DC</h2>
          <span className="text-xs text-fg-tertiary">
            {step + 1} / {TOTAL_STEPS}
          </span>
        </div>

        {/* Step indicator */}
        <div className="mb-5 flex items-center gap-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? "w-8 bg-[var(--axis-color-primary)]"
                  : i < step
                    ? "w-4 bg-[var(--axis-color-primary)] opacity-50"
                    : "w-4 bg-[var(--axis-border-default)]"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[220px]">
          <div className="mb-3 flex items-center gap-3">
            <span className="text-3xl">{current.icon}</span>
            <h3 className="text-lg font-semibold text-fg">{current.title}</h3>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-fg-secondary">
            {current.desc}
          </p>
          <ul className="space-y-2">
            {current.details.map((detail, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-fg-tertiary"
              >
                <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--axis-color-primary)] opacity-60" />
                {detail}
              </li>
            ))}
          </ul>
        </div>

        {/* Buttons */}
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <div>
            {step > 0 ? (
              <button
                type="button"
                className="text-sm text-fg-tertiary hover:text-fg"
                onClick={handlePrev}
              >
                \uC774\uC804
              </button>
            ) : (
              <button
                type="button"
                className="text-sm text-fg-tertiary hover:text-fg"
                onClick={onSkip}
              >
                \uAC74\uB108\uB6F0\uAE30
              </button>
            )}
          </div>
          <button
            type="button"
            className="rounded-lg bg-btn-bg px-4 py-2 text-sm font-medium text-btn-text hover:bg-btn-bg-hover"
            onClick={handleNext}
          >
            {step === TOTAL_STEPS - 1 ? "\uC2DC\uC791\uD558\uAE30" : "\uB2E4\uC74C"}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
