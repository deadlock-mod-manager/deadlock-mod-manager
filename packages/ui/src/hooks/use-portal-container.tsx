import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
};

export const usePortalContainer = () =>
  useSyncExternalStore(
    subscribe,
    () => document.fullscreenElement ?? undefined,
    () => undefined,
  );
