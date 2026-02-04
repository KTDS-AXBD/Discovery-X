/**
 * Venture Sprint 다음 단계 가이드 컴포넌트
 * 현재 상태/페이지에 따라 다음 해야 할 일을 표시
 */

import { Link } from "@remix-run/react";
import { Button } from "~/components/ui/Button";
import {
  CONTEXT_GUIDE_MESSAGES,
  getGuideMessage,
  getStatusGuideConfig,
  type GuideMessage,
} from "~/features/venture/constants/guide-messages";
import type { VdSprintStatusType } from "~/features/venture/types";

interface NextStepGuideProps {
  /** 스프린트 컨텍스트 (있으면 상태 기반 가이드) */
  sprint?: {
    status: VdSprintStatusType;
    currentDay: number | null;
  };
  /** 컨텍스트 타입 */
  context: "overview" | "new-sprint" | "sprint-detail";
  /** 현재 탭 (sprint-detail인 경우) */
  currentTab?: string;
  /** 기본 경로 (상대 링크용, sprint-detail인 경우 필요) */
  basePath?: string;
}

export function NextStepGuide({
  sprint,
  context,
  currentTab,
  basePath = "",
}: NextStepGuideProps) {
  // 가이드 메시지 결정
  let guide: GuideMessage;
  let title: string | null = null;

  if (context === "sprint-detail" && sprint) {
    // 스프린트 상세: 상태 + 탭 기반
    const config = getStatusGuideConfig(sprint.status);
    title = config.title;
    guide = getGuideMessage(sprint.status, currentTab);
  } else if (context === "overview" || context === "new-sprint") {
    // Overview 또는 새 스프린트 생성
    guide = CONTEXT_GUIDE_MESSAGES[context];
  } else {
    return null;
  }

  // CTA 링크 경로 계산
  const ctaHref =
    guide.cta?.action === "link" && guide.cta.href !== undefined
      ? guide.cta.href.startsWith("/")
        ? guide.cta.href
        : `${basePath}${guide.cta.href ? `/${guide.cta.href}` : ""}`
      : undefined;

  // CTA 클릭 핸들러 (scroll, focus)
  const handleCtaClick = () => {
    if (guide.cta?.action === "scroll") {
      // 페이지 하단으로 스크롤 (범위 선택 등)
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    } else if (guide.cta?.action === "focus") {
      // 첫 번째 입력 필드에 포커스
      const firstInput = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled])'
      );
      if (firstInput) {
        firstInput.focus();
        firstInput.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  return (
    <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-[var(--axis-border-brand)] bg-[var(--axis-surface-brand-subtle)] px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* 아이콘 */}
        <div className="flex-shrink-0">
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
              d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
            />
          </svg>
        </div>

        {/* 메시지 */}
        <div className="min-w-0">
          {title && (
            <span className="text-sm font-semibold text-[var(--axis-text-brand)]">
              {title}:{" "}
            </span>
          )}
          <span className="text-sm text-[var(--axis-text-primary)]">
            {guide.message}
          </span>
        </div>
      </div>

      {/* CTA 버튼 */}
      {guide.cta && (
        <div className="flex-shrink-0">
          {ctaHref ? (
            <Link to={ctaHref}>
              <Button size="sm" variant="secondary">
                {guide.cta.label}
              </Button>
            </Link>
          ) : (
            <Button size="sm" variant="secondary" onClick={handleCtaClick}>
              {guide.cta.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
