import { useState } from "react";

interface SuggestTitleButtonProps {
  ideaId: string;
  onTitleSuggested: (newTitle: string) => void;
}

export function SuggestTitleButton({ ideaId, onTitleSuggested }: SuggestTitleButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleSuggest = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ideas/${ideaId}/suggest-title`, {
        method: "POST",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { title?: string };
      if (data.title) {
        onTitleSuggested(data.title);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSuggest}
      disabled={loading}
      className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-fg-brand transition-colors hover:bg-surface-brand/10 disabled:opacity-50"
      title="AI가 소스를 분석하여 제목을 추천합니다"
    >
      <svg className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
      </svg>
      {loading ? "추천 중..." : "AI 제목 추천"}
    </button>
  );
}
