import { useCallback, useEffect, useRef, useState } from "react";

interface PanelResizeHandleProps {
  onResize: (delta: number) => void;
  side: "left" | "right";
}

export function PanelResizeHandle({ onResize, side }: PanelResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  // Keep a ref to the latest onResize to avoid stale closure during drag
  const onResizeRef = useRef(onResize);
  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      setIsDragging(true);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startXRef.current;
        startXRef.current = moveEvent.clientX;
        // For the left panel, dragging right = expand (+delta)
        // For the right panel, dragging left = expand (-delta)
        onResizeRef.current(side === "left" ? delta : -delta);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [side]
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={handleMouseDown}
      className={`relative z-10 flex w-1 shrink-0 cursor-col-resize items-center justify-center transition-colors ${
        isDragging
          ? "bg-[var(--axis-text-brand)]"
          : "bg-transparent hover:bg-[var(--axis-border-default)]"
      }`}
    >
      {/* Wider hit area */}
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}
