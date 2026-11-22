import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
};

/**
 * Only the fullscreen element's subtree is painted in fullscreen, so floating
 * content portaled to <body> would stay invisible. Re-renders on
 * fullscreenchange because content wrappers don't re-render when they open.
 */
export const usePortalContainer = () =>
  useSyncExternalStore(
    subscribe,
    () => document.fullscreenElement ?? undefined,
    () => undefined,
  );
