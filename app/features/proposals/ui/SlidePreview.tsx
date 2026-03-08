/**
 * SlidePreview — PPT 슬라이드 덱 프리뷰 모달
 * 포맷 선택 → 생성 → 슬라이드 카드 그리드
 */

import { useState, useCallback } from "react";

interface Slide {
  order: number;
  layout: string;
  title: string;
  subtitle?: string;
  bullets?: string[];
  notes?: string;
}

interface SlideDeck {
  id: string;
  format: string;
  title: string;
  slides: Slide[];
  createdAt: string | null;
}

interface SlidePreviewProps {
  proposalId: string;
}

const FORMAT_OPTIONS = [
  { value: "executive", label: "경영진 요약", desc: "핵심만 7장" },
  { value: "pitch", label: "투자/제안 피치", desc: "12장 풀 구성" },
  { value: "internal", label: "내부 검토", desc: "13장+ 상세" },
] as const;

const LAYOUT_LABELS: Record<string, string> = {
  cover: "표지",
  section_header: "구분",
  content: "본문",
  two_column: "수치",
  agenda: "목차",
  key_insight: "핵심",
  closing: "마무리",
};

function SlideCard({ slide }: { slide: Slide & { keyInsight?: string } }) {
  const isCover = slide.layout === "cover";
  const isClosing = slide.layout === "closing";
  const isDark = isCover || isClosing || slide.layout === "section_header";
  const isInsight = slide.layout === "key_insight";
  const isSpecial = isDark;

  return (
    <div
      className={`relative flex aspect-video flex-col overflow-hidden rounded-lg border border-line shadow-sm ${
        isDark
          ? "bg-[#0F172A] text-white"
          : isInsight
            ? "bg-blue-50 text-fg"
            : "bg-surface-card text-fg"
      }`}
    >
      {/* 좌측 악센트 바 */}
      {!isDark && (
        <div className={`absolute left-0 top-0 h-full w-0.5 ${isInsight ? "bg-teal-500" : "bg-blue-600"}`} />
      )}

      {/* Slide number badge */}
      <span className={`absolute right-2 top-2 text-[10px] font-mono ${
        isSpecial ? "text-white/60" : "text-fg-quaternary"
      }`}>
        {slide.order}
      </span>

      {/* Content area */}
      <div className={`flex flex-1 flex-col px-4 ${
        isDark ? "items-center justify-center text-center" : isInsight ? "items-center justify-center text-center" : "justify-center"
      }`}>
        {isInsight && (
          <span className="mb-1 text-[8px] font-bold uppercase tracking-widest text-teal-600">Key Insight</span>
        )}
        <h3 className={`font-bold leading-tight ${
          isDark ? "text-sm" : "text-xs"
        }`}>
          {slide.title}
        </h3>

        {slide.subtitle && (
          <p className={`mt-1 text-[10px] ${
            isDark ? "text-white/70" : isInsight ? "text-teal-700" : "text-blue-600 font-medium"
          }`}>
            {slide.subtitle}
          </p>
        )}

        {isInsight && slide.keyInsight && (
          <p className="mt-1.5 text-[9px] italic leading-snug text-fg-secondary line-clamp-2">
            &ldquo;{slide.keyInsight}&rdquo;
          </p>
        )}

        {slide.bullets && slide.bullets.length > 0 && !isInsight && (
          <ul className="mt-2 space-y-0.5">
            {slide.bullets.slice(0, 5).map((bullet, i) => (
              <li key={i} className="flex items-start gap-1 text-[10px] leading-tight text-fg-secondary">
                <span className={`mt-0.5 h-1 w-1 shrink-0 rounded-full ${isDark ? "bg-blue-400" : "bg-fg-quaternary"}`} />
                <span className="line-clamp-1">{bullet}</span>
              </li>
            ))}
            {slide.bullets.length > 5 && (
              <li className="text-[9px] text-fg-quaternary">+{slide.bullets.length - 5}개 더</li>
            )}
          </ul>
        )}
      </div>

      {/* Layout type label */}
      <div className={`px-3 pb-1.5 text-right text-[8px] ${
        isDark ? "text-white/40" : "text-fg-quaternary"
      }`}>
        {LAYOUT_LABELS[slide.layout] || slide.layout}
      </div>
      {!isDark && <span className="absolute bottom-1 left-2 text-[7px] text-fg-quaternary">Discovery-X</span>}
    </div>
  );
}

