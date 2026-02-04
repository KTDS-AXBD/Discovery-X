import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface SidebarContextValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
  setOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

const STORAGE_KEY = "dx-sidebar-open";

function getInitialOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(getInitialOpen);

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    try {
      localStorage.setItem(STORAGE_KEY, String(v));
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);
  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <SidebarContext.Provider value={{ open, toggle, close, setOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
