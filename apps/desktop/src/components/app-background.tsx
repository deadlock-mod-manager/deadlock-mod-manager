import { useEffect } from "react";
import { createPortal } from "react-dom";
import { usePersistedStore } from "@/lib/store";

/** Paints the user's background image behind the app, above any theme backdrop. */
const AppBackground = () => {
  const {
    image,
    opacity,
    blur,
    includeSidebar,
    includeTopBar,
    includeBottomBar,
  } = usePersistedStore((state) => state.appBackground);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle(
      "app-background-sidebar",
      Boolean(image) && includeSidebar,
    );
    root.classList.toggle(
      "app-background-top-bar",
      Boolean(image) && includeTopBar,
    );
    root.classList.toggle(
      "app-background-bottom-bar",
      Boolean(image) && includeBottomBar,
    );
    return () => {
      root.classList.remove("app-background-sidebar");
      root.classList.remove(
        "app-background-top-bar",
        "app-background-bottom-bar",
      );
    };
  }, [image, includeSidebar, includeTopBar, includeBottomBar]);

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
