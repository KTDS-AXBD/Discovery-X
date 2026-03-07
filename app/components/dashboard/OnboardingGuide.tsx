import { Link } from "@remix-run/react";
import { useState } from "react";
import { Card, CardContent } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import { Progress } from "~/components/ui/Progress";
import { cn } from "~/lib/utils/cn";
import type { OnboardingState } from "~/features/dashboard/service/dashboard.service";

const STEPS = [
  {
    title: "관찰을 기록하세요",
    desc: "왜 지금 이것이 중요한가요? 어떤 맥락에서 발견했나요?",
    action: "첫 번째 Discovery 만들기",
    getHref: () => "/discoveries/new",
  },
  {
    title: "실험을 설계하세요",
    desc: "가설, 최소 행동, 마감일을 정의합니다.",
    action: "실험 등록하기",
    getHref: (id?: string | null) => (id ? `/discoveries/${id}` : "/dashboard"),
  },
  {
    title: "근거를 수집하세요",
    desc: "데이터, 피드백, 참조 자료를 기록합니다.",
    action: "근거 추가하기",
    getHref: (id?: string | null) => (id ? `/discoveries/${id}` : "/dashboard"),
  },
  {
    title: "결정하세요",
    desc: "NEXT / NOT NOW / DEAD END 중 하나를 선택합니다. 결정 전 Reviewer를 지정하세요.",
    action: "결정하기",
    getHref: (id?: string | null) => (id ? `/discoveries/${id}` : "/dashboard"),
  },
] as const;

const STEP_LABELS = ["관찰", "실험", "근거", "결정"] as const;

interface OnboardingGuideProps {
  state: OnboardingState;
}

export function OnboardingGuide({ state }: OnboardingGuideProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("dx-onboarding-dismissed") === "true";
  });

  // Step 4 = 완료, 축하 배너만 표시
  if (state.step === 4) {
    if (dismissed) return null;
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-300">
        <div className="flex items-center justify-between">
          <span>첫 번째 Discovery 사이클을 완료했습니다!</span>
          <button
            type="button"
            onClick={() => {
              localStorage.setItem("dx-onboarding-dismissed", "true");
              setDismissed(true);
            }}
            className="ml-4 text-xs text-green-600 underline hover:no-underline dark:text-green-400"
          >
            닫기
          </button>
        </div>
      </div>
    );
  }

  const currentStep = state.step;
  const progressPercent = (currentStep / 4) * 100;
  const stepDef = STEPS[currentStep];

  return (
    <Card>
      <CardContent className="p-5">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-base font-semibold text-fg">Discovery-X 시작하기</h2>
          <p className="mt-0.5 text-xs text-fg-tertiary">관찰 → 실험 → 근거 → 결정</p>
        </div>

        {/* Progress bar */}
        <div className="mb-5">
          <Progress value={progressPercent} className="h-1.5" />
          <p className="mt-1 text-right text-[11px] text-fg-tertiary">{progressPercent}%</p>
        </div>

        {/* Step indicators */}
        <div className="mb-5 flex gap-2">
          {STEP_LABELS.map((label, i) => {
            const isDone = i < currentStep;
            const isActive = i === currentStep;
            return (
              <div key={label} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                    isDone && "bg-green-500 text-white",
                    isActive && "bg-surface-brand text-fg-brand",
                    !isDone && !isActive && "bg-surface-secondary text-fg-tertiary",
                  )}
                >
                  {isDone ? "✓" : i + 1}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    isActive ? "font-medium text-fg" : "text-fg-tertiary",
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Current step card */}
        <div className="rounded-lg border border-line-subtle bg-surface-secondary/50 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  Step {currentStep + 1}
                </Badge>
                <h3 className="text-sm font-medium text-fg">{stepDef.title}</h3>
              </div>
              <p className="mt-1.5 text-xs text-fg-secondary">{stepDef.desc}</p>
            </div>
          </div>

          <div className="mt-4">
            <Button asChild size="sm">
              <Link to={stepDef.getHref(state.firstDiscoveryId)}>
                {stepDef.action} →
              </Link>
            </Button>
          </div>
        </div>

        {/* Bottom hint */}
        <p className="mt-4 text-center text-[11px] text-fg-tertiary italic">
          "Discovery-X는 정답을 찾지 않습니다. 대신, 언제까지 무엇을 해보면 되겠는지를 남깁니다."
        </p>
      </CardContent>
    </Card>
  );
}
