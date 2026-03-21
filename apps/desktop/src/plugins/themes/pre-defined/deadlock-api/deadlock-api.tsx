import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const PRIMARY_COLOR = "#fa4454";

const DeadlockApiTheme = () => {
  const [mounted, setMounted] = useState(false);

  const backgroundStyle = useMemo<CSSProperties>(() => {
    return {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      background: `
        radial-gradient(ellipse 85% 65% at 0% 0%, rgba(250, 68, 84, 0.18) 0%, transparent 52%),
        radial-gradient(ellipse 80% 60% at 100% 100%, rgba(250, 68, 84, 0.14) 0%, transparent 48%),
        radial-gradient(ellipse 55% 45% at 100% 0%, rgba(255, 107, 122, 0.08) 0%, transparent 42%),
        radial-gradient(ellipse 65% 50% at 0% 100%, rgba(255, 107, 122, 0.06) 0%, transparent 38%)
      `,
      pointerEvents: "none",
      zIndex: 0,
    };
  }, []);

  const cssVars = useMemo(() => {
    return `
      .deadlock-api-theme-active {
        --background: 220 20% 2%;
        --foreground: 210 20% 92%;
        --card: 220 20% 5% / 0.9;
        --card-foreground: 210 20% 92%;
        --popover: 220 20% 5% / 0.95;
        --popover-foreground: 210 20% 92%;
        --secondary: 220 15% 9% / 0.85;
        --secondary-foreground: 210 15% 85%;
        --muted: 220 15% 11% / 0.85;
        --muted-foreground: 210 10% 55%;
        --primary: 354 94% 62%;
        --primary-foreground: 0 0% 100%;
        --accent: 354 80% 50%;
        --accent-foreground: 0 0% 100%;
        --border: 220 15% 13%;
        --input: 220 15% 11% / 0.7;
        --ring: 354 90% 58%;
        --sidebar-background: 220 20% 2% / 0.98;
        --sidebar-foreground: 210 20% 92%;
        --sidebar-primary: 354 94% 62%;
        --sidebar-primary-foreground: 0 0% 100%;
        --sidebar-accent: 354 80% 50%;
        --sidebar-accent-foreground: 0 0% 100%;
        --sidebar-border: 220 15% 11%;
        --eb-color: ${PRIMARY_COLOR};
      }
    `;
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.add("deadlock-api-theme-active");

    const styleId = "deadlock-api-dynamic-vars";
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = cssVars;

    return () => {
      root.classList.remove("deadlock-api-theme-active");
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, [mounted, cssVars]);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const backgroundNode = <div aria-hidden style={backgroundStyle} />;
  return createPortal(backgroundNode, document.body);
};

export default DeadlockApiTheme;
