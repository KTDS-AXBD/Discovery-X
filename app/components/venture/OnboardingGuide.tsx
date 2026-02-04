/**
 * Venture Sprint 온보딩 가이드 컴포넌트
 * 4단계 안내 + localStorage 완료 추적
 */

import { useState, useSyncExternalStore, useCallback } from "react";
import { Link } from "@remix-run/react";
import { Button } from "~/components/ui/Button";

const STORAGE_KEY = "venture-onboarding-dismissed";

// localStorage 상태를 외부 스토어로 추상화 (SSR-safe)
function useLocalStorageState(key: string, defaultValue: boolean): [boolean, (value: boolean) => void] {
  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return defaultValue;
    return localStorage.getItem(key) === "true";
  }, [key, defaultValue]);

  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);

  const subscribe = useCallback(
    (callback: () => void) => {
      const handleStorage = (e: StorageEvent) => {
        if (e.key === key) callback();
      };
      window.addEventListener("storage", handleStorage);
      return () => window.removeEventListener("storage", handleStorage);
    },
    [key]
  );

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (newValue: boolean) => {
      if (typeof window === "undefined") return;
      if (newValue) {
        localStorage.setItem(key, "true");
      } else {
        localStorage.removeItem(key);
      }
      // 같은 탭에서의 변경 알림
      window.dispatchEvent(new StorageEvent("storage", { key }));
    },
    [key]
  );

  return [value, setValue];
}

