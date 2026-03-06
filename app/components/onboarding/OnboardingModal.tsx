import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "~/components/ui/Button";
import { OnboardingStep } from "./OnboardingStep";

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

const TOTAL_STEPS = 3;

/** 각 step이 spotlight할 대상의 data-onboarding 값 */
const STEP_TARGETS = ["ideas", "proposals", "lab"] as const;

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const subscribe = () => () => {};

export function OnboardingModal({ open, onComplete, onSkip }: OnboardingModalProps) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [step, setStep] = useState(1);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // spotlight 대상 요소의 위치를 계산
  useEffect(() => {
    if (!open) return;

    function updateSpotlight() {
      const target = STEP_TARGETS[step - 1];
      const el = document.querySelector(`[data-onboarding="${target}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        setSpotlight({
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        });
      } else {
        setSpotlight(null);
      }
    }

    updateSpotlight();
    window.addEventListener("resize", updateSpotlight);
    window.addEventListener("scroll", updateSpotlight);
    return () => {
      window.removeEventListener("resize", updateSpotlight);
      window.removeEventListener("scroll", updateSpotlight);
    };
  }, [open, step]);

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

  // 키보드: Esc → skip
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSkip();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onSkip]);

  if (!open || !mounted) return null;

  // 카드 위치: spotlight 아래에 배치 (없으면 중앙)
  const cardStyle: React.CSSProperties = spotlight
    ? {
        position: "fixed",
        top: Math.min(spotlight.top + spotlight.height + 12, window.innerHeight - 400),
        left: Math.max(8, Math.min(spotlight.left, window.innerWidth - 480)),
        zIndex: 10001,
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 10001,
      };

  return createPortal(
    <>
      {/* 오버레이 배경 — spotlight 구멍 */}
      <div className="fixed inset-0 z-[10000]" onClick={onSkip}>
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <mask id="spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {spotlight && (
                <rect
                  x={spotlight.left}
                  y={spotlight.top}
                  width={spotlight.width}
                  height={spotlight.height}
                  rx="6"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.55)"
            mask="url(#spotlight-mask)"
          />
        </svg>
      </div>

      {/* spotlight 링 — 대상 요소 주변에 하이라이트 */}
      {spotlight && (
        <div
          className="pointer-events-none fixed z-[10000] rounded-md ring-2 ring-[var(--axis-color-primary)] ring-offset-2"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      )}

      {/* 콘텐츠 카드 */}
      <div
        ref={cardRef}
        className="w-[460px] rounded-xl border border-line bg-surface p-5 shadow-2xl"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-fg">Discovery-X 사용법 가이드</h2>
          <span className="text-xs text-fg-tertiary">
            {step} / {TOTAL_STEPS}
          </span>
        </div>

        {/* Step indicator */}
        <div className="mb-4 flex items-center gap-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i + 1 === step
                  ? "w-8 bg-[var(--axis-color-primary)]"
                  : i + 1 < step
                    ? "w-4 bg-[var(--axis-color-primary)] opacity-50"
                    : "w-4 bg-[var(--axis-border-default)]"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[200px]">
          {step === 1 && <StepIdeas />}
          {step === 2 && <StepProposals />}
          {step === 3 && <StepLab />}
        </div>

        {/* 버튼 */}
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
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
        </div>
      </div>
    </>,
    document.body,
  );
}

// ── Step 1: 아이디어 ──────────────────────────────────────────────────

function StepIdeas() {
  const items = [
    { icon: "📡", title: "소스 수집", desc: "Radar가 시장 신호와 트렌드를 자동 수집해요." },
    { icon: "💡", title: "아이디어 정리", desc: "수집된 소스를 묶어 아이디어 카드로 만들어요." },
    { icon: "🔬", title: "AI 분석", desc: "멀티소스 선택 후 AI가 시장·경쟁·기회를 분석해요." },
    { icon: "📋", title: "사업제안 전환", desc: "분석 결과를 바탕으로 사업제안으로 승격해요." },
  ];

  return (
    <OnboardingStep stepNumber={1} title="아이디어">
      <p className="mb-3">
        시장 신호 수집부터 아이디어 정리, AI 분석, 사업제안 전환까지의 흐름이에요.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
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

// ── Step 2: 사업제안 ──────────────────────────────────────────────────

function StepProposals() {
  const features = [
    { title: "제안서 작성", desc: "아이디어에서 전환하거나 직접 새 사업제안을 작성해요." },
    { title: "마일스톤 관리", desc: "검증 단계별 마일스톤을 설정하고 진행률을 추적해요." },
    { title: "액션 & 댓글", desc: "팀원과 액션 아이템을 공유하고 피드백을 주고받아요." },
    { title: "진행상황 패널", desc: "제안 전체의 진행 현황을 한눈에 파악할 수 있어요." },
  ];

  return (
    <OnboardingStep stepNumber={2} title="사업제안">
      <p className="mb-3">
        검증된 아이디어를 공식 사업제안으로 발전시키고 팀과 함께 관리하는 공간이에요.
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

// ── Step 3: 실험실 ──────────────────────────────────────────────────

function StepLab() {
  const tabs = [
    { title: "요구사항", desc: "팀원들이 기능 요청을 등록하고 AI가 자동 검토해요." },
    { title: "작업 현황", desc: "Discovery 11단계 파이프라인의 진행 상태를 추적해요." },
    { title: "방법론", desc: "12종 Method Pack으로 체계적인 검증 방법을 제공해요." },
  ];

  return (
    <OnboardingStep stepNumber={3} title="실험실">
      <p className="mb-3">
        팀 운영에 필요한 요구사항 관리, 작업 추적, 검증 방법론을 모은 공간이에요.
      </p>
      <div className="space-y-2">
        {tabs.map((t, i) => (
          <div key={t.title} className="flex gap-3 rounded-lg border border-[var(--axis-border-default)] p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--axis-surface-raised)] text-xs font-bold text-[var(--axis-color-primary)]">
              {i + 1}
            </div>
            <div>
              <div className="text-xs font-medium text-[var(--axis-text-primary)]">{t.title}</div>
              <div className="text-xs text-[var(--axis-text-tertiary)]">{t.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--axis-text-tertiary)]">
        실험실에서 팀의 학습 루프를 체계적으로 관리할 수 있어요.
      </p>
    </OnboardingStep>
  );
}