export function SlidePreview({ proposalId }: SlidePreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [format, setFormat] = useState<string>("pitch");
  const [loading, setLoading] = useState(false);
  const [deck, setDeck] = useState<SlideDeck | null>(null);
  const [decks, setDecks] = useState<SlideDeck[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function loadDecks() {
    try {
      const res = await fetch(`/api/proposals/${proposalId}/slides`);
      if (res.ok) {
        const data = (await res.json()) as { decks?: SlideDeck[] };
        setDecks(data.decks || []);
      }
    } catch {
      // silent
    }
  }

  function handleOpen() {
    setIsOpen(true);
    setDeck(null);
    setError(null);
    loadDecks();
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/slides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      const data = (await res.json()) as { deck?: SlideDeck; error?: string };
      if (!res.ok) {
        setError(data.error || "생성 실패");
        return;
      }
      const newDeck = data.deck ?? null;
      setDeck(newDeck);
      loadDecks();
      // 생성 후 자동 다운로드
      if (newDeck) {
        handleDownload(newDeck);
      }
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(deckId: string) {
    await fetch(`/api/proposals/${proposalId}/slides?deckId=${deckId}`, {
      method: "DELETE",
    });
    if (deck?.id === deckId) setDeck(null);
    loadDecks();
  }

  const handleDownload = useCallback(async (targetDeck: SlideDeck) => {
    setDownloading(true);
    try {
      const { exportToPptx } = await import("~/features/proposals/ui/export-pptx");
      await exportToPptx(targetDeck.slides, targetDeck.title);
    } catch {
      setError("PPTX 생성 실패");
    } finally {
      setDownloading(false);
    }
  }, []);

  function handleSelectDeck(d: SlideDeck) {
    setDeck(d);
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-fg-secondary hover:bg-surface-secondary"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
        </svg>
        PPT
      </button>
    );
  }

  return (
    <>
      {/* Trigger (active state) */}
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1.5 rounded-lg bg-surface-brand px-3 py-1.5 text-xs font-medium text-white"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
        </svg>
        PPT
      </button>

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setIsOpen(false)}>
        <div
          className="mx-4 flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl bg-surface shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <h2 className="text-sm font-bold text-fg">PPT 슬라이드 생성</h2>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-fg-tertiary hover:bg-surface-secondary"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Format selector + Generate */}
            <div className="mb-6 flex flex-wrap items-end gap-3">
              <div className="flex gap-2">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormat(opt.value)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      format === opt.value
                        ? "border-[var(--axis-border-brand)] bg-surface-brand/5"
                        : "border-line hover:bg-surface-secondary"
                    }`}
                  >
                    <div className="text-xs font-semibold text-fg">{opt.label}</div>
                    <div className="text-[10px] text-fg-tertiary">{opt.desc}</div>
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={handleGenerate}
                className="rounded-lg bg-surface-brand px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "생성 중..." : "생성 + 다운로드"}
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {/* Existing decks */}
            {decks.length > 0 && !deck && (
              <div className="mb-6">
                <h3 className="mb-2 text-xs font-semibold text-fg-secondary">기존 슬라이드 덱</h3>
                <div className="flex flex-wrap gap-2">
                  {decks.map((d) => (
                    <div key={d.id} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => handleSelectDeck(d)}
                        className="text-xs font-medium text-fg hover:underline"
                      >
                        {d.title} ({d.slides.length}장)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(d)}
                        disabled={downloading}
                        className="text-fg-tertiary hover:text-surface-brand"
                        title="PPTX 다운로드"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(d.id)}
                        className="text-fg-quaternary hover:text-red-500"
                        title="삭제"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Slide preview grid */}
            {deck && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-fg">
                    {deck.title} — {deck.slides.length}장
                  </h3>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={downloading}
                      onClick={() => handleDownload(deck)}
                      className="flex items-center gap-1 rounded-lg bg-surface-brand px-3 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      {downloading ? "생성 중..." : "PPTX 다운로드"}
                    </button>
                    {decks.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDeck(null)}
                        className="text-[10px] text-fg-tertiary hover:underline"
                      >
                        목록으로
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {deck.slides.map((slide) => (
                    <SlideCard key={slide.order} slide={slide} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!deck && decks.length === 0 && !loading && (
              <div className="py-12 text-center text-xs text-fg-tertiary">
                포맷을 선택하고 "생성" 버튼을 눌러주세요
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
