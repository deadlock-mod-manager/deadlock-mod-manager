import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const LovelockTheme = () => {
  const [mounted, setMounted] = useState(false);

  const backgroundStyle = useMemo<CSSProperties>(() => {
    return {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: "#211722",
      backgroundImage: `
        radial-gradient(ellipse 70% 55% at 0% 0%, rgba(255, 140, 192, 0.12) 0%, transparent 55%),
        radial-gradient(ellipse 70% 55% at 100% 100%, rgba(255, 140, 192, 0.09) 0%, transparent 50%),
        radial-gradient(circle, rgba(255, 196, 224, 0.09) 1px, transparent 1.5px)
      `,
      backgroundSize: "100% 100%, 100% 100%, 22px 22px",
      pointerEvents: "none",
      zIndex: -1,
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.add("lovelock-theme-active");
    return () => {
      root.classList.remove("lovelock-theme-active");
    };
  }, [mounted]);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const backgroundNode = <div aria-hidden style={backgroundStyle} />;
  return createPortal(backgroundNode, document.body);
};

export default LovelockTheme;
