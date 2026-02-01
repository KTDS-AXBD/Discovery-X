import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function getResolvedTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("dx-theme") as Theme) || "system";
  });

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    const resolved = getResolvedTheme(newTheme);
    document.documentElement.setAttribute("data-theme", resolved);
    if (newTheme === "system") {
      localStorage.removeItem("dx-theme");
    } else {
      localStorage.setItem("dx-theme", newTheme);
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") {
        document.documentElement.setAttribute(
          "data-theme",
          mq.matches ? "dark" : "light"
        );
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, resolvedTheme: getResolvedTheme(theme), setTheme };
}