// 마운트 상태 (SSR-safe)
function useMounted(): boolean {
  const getSnapshot = () => true;
  const getServerSnapshot = () => false;
  const subscribe = useCallback((callback: () => void) => {
    // 마운트 시 한 번만 호출
    callback();
    return () => {};
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

interface OnboardingStep {
  id: string;
  number: number;
  title: string;
  description: string;
  details: string[];
  actionLabel: string;
  actionLink: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "create-sprint",
    number: 1,
    title: "스프린트 생성",
    description: "탐색할 주제와 목표를 정의합니다.",
    details: [
      "스프린트 이름과 설명을 입력하세요",
      "탐색 기간(1-4주)을 설정하세요",
      "명확한 가설이 있다면 함께 작성하세요",
    ],
    actionLabel: "새 스프린트 만들기",
    actionLink: "/venture/sprints/new",
  },
  {
    id: "define-scope",
    number: 2,
    title: "Scope 정의",
    description: "탐색 범위를 구체적으로 설정합니다.",
    details: [
      "도메인(산업/분야)을 선택하세요",
      "핵심 키워드를 추가하세요 (3-5개 권장)",
      "제외할 키워드가 있다면 설정하세요",
    ],
    actionLabel: "Scope 설정 방법 보기",
    actionLink: "/docs?section=venture-scope",
  },
  {
    id: "collect-signals",
    number: 3,
    title: "Signal 수집 시작",
    description: "AI Agent가 관련 정보를 자동으로 수집합니다.",
    details: [
      "스프린트를 RUNNING 상태로 전환하세요",
      "AI가 설정된 Scope 기반으로 Signal을 수집합니다",
      "Signal 목록에서 관심 있는 항목을 즐겨찾기하세요",
    ],
    actionLabel: "Signal 수집 이해하기",
    actionLink: "/docs?section=venture-signals",
  },
  {
    id: "use-agent",
    number: 4,
    title: "AI Agent 활용",
    description: "채팅 인터페이스에서 AI와 협업합니다.",
    details: [
      "Signal 분석을 요청하세요",
      "추가 탐색 방향을 제안받으세요",
      "Gate 결정 시 AI의 평가를 참고하세요",
    ],
    actionLabel: "Agent 가이드 보기",
    actionLink: "/docs?section=venture-agent",
  },
];

interface OnboardingGuideProps {
  /** 항상 표시 (dismiss 버튼 숨김) */
  alwaysShow?: boolean;
  /** 외부에서 visible 제어 */
  visible?: boolean;
  /** 닫기 콜백 */
  onDismiss?: () => void;
}

export function OnboardingGuide({
  alwaysShow = false,
  visible,
  onDismiss,
}: OnboardingGuideProps) {
  // useSyncExternalStore로 SSR-safe localStorage 상태 관리
  const [isDismissed, setIsDismissed] = useLocalStorageState(STORAGE_KEY, false);
  const [expandedStep, setExpandedStep] = useState<string | null>("create-sprint");
  const mounted = useMounted();

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  // SSR 중에는 렌더링하지 않음
  if (!mounted) return null;

  // 외부 제어 또는 localStorage 기반 표시 여부
  const shouldShow = visible !== undefined ? visible : !isDismissed;
  if (!shouldShow && !alwaysShow) return null;

  return (
    <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
      {/* 헤더 */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-[var(--axis-text-primary)]">
            <svg
              className="h-5 w-5 text-[var(--axis-text-brand)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
              />
            </svg>
            시작 가이드
          </h3>
          <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
            Venture Discovery Sprint를 시작하는 4단계
          </p>
        </div>
        {!alwaysShow && (
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-md p-1 text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]"
            aria-label="가이드 닫기"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* 단계 목록 */}
      <div className="space-y-3">
        {ONBOARDING_STEPS.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            isExpanded={expandedStep === step.id}
            onToggle={() =>
              setExpandedStep(expandedStep === step.id ? null : step.id)
            }
          />
        ))}
      </div>

      {/* 하단 액션 */}
      {!alwaysShow && (
        <div className="mt-6 flex items-center justify-between border-t border-[var(--axis-border-default)] pt-4">
          <button
            type="button"
            onClick={handleDismiss}
            className="text-sm text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-secondary)]"
          >
            다시 보지 않기
          </button>
          <Link to="/venture/sprints/new">
            <Button>시작하기</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function StepCard({
  step,
  isExpanded,
  onToggle,
}: {
  step: OnboardingStep;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-lg border transition-colors ${
        isExpanded
          ? "border-[var(--axis-text-brand)] bg-[var(--axis-surface-brand-subtle)]"
          : "border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)]"
      }`}
    >
      {/* 헤더 (클릭 가능) */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 p-4 text-left"
        aria-expanded={isExpanded}
      >
        {/* 번호 */}
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            isExpanded
              ? "bg-[var(--axis-text-brand)] text-white"
              : "bg-[var(--axis-surface-primary)] text-[var(--axis-text-secondary)]"
          }`}
        >
          {step.number}
        </div>

        {/* 제목/설명 */}
        <div className="flex-1 min-w-0">
          <div
            className={`font-medium ${
              isExpanded
                ? "text-[var(--axis-text-brand)]"
                : "text-[var(--axis-text-primary)]"
            }`}
          >
            {step.title}
          </div>
          <div className="text-sm text-[var(--axis-text-tertiary)] truncate">
            {step.description}
          </div>
        </div>

        {/* 토글 아이콘 */}
        <svg
          className={`h-5 w-5 flex-shrink-0 text-[var(--axis-text-tertiary)] transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {/* 확장된 상세 내용 */}
      {isExpanded && (
        <div className="border-t border-[var(--axis-border-default)] px-4 pb-4 pt-3">
          <ul className="mb-4 space-y-2">
            {step.details.map((detail, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-[var(--axis-text-secondary)]"
              >
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--axis-text-brand)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {detail}
              </li>
            ))}
          </ul>
          <Link
            to={step.actionLink}
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--axis-text-brand)] hover:underline"
          >
            {step.actionLabel}
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * 온보딩 가이드 표시 여부 확인 (서버사이드 사용 불가)
 */
export function isOnboardingDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

/**
 * 온보딩 가이드 표시 상태 리셋
 */
export function resetOnboardingGuide(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
