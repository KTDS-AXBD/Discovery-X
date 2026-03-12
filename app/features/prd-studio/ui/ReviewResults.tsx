interface FeedbackItem {
  section?: string;
  severity: string;
  message: string;
  suggestion?: string;
}

interface ScorecardItem {
  criteria: string;
  score: number;
  maxScore: number;
  comment?: string;
}

interface Review {
  id: string;
  model: string;
  verdict: string | null;
  feedbackItems: FeedbackItem[] | null;
  scorecard: {
    totalScore: number;
    items: ScorecardItem[];
  } | null;
  error: string | null;
  latency: number | null;
  createdAt: string | number | null;
}

interface ReviewResultsProps {
  reviews: Review[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(ts: string | number | null) {
  if (!ts) return "-";
  const d = new Date(typeof ts === "number" ? ts * 1000 : ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) return <span className="text-sm text-fg-tertiary">-</span>;
  const map: Record<string, { label: string; cls: string }> = {
    READY: { label: "착수 가능", cls: "bg-green-100 text-green-800" },
    CONDITIONAL: { label: "조건부", cls: "bg-yellow-100 text-yellow-800" },
    NOT_READY: { label: "재작성 필요", cls: "bg-red-100 text-red-800" },
  };
  const badge = map[verdict] ?? { label: verdict, cls: "bg-gray-100 text-gray-600" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badge.cls}`}
    >
      {badge.label}
    </span>
  );
}

const SEVERITY_STYLE: Record<string, { icon: string; cls: string }> = {
  critical: { icon: "🔴", cls: "border-l-red-500 bg-red-50" },
  major: { icon: "🟡", cls: "border-l-yellow-500 bg-yellow-50" },
  minor: { icon: "🔵", cls: "border-l-blue-500 bg-blue-50" },
  suggestion: { icon: "💡", cls: "border-l-purple-500 bg-purple-50" },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreBar({ item }: { item: ScorecardItem }) {
  const pct = item.maxScore > 0 ? (item.score / item.maxScore) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-fg-secondary w-36 shrink-0">{item.criteria}</span>
      <div className="flex-1 h-2 rounded-full bg-surface-secondary overflow-hidden">
        <div
          className="h-full rounded-full bg-accent-fg"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-fg-tertiary w-10 text-right">
        {item.score}/{item.maxScore}
      </span>
    </div>
  );
}

function FeedbackCard({ fb }: { fb: FeedbackItem }) {
  const style = SEVERITY_STYLE[fb.severity] ?? {
    icon: "•",
    cls: "border-l-gray-400 bg-gray-50",
  };
  return (
    <div className={`border-l-4 rounded-r-md p-3 ${style.cls}`}>
      <div className="flex items-start gap-2">
        <span className="shrink-0">{style.icon}</span>
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-fg-secondary uppercase">
              {fb.severity}
            </span>
            {fb.section && (
              <span className="text-xs text-fg-tertiary">• {fb.section}</span>
            )}
          </div>
          <p className="text-sm text-fg">{fb.message}</p>
          {fb.suggestion && (
            <p className="text-xs text-fg-secondary italic">→ {fb.suggestion}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ review }: { review: Review }) {
  // Error card
  if (review.error) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <div className="flex items-center gap-2">
          <span>⚠️</span>
          <span className="text-sm font-medium text-yellow-800">
            {review.model}: 검토 실패
          </span>
        </div>
        <p className="mt-1 text-sm text-yellow-700">{review.error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-fg">{review.model}</span>
          <VerdictBadge verdict={review.verdict} />
        </div>
        <div className="flex items-center gap-3 text-xs text-fg-tertiary">
          {review.scorecard && (
            <span className="font-medium">
              총점: {review.scorecard.totalScore}/100
            </span>
          )}
          {review.latency != null && (
            <span>{(review.latency / 1000).toFixed(1)}초</span>
          )}
          <span>{formatDate(review.createdAt)}</span>
        </div>
      </div>

      {/* Scorecard */}
      {review.scorecard && review.scorecard.items.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-fg-secondary uppercase tracking-wide">
            스코어카드
          </h4>
          <div className="space-y-1.5">
            {review.scorecard.items.map((item, i) => (
              <ScoreBar key={i} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Feedback Items */}
      {review.feedbackItems && review.feedbackItems.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-fg-secondary uppercase tracking-wide">
            피드백
          </h4>
          <div className="space-y-2">
            {review.feedbackItems.map((fb, i) => (
              <FeedbackCard key={i} fb={fb} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function ReviewResults({ reviews }: ReviewResultsProps) {
  if (reviews.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-fg">검토 결과</h2>
        <p className="text-sm text-fg-tertiary">
          {reviews.length}개 모델 검토 완료
        </p>
      </div>
      <div className="space-y-4">
        {reviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>
    </div>
  );
}
