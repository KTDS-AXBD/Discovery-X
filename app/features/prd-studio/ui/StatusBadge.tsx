const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "작성 중", cls: "bg-yellow-100 text-yellow-800" },
  GENERATED: { label: "생성됨", cls: "bg-blue-100 text-blue-800" },
  IN_REVIEW: { label: "검토 중", cls: "bg-purple-100 text-purple-800" },
  REVIEWED: { label: "검토 완료", cls: "bg-green-100 text-green-800" },
  FINALIZED: { label: "확정", cls: "bg-emerald-100 text-emerald-800" },
  ARCHIVED: { label: "보관", cls: "bg-gray-100 text-gray-500" },
};

export function StatusBadge({ status }: { status: string }) {
  const badge = STATUS_MAP[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badge.cls}`}>
      {badge.label}
    </span>
  );
}
