import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getPluginAssetUrl } from "@/lib/plugins";

const teaBackground = getPluginAssetUrl(
  "themes",
  "public/pre-defined/tea/background/chowder_pattern.png",
);

const TeaTheme = () => {
  const [mounted, setMounted] = useState(false);

  const backgroundStyle = useMemo<CSSProperties>(() => {
    return {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundImage: `linear-gradient(rgba(26, 18, 34, 0.35), rgba(26, 18, 34, 0.6)), url(${teaBackground})`,
      backgroundSize: "auto",
      backgroundPosition: "center",
      backgroundRepeat: "repeat",
      pointerEvents: "none",
      zIndex: -1,
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.add("tea-theme-active");
    return () => {
      root.classList.remove("tea-theme-active");
    };
  }, [mounted]);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const backgroundNode = <div aria-hidden style={backgroundStyle} />;
  return createPortal(backgroundNode, document.body);
};

export default TeaTheme;
