import { useEffect, useRef, useCallback } from "react";
import { PrdEventType } from "~/features/prd-studio/db/schema";

type EventType = (typeof PrdEventType)[keyof typeof PrdEventType];

function trackEvent(
  prdId: string,
  eventType: EventType,
  payload?: Record<string, unknown>,
) {
  fetch(`/api/prd-studio/${prdId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, payload }),
  }).catch(() => {
    // 트래킹 실패는 무시
  });
}

export function useEventTracking(prdId: string) {
  const hasSentStart = useRef(false);

  // interview_start — 마운트 시 1회만 전송
  useEffect(() => {
    if (hasSentStart.current) return;
    hasSentStart.current = true;
    trackEvent(prdId, PrdEventType.INTERVIEW_START);
  }, [prdId]);

  // interview_abandon — 페이지 이탈 시 sendBeacon
  useEffect(() => {
    const handleBeforeUnload = () => {
      const body = JSON.stringify({
        eventType: PrdEventType.INTERVIEW_ABANDON,
      });
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(`/api/prd-studio/${prdId}/events`, blob);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [prdId]);

  const trackSectionComplete = useCallback(
    (sectionType: string, sectionIndex: number) => {
      trackEvent(prdId, PrdEventType.SECTION_COMPLETE, {
        sectionType,
        sectionIndex,
      });
    },
    [prdId],
  );

  const trackPrdGenerated = useCallback(
    (sectionsGenerated: number) => {
      trackEvent(prdId, PrdEventType.PRD_GENERATED, { sectionsGenerated });
    },
    [prdId],
  );

  const trackReviewStart = useCallback(() => {
    trackEvent(prdId, PrdEventType.REVIEW_START);
  }, [prdId]);

  const trackReviewComplete = useCallback(
    (reviewCount: number) => {
      trackEvent(prdId, PrdEventType.REVIEW_COMPLETE, { reviewCount });
    },
    [prdId],
  );

  // F50: Ambiguity Score Events
  const trackAmbiguityEvaluated = useCallback(
    (ambiguityScore: number, clarityPercent: number, gateStatus: string, projectType: string) => {
      trackEvent(prdId, PrdEventType.AMBIGUITY_EVALUATED, {
        ambiguityScore, clarityPercent, gateStatus, projectType,
      });
    },
    [prdId],
  );

  const trackGatePassed = useCallback(
    (clarityPercent: number) => {
      trackEvent(prdId, PrdEventType.GATE_PASSED, { clarityPercent });
    },
    [prdId],
  );

  const trackGateBlocked = useCallback(
    (clarityPercent: number, gateStatus: string) => {
      trackEvent(prdId, PrdEventType.GATE_BLOCKED, { clarityPercent, gateStatus });
    },
    [prdId],
  );

  return {
    trackSectionComplete,
    trackPrdGenerated,
    trackReviewStart,
    trackReviewComplete,
    trackAmbiguityEvaluated,
    trackGatePassed,
    trackGateBlocked,
  };
}
