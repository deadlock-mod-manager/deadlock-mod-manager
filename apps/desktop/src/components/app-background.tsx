import { useEffect } from "react";
import { createPortal } from "react-dom";
import { usePersistedStore } from "@/lib/store";

/** Paints the user's background image behind the app, above any theme backdrop. */
const AppBackground = () => {
  const { image, opacity, blur, includeSidebar } = usePersistedStore(
    (state) => state.appBackground,
  );

  useEffect(() => {
    if (!image || !includeSidebar) return;
    const root = document.documentElement;
    root.classList.add("app-background-sidebar");
    return () => {
      root.classList.remove("app-background-sidebar");
    };
  }, [image, includeSidebar]);

  if (!image) return null;

  return createPortal(
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        backgroundImage: `url(${JSON.stringify(image)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        pointerEvents: "none",
        opacity: opacity / 100,
        filter: blur ? `blur(${blur}px)` : undefined,
        zIndex: 0,
      }}
    />,
    document.body,
  );
};

export default AppBackground;
