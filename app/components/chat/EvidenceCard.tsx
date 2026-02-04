interface EvidenceCardProps {
  evidence: Record<string, unknown>;
}

const TYPE_ICONS: Record<string, string> = {
  DATA: "\uD83D\uDCCA",
  USER: "\uD83D\uDC64",
  ARTIFACT: "\uD83D\uDCC4",
  REF: "\uD83D\uDD17",
  ASSUMPTION: "\uD83D\uDCA1",
};

const STRENGTH_COLORS: Record<string, string> = {
  A: "border-l-green-500",
  B: "border-l-blue-500",
  C: "border-l-yellow-500",
  D: "border-l-red-400",
};

const RELIABILITY_LABELS: Record<string, { text: string; color: string }> = {
  confirmed: { text: "확인됨", color: "text-green-600 dark:text-green-400" },
  reported: { text: "보고됨", color: "text-blue-600 dark:text-blue-400" },
  hypothesis: { text: "가설", color: "text-yellow-600 dark:text-yellow-400" },
};

export function EvidenceCard({ evidence }: EvidenceCardProps) {
  const type = String(evidence.type || "");
  const strength = String(evidence.strength || "");
  const content = String(evidence.content || "");
  const reliability = String(evidence.reliabilityLabel || "");
  const sourceUrl = (evidence.sourceUrl || evidence.linkOrAttachment) as string | undefined;
  const icon = TYPE_ICONS[type] || "\uD83D\uDCCE";
  const borderColor = STRENGTH_COLORS[strength] || "border-l-gray-400";
  const reliabilityInfo = RELIABILITY_LABELS[reliability];

  return (
    <div className={`ml-2 mb-1.5 rounded-r-lg border border-[var(--axis-border-default)] border-l-4 ${borderColor} p-2`}>
      <div className="flex items-center gap-1.5">
        <span className="text-xs">{icon}</span>
        <span className="text-[10px] font-medium text-[var(--axis-text-secondary)]">{type}</span>
        <span className="rounded bg-[var(--axis-surface-secondary)] px-1.5 py-0.5 text-[9px] font-semibold">
          {strength}
        </span>
        {reliabilityInfo && (
          <span className={`text-[9px] ${reliabilityInfo.color}`}>
            {reliabilityInfo.text}
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-[var(--axis-text-primary)] leading-relaxed">
        {content}
      </div>
      {!!sourceUrl && /^https?:\/\//i.test(String(sourceUrl)) && (
        <div className="mt-1">
          <a
            href={String(sourceUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[var(--axis-text-brand)] hover:underline"
          >
            {String(sourceUrl).length > 50
              ? String(sourceUrl).slice(0, 50) + "..."
              : String(sourceUrl)}
          </a>
        </div>
      )}
    </div>
  );
}
