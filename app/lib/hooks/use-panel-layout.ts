import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "dx-ideas-panel-layout";

const DEFAULTS = {
  leftOpen: true,
  rightOpen: true,
  leftWidth: 288,
  rightWidth: 320,
};

const CONSTRAINTS = {
  left: { min: 200, max: 400 },
  right: { min: 240, max: 480 },
};

interface PanelLayout {
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function loadLayout(): PanelLayout {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<PanelLayout>;
    return {
      leftOpen: typeof parsed.leftOpen === "boolean" ? parsed.leftOpen : DEFAULTS.leftOpen,
      rightOpen: typeof parsed.rightOpen === "boolean" ? parsed.rightOpen : DEFAULTS.rightOpen,
      leftWidth: clamp(
        typeof parsed.leftWidth === "number" ? parsed.leftWidth : DEFAULTS.leftWidth,
        CONSTRAINTS.left.min,
        CONSTRAINTS.left.max
      ),
      rightWidth: clamp(
        typeof parsed.rightWidth === "number" ? parsed.rightWidth : DEFAULTS.rightWidth,
        CONSTRAINTS.right.min,
        CONSTRAINTS.right.max
      ),
    };
  } catch {
    return DEFAULTS;
  }
}

function saveLayout(layout: PanelLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // quota exceeded — ignore
  }
}

export function usePanelLayout() {
  const [layout, setLayout] = useState<PanelLayout>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount
  useEffect(() => {
    setLayout(loadLayout());
    setHydrated(true);
  }, []);

  // Persist on change (skip initial mount)
  useEffect(() => {
    if (hydrated) saveLayout(layout);
  }, [layout, hydrated]);

  const toggleLeft = useCallback(() => {
    setLayout((prev) => ({ ...prev, leftOpen: !prev.leftOpen }));
  }, []);

  const toggleRight = useCallback(() => {
    setLayout((prev) => ({ ...prev, rightOpen: !prev.rightOpen }));
  }, []);

  const setLeftWidth = useCallback((width: number) => {
    setLayout((prev) => ({
      ...prev,
      leftWidth: clamp(width, CONSTRAINTS.left.min, CONSTRAINTS.left.max),
    }));
  }, []);

  const setRightWidth = useCallback((width: number) => {
    setLayout((prev) => ({
      ...prev,
      rightWidth: clamp(width, CONSTRAINTS.right.min, CONSTRAINTS.right.max),
    }));
  }, []);

  return {
    ...layout,
    hydrated,
    toggleLeft,
    toggleRight,
    setLeftWidth,
    setRightWidth,
    constraints: CONSTRAINTS,
  };
}
