import { useOutletContext } from "@remix-run/react";
import { SuggestionChip } from "~/components/ui/SuggestionChip";
import { displayTitle } from "~/lib/utils/display-title";

interface SourceItem {
  id: string;
  title: string;
  titleKo: string | null;
  summaryKo: string | null;
  url: string;
  memo: string | null;
}

interface OutletCtx {
  selectedSourceId: string | null;
  ideaSourceItems: SourceItem[];
  onClearSource: () => void;
  onStartAnalysis: () => void;
}

export default function IdeasIndex() {
  const ctx = useOutletContext<OutletCtx>();
  const { selectedSourceId, ideaSourceItems, onClearSource, onStartAnalysis } = ctx;
  const hasItems = ideaSourceItems.length > 0;

  // Source detail view
  if (selectedSourceId) {
    const source = ideaSourceItems.find((s) => s.id === selectedSourceId);
    if (source) {
      const isText = source.url?.startsWith("text://");
      return (
        <div className="flex h-full flex-col items-center justify-center px-8">
          <div className="w-full max-w-lg rounded-xl border border-[var(--axis-border-default)] bg-[var(--dx-surface-card,var(--axis-surface-default))] p-6 shadow-sm">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-[var(--axis-text-primary)]">
                {displayTitle(source.titleKo, source.title, source.url)}
              </h2>
              <button
                type="button"
                onClick={onClearSource}
                className="shrink-0 rounded-md p-1 text-[var(--axis-text-tertiary)] transition-colors hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]"
                aria-label="닫기"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Summary */}
            {source.summaryKo && (
              <p className="mt-3 text-sm leading-relaxed text-[var(--axis-text-secondary)]">
                {source.summaryKo}
              </p>
            )}

            {/* Memo (for text sources) */}
            {isText && source.memo && (
              <div className="mt-3 rounded-lg bg-[var(--axis-surface-secondary)] p-3">
                <p className="text-xs font-medium text-[var(--axis-text-tertiary)]">원본 텍스트</p>
                <p className="mt-1 text-sm text-[var(--axis-text-secondary)]">{source.memo}</p>
              </div>
            )}

            {/* URL link */}
            {!isText && source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--axis-text-brand)] hover:underline"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                원본 링크
              </a>
            )}
          </div>
        </div>
      );
    }
  }

  if (hasItems) {
    // Sources have been added — prompt to analyze
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="rounded-full bg-[var(--axis-surface-secondary)] p-4">
          <svg className="h-8 w-8 text-[var(--axis-text-brand)]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
          </svg>
        </div>
        <p className="mt-4 text-sm font-medium text-[var(--axis-text-primary)]">
          소스가 추가되었습니다.
        </p>
        <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
          AI가 소스를 분석하여 사업 아이디어를 생성합니다.
        </p>
        <button
          type="button"
          onClick={onStartAnalysis}
          className="mt-4 rounded-lg bg-[var(--axis-surface-brand)] px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          분석 시작
        </button>
      </div>
    );
  }

  // No sources — show suggestion chips
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="rounded-full bg-[var(--axis-surface-secondary)] p-4">
        <svg className="h-8 w-8 text-[var(--axis-text-tertiary)]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
      </div>
      <p className="mt-4 text-sm font-medium text-[var(--axis-text-primary)]">
        사업 아이디어가 될 소스를 추가해주세요.
      </p>
      <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
        URL, PDF, 텍스트를 왼쪽 소스 패널에 추가하세요.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <SuggestionChip>운동을 보조해주는 웨어러블 로봇</SuggestionChip>
        <SuggestionChip>감사 통합 AI 플랫폼</SuggestionChip>
        <SuggestionChip>스마트 글래스/VR 기반 XR 전시</SuggestionChip>
      </div>
    </div>
  );
}
