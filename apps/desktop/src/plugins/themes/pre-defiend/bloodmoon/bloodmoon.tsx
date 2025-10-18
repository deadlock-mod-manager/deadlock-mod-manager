import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import bloodmoonBg from "../../public/pre-defiend/bloodmoon/background/background.png";

const BloodmoonTheme = () => {
  const [mounted, setMounted] = useState(false);

  const backgroundStyle = useMemo<CSSProperties>(() => {
    return {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundImage: `url(${bloodmoonBg})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      pointerEvents: "none",
      opacity: 0.4,
      zIndex: 0,
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.add("bloodmoon-theme-active");
    return () => {
      root.classList.remove("bloodmoon-theme-active");
    };
  }, [mounted]);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const backgroundNode = <div aria-hidden style={backgroundStyle} />;
  return createPortal(backgroundNode, document.body);
};

export default BloodmoonTheme;
