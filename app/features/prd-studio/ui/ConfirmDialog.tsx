import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

const subscribe = () => () => {};

export function ConfirmDialog({
  open, title, description,
  confirmLabel = "확인", cancelLabel = "취소",
  variant = "default", onConfirm, onCancel,
}: ConfirmDialogProps) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // 열릴 때 확인 버튼에 포커스
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!mounted || !open) return null;

  const confirmCls = variant === "danger"
    ? "bg-red-600 text-white hover:bg-red-700"
    : "bg-btn-bg text-btn-text hover:bg-btn-bg-hover";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        className="relative z-10 w-full max-w-sm rounded-lg bg-surface p-6 shadow-lg border border-border"
      >
        <h2 id="confirm-title" className="text-lg font-semibold text-fg">{title}</h2>
        <p id="confirm-desc" className="mt-2 text-sm text-fg-secondary">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-fg-tertiary hover:text-fg"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`rounded px-3 py-1.5 text-sm font-medium ${confirmCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
