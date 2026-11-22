import type { CSSProperties } from "react";
import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const BACKDROP_BASE_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
  zIndex: -1,
};

export const useThemeRootClass = (className: string) => {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(className);
    return () => {
      root.classList.remove(className);
    };
  }, [className]);
};

type ThemeBackdropProps = {
  rootClass: string;
  style: CSSProperties;
};

let activeBackdropStyle: CSSProperties | null = null;
const backdropListeners = new Set<() => void>();

const setActiveBackdropStyle = (style: CSSProperties | null) => {
  activeBackdropStyle = style;
  for (const listener of backdropListeners) listener();
};

const subscribeBackdropStyle = (listener: () => void) => {
  backdropListeners.add(listener);
  return () => {
    backdropListeners.delete(listener);
  };
};

export const useThemeBackdropSurfaceStyle = (): CSSProperties | undefined => {
  const style = useSyncExternalStore(
    subscribeBackdropStyle,
    () => activeBackdropStyle,
  );
  return style ? { ...style, backgroundAttachment: "fixed" } : undefined;
};

export const ThemeBackdrop = ({ rootClass, style }: ThemeBackdropProps) => {
  useThemeRootClass(rootClass);
  useThemeRootClass("theme-backdrop-active");

  useEffect(() => {
    setActiveBackdropStyle(style);
    return () => setActiveBackdropStyle(null);
  }, [style]);

  return createPortal(
    <div aria-hidden style={{ ...BACKDROP_BASE_STYLE, ...style }} />,
    document.body,
  );
};

export const useThemeStyleVars = (styleId: string, css: string) => {
  useEffect(() => {
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
  }, [styleId, css]);

  useEffect(
    () => () => {
      document.getElementById(styleId)?.remove();
    },
    [styleId],
  );
};
