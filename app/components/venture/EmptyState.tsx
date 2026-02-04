/**
 * Venture Sprint 빈 상태 컴포넌트
 * 스프린트가 없을 때 표시되는 UI + CTA
 */

import { Link } from "@remix-run/react";
import { Button } from "~/components/ui/Button";

interface EmptyStateProps {
  onShowGuide?: () => void;
}

export function EmptyState({ onShowGuide }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-6 py-16">
      {/* 아이콘 */}
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--axis-surface-brand-subtle)]">
        <svg
          className="h-8 w-8 text-[var(--axis-text-brand)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
          />
        </svg>
      </div>

      {/* 제목 */}
      <h3 className="mb-2 text-xl font-semibold text-[var(--axis-text-primary)]">
        첫 번째 스프린트를 시작해보세요
      </h3>

      {/* 설명 */}
      <p className="mb-6 max-w-md text-center text-sm text-[var(--axis-text-tertiary)]">
        Venture Discovery Sprint는 AI Agent가 주도하여 새로운 사업 기회를 발굴하고
        검증하는 프로세스입니다. 관심 있는 도메인을 설정하고 자동화된 탐색을 시작하세요.
      </p>

      {/* CTA 버튼 */}
      <div className="flex flex-col items-center gap-3">
        <Link to="/venture/sprints/new">
          <Button size="lg">
            <svg
              className="mr-2 h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            첫 스프린트 시작하기
          </Button>
        </Link>

        {onShowGuide && (
          <button
            type="button"
            onClick={onShowGuide}
            className="text-sm text-[var(--axis-text-brand)] hover:underline"
          >
            시작 가이드 보기
          </button>
        )}
      </div>

      {/* 특징 미리보기 */}
      <div className="mt-10 grid w-full max-w-2xl gap-4 sm:grid-cols-3">
        <FeaturePreview
          icon={
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          }
          title="Scope 정의"
          description="탐색할 도메인과 키워드를 설정"
        />
        <FeaturePreview
          icon={
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
            />
          }
          title="자동 Signal 수집"
          description="AI가 관련 정보를 자동 수집"
        />
        <FeaturePreview
          icon={
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
            />
          }
          title="Gate 결정"
          description="Go/No-Go 기준으로 객관적 평가"
        />
      </div>
    </div>
  );
}

function FeaturePreview({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg bg-[var(--axis-surface-secondary)] p-4 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--axis-surface-primary)]">
        <svg
          className="h-5 w-5 text-[var(--axis-text-secondary)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          {icon}
        </svg>
      </div>
      <div className="text-sm font-medium text-[var(--axis-text-primary)]">
        {title}
      </div>
      <div className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
        {description}
      </div>
    </div>
  );
}
