import { useState, useRef, useCallback, useEffect } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { getDb } from "~/db";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { INTERVIEW_SECTIONS } from "~/features/prd-studio/constants/interview-config";
import { PrdContentView } from "~/features/prd-studio/ui/PrdContentView";
import { ReviewResults } from "~/features/prd-studio/ui/ReviewResults";
import { VersionHistory } from "~/features/prd-studio/ui/VersionHistory";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 상태 배지 */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: "작성 중", cls: "bg-yellow-100 text-yellow-800" },
    GENERATED: { label: "생성됨", cls: "bg-blue-100 text-blue-800" },
    IN_REVIEW: { label: "검토 중", cls: "bg-purple-100 text-purple-800" },
    REVIEWED: { label: "검토 완료", cls: "bg-green-100 text-green-800" },
    FINALIZED: { label: "확정", cls: "bg-emerald-100 text-emerald-800" },
    ARCHIVED: { label: "보관", cls: "bg-gray-100 text-gray-500" },
  };
  const badge = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

/** localStorage 키 */
function localKey(prdId: string, sectionType: string) {
  return `dx-prd-interview-${prdId}-${sectionType}`;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const service = new PrdStudioService(db);
  const prd = await service.getById(params.id!);

  if (!prd) {
    throw new Response("Not Found", { status: 404 });
  }

  const sections = await service.getSections(params.id!);
  const reviews = await service.getReviews(params.id!);
  const versions = await service.listVersions(params.id!);

  return json({ prd, sections, reviews, versions });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PrdStudioInterview() {
  const { prd, sections, reviews, versions } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const generateFetcher = useFetcher();
  const reviewFetcher = useFetcher();

  const isGenerating = generateFetcher.state !== "idle";
  const isReviewing = reviewFetcher.state !== "idle";

  // -- state ---------------------------------------------------------------
  const [currentStep, setCurrentStep] = useState(() => {
    // 첫 미완료 섹션을 찾아서 시작 스텝으로 설정
    const firstIncomplete = INTERVIEW_SECTIONS.findIndex((cfg) => {
      const sec = sections.find((s) => s.type === cfg.type);
      return !sec?.interviewAnswer;
    });
    return firstIncomplete === -1 ? 0 : firstIncomplete;
  });

  // 각 섹션별 답변을 로컬 state로 관리
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const cfg of INTERVIEW_SECTIONS) {
      const sec = sections.find((s) => s.type === cfg.type);
      init[cfg.type] = sec?.interviewAnswer ?? "";
    }
    return init;
  });

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedTypeRef = useRef<string>("");
  const [exampleOpen, setExampleOpen] = useState(false);

  const config = INTERVIEW_SECTIONS[currentStep];
  const currentAnswer = answers[config.type] ?? "";

  // 완료 섹션 수 계산
  const completedCount = INTERVIEW_SECTIONS.filter(
    (cfg) => (answers[cfg.type] ?? "").trim().length > 0,
  ).length;

  // -- localStorage 복원 --------------------------------------------------
  useEffect(() => {
    const pending: Array<{ type: string; answer: string }> = [];
    for (const cfg of INTERVIEW_SECTIONS) {
      const key = localKey(prd.id, cfg.type);
      const cached = localStorage.getItem(key);
      if (cached && !answers[cfg.type]) {
        pending.push({ type: cfg.type, answer: cached });
        setAnswers((prev) => ({ ...prev, [cfg.type]: cached }));
      }
    }
    // 각 캐시를 개별 fetch로 재저장 (useFetcher는 1건만 추적하므로 직접 fetch)
    for (const item of pending) {
      fetch(`/api/prd-studio/${prd.id}/sections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: item.type, answer: item.answer }),
      }).then((res) => {
        if (res.ok) localStorage.removeItem(localKey(prd.id, item.type));
      }).catch(() => { /* localStorage에 유지 — 다음 로드 시 재시도 */ });
    }
    // 마운트 시 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- fetcher state 추적 -------------------------------------------------
  useEffect(() => {
    if (fetcher.state === "submitting") {
      setSaveStatus("saving");
    } else if (fetcher.state === "idle" && fetcher.data) {
      const data = fetcher.data as { ok?: boolean; error?: string };
      if (data.ok) {
        setSaveStatus("saved");
        // 저장 성공 시 localStorage 정리 — 저장 시점의 type을 참조
        if (lastSavedTypeRef.current) {
          localStorage.removeItem(localKey(prd.id, lastSavedTypeRef.current));
        }
      } else {
        setSaveStatus("error");
      }
    }
  }, [fetcher.state, fetcher.data, prd.id]);

  // -- 저장 함수 -----------------------------------------------------------
  const saveAnswer = useCallback(
    (type: string, answer: string) => {
      // localStorage에 임시 저장 (네트워크 실패 대비)
      localStorage.setItem(localKey(prd.id, type), answer);
      lastSavedTypeRef.current = type;
      setSaveStatus("saving");
      fetcher.submit(
        { type, answer },
        { method: "PUT", action: `/api/prd-studio/${prd.id}/sections`, encType: "application/json" },
      );
    },
    [fetcher, prd.id],
  );

  // -- debounced 자동 저장 ------------------------------------------------
  const handleChange = useCallback(
    (value: string) => {
      setAnswers((prev) => ({ ...prev, [config.type]: value }));
      setSaveStatus("idle");

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveAnswer(config.type, value);
      }, 1500);
    },
    [config.type, saveAnswer],
  );

  // cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // -- 네비게이션 ---------------------------------------------------------
  const goToStep = useCallback(
    (step: number) => {
      // 현재 답변 즉시 저장
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const answer = answers[config.type] ?? "";
      if (answer.trim()) {
        saveAnswer(config.type, answer);
      }
      setExampleOpen(false);
      setCurrentStep(step);
      setSaveStatus("idle");
    },
    [answers, config.type, saveAnswer],
  );

  const goPrev = useCallback(() => {
    if (currentStep > 0) goToStep(currentStep - 1);
  }, [currentStep, goToStep]);

  const goNext = useCallback(() => {
    if (currentStep < INTERVIEW_SECTIONS.length - 1) goToStep(currentStep + 1);
  }, [currentStep, goToStep]);

  // -- textarea 자동 높이 조절 -------------------------------------------
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, 144)}px`; // 최소 6줄(~144px)
    }
  }, [currentAnswer, currentStep]);

  // -- 저장 상태 라벨 -----------------------------------------------------
  const saveLabel = (() => {
    switch (saveStatus) {
      case "saving":
        return <span className="text-fg-tertiary text-sm">저장 중...</span>;
      case "saved":
        return <span className="text-green-600 text-sm">저장됨 ✓</span>;
      case "error":
        return <span className="text-red-500 text-sm">저장 실패</span>;
      default:
        return null;
    }
  })();

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold text-fg truncate min-w-0 flex-1">
          {prd.title}
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={prd.status} />
          <span className="text-sm text-fg-tertiary">v{prd.version}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          {INTERVIEW_SECTIONS.map((cfg, i) => {
            const hasAnswer = (answers[cfg.type] ?? "").trim().length > 0;
            const isCurrent = i === currentStep;

            let cls: string;
            if (isCurrent) {
              cls = "ring-2 ring-accent-fg bg-accent-fg text-white";
            } else if (hasAnswer) {
              cls = "bg-green-500 text-white";
            } else {
              cls = "bg-surface-secondary text-fg-tertiary";
            }

            return (
              <button
                key={cfg.type}
                type="button"
                onClick={() => goToStep(i)}
                className={`w-8 h-8 rounded-full text-xs font-medium flex items-center justify-center transition-all cursor-pointer ${cls}`}
                title={cfg.label}
              >
                {hasAnswer && !isCurrent ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </button>
            );
          })}
        </div>
        <span className="text-sm text-fg-tertiary ml-2">
          {completedCount}/{INTERVIEW_SECTIONS.length} 완료
        </span>
      </div>

      {/* Section Content */}
      <div className="rounded-lg border border-border bg-surface p-6 space-y-4">
        {/* Section Header */}
        <div>
          <h2 className="text-lg font-semibold text-fg">{config.label}</h2>
          <p className="mt-1 text-sm text-fg-secondary">{config.description}</p>
        </div>

        {/* Interview Question */}
        <div className="rounded-md bg-surface-secondary p-4">
          <p className="text-sm font-medium text-fg">{config.prompt}</p>
        </div>

        {/* Example (collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setExampleOpen((v) => !v)}
            className="flex items-center gap-1 text-sm text-accent-fg hover:underline cursor-pointer"
          >
            <span className="inline-block transition-transform" style={{ transform: exampleOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
              ▸
            </span>
            예시 답변 보기
          </button>
          {exampleOpen && (
            <div className="mt-2 rounded-md border border-border bg-surface-secondary p-3 text-sm text-fg-secondary whitespace-pre-wrap">
              {config.example}
            </div>
          )}
        </div>

        {/* Textarea */}
        <div className="space-y-1">
          <textarea
            ref={textareaRef}
            value={currentAnswer}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={config.placeholder}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-tertiary focus:outline-none focus:ring-2 focus:ring-accent-fg resize-none"
            style={{ minHeight: "144px" }}
          />
          <div className="flex justify-end min-h-[20px]">
            {saveLabel}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentStep === 0}
          className="rounded-md px-4 py-2 text-sm font-medium bg-surface-secondary hover:bg-surface-secondary/80 text-fg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          이전
        </button>

        {currentStep < INTERVIEW_SECTIONS.length - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="rounded-md px-4 py-2 text-sm font-medium bg-btn-bg text-btn-text hover:bg-btn-bg-hover transition-colors"
          >
            저장 후 다음 →
          </button>
        ) : (
          <div />
        )}
      </div>

      {/* PRD 생성 + AI 검토 버튼 영역 */}
      {completedCount === INTERVIEW_SECTIONS.length && (
        <div className="flex justify-center gap-3 pt-2">
          {prd.status === "DRAFT" && (
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => {
                generateFetcher.submit(
                  {},
                  { method: "POST", action: `/api/prd-studio/${prd.id}/generate` },
                );
              }}
              className="rounded-lg px-6 py-3 text-sm font-medium bg-btn-bg text-btn-text hover:bg-btn-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? "생성 중..." : "✨ PRD 생성하기"}
            </button>
          )}
          {(prd.status === "GENERATED" || prd.status === "REVIEWED") && (
            <button
              type="button"
              disabled={isReviewing}
              onClick={() => {
                reviewFetcher.submit(
                  {},
                  { method: "POST", action: `/api/prd-studio/${prd.id}/review` },
                );
              }}
              className="rounded-lg px-6 py-3 text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isReviewing ? "검토 중..." : "🤖 AI 검토"}
            </button>
          )}
        </div>
      )}

      {/* 생성된 PRD (GENERATED 이상일 때) */}
      {prd.status !== "DRAFT" && sections.some((s: { generatedContent: string | null }) => s.generatedContent) && (
        <div className="border-t border-border pt-6">
          <PrdContentView prdId={prd.id} sections={sections} editable={prd.status !== "DRAFT"} />
        </div>
      )}

      {/* 검토 결과 (reviews 있을 때) */}
      {reviews.length > 0 && (
        <div className="border-t border-border pt-6">
          <ReviewResults reviews={reviews} />
        </div>
      )}

      {/* 버전 기록 */}
      {versions.length > 0 && (
        <div className="border-t border-border pt-6">
          <VersionHistory prdId={prd.id} versions={versions} />
        </div>
      )}

      {/* 생성/검토 결과 메시지 */}
      {(() => {
        const genData = generateFetcher.data as { ok?: boolean; error?: string } | undefined;
        const revData = reviewFetcher.data as { ok?: boolean; error?: string } | undefined;
        return (
          <>
            {genData?.ok && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                PRD가 생성되었어요! 위에서 확인하고 AI 검토를 시작할 수 있어요.
              </div>
            )}
            {genData?.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {genData.error}
              </div>
            )}
            {revData?.ok && (
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-800">
                AI 검토가 완료되었어요! 위에서 결과를 확인하세요.
              </div>
            )}
            {revData?.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {revData.error}
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
