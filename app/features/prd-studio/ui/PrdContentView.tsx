import { useState, useCallback } from "react";
import { useFetcher } from "@remix-run/react";
import { INTERVIEW_SECTIONS } from "~/features/prd-studio/constants/interview-config";

interface PrdContentViewProps {
  prdId: string;
  sections: Array<{
    type: string;
    generatedContent: string | null;
    editedContent: string | null;
  }>;
  editable?: boolean;
}

export function PrdContentView({ prdId, sections, editable = false }: PrdContentViewProps) {
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editFetcher = useFetcher();

  const handleEdit = useCallback((type: string, currentContent: string) => {
    setEditingType(type);
    setEditValue(currentContent);
  }, []);

  const handleSave = useCallback(() => {
    if (!editingType) return;
    editFetcher.submit(
      { sections: [{ type: editingType, content: editValue }] },
      { method: "PUT", action: `/api/prd-studio/${prdId}/edit`, encType: "application/json" },
    );
    setEditingType(null);
  }, [editingType, editValue, editFetcher, prdId]);

  const handleCancel = useCallback(() => {
    setEditingType(null);
    setEditValue("");
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-fg">생성된 PRD</h2>
        {editable && (
          <span className="text-xs text-fg-tertiary">섹션을 클릭하여 편집할 수 있어요</span>
        )}
      </div>
      {INTERVIEW_SECTIONS.map((cfg) => {
        const sec = sections.find((s) => s.type === cfg.type);
        const content = sec?.editedContent ?? sec?.generatedContent ?? "";
        const isEditing = editingType === cfg.type;

        return (
          <div key={cfg.type} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-fg">{cfg.label}</h3>
              {editable && !isEditing && content && (
                <button
                  type="button"
                  onClick={() => handleEdit(cfg.type, content)}
                  className="text-xs text-accent-fg hover:underline"
                >
                  편집
                </button>
              )}
            </div>
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent-fg resize-none"
                  style={{ minHeight: "120px" }}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="rounded px-3 py-1.5 text-xs text-fg-tertiary hover:text-fg"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={editFetcher.state !== "idle"}
                    className="rounded bg-btn-bg px-3 py-1.5 text-xs font-medium text-btn-text hover:bg-btn-bg-hover disabled:opacity-50"
                  >
                    {editFetcher.state !== "idle" ? "저장 중..." : "저장"}
                  </button>
                </div>
              </div>
            ) : content ? (
              <div className="text-sm text-fg-secondary whitespace-pre-wrap leading-relaxed">
                {content}
              </div>
            ) : (
              <p className="text-sm text-fg-tertiary">콘텐츠가 생성되지 않았어요.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
