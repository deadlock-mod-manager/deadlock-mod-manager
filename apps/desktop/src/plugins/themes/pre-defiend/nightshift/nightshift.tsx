import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import nightshiftBg1080 from "../../public/pre-defiend/nightshift/backgrounds/nightshift_bg_1080p.png";
import nightshiftBg4k from "../../public/pre-defiend/nightshift/backgrounds/nightshift_teal_4k.png";

// Corner UI removed per design request

const NightshiftTheme = () => {
  const [mounted, setMounted] = useState(false);

  const backgroundUrl = useMemo(() => {
    if (typeof window !== "undefined") {
      const width = window.innerWidth;
      const height = window.innerHeight;

      if (width >= 3840 || height >= 2160) {
        return nightshiftBg4k;
      }
    }
    return nightshiftBg1080;
  }, []);

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
