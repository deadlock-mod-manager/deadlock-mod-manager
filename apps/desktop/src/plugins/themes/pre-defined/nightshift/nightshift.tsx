import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getPluginAssetUrl } from "@/lib/plugins";

const nightshiftBg = getPluginAssetUrl(
  "themes",
  "public/pre-defined/nightshift/background/nightshift_bg_1080p.png",
);

// Corner UI removed per design request

const NightshiftTheme = () => {
  const [mounted, setMounted] = useState(false);

  const backgroundUrl = useMemo(() => nightshiftBg, []);

  const backgroundStyle = useMemo<CSSProperties>(() => {
    return {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundImage: `url(${backgroundUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      pointerEvents: "none",
      opacity: 0.3,
      zIndex: 0,
    };
  }, [backgroundUrl]);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.add("nightshift-theme-active");
    return () => {
      root.classList.remove("nightshift-theme-active");
    };
  }, [mounted]);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const backgroundNode = <div aria-hidden style={backgroundStyle} />;
  return createPortal(backgroundNode, document.body);
};

export default NightshiftTheme;
