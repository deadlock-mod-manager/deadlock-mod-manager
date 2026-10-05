import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { PreviewThemeId } from "./themes";

export type ScreenId =
  | "dashboard"
  | "downloads"
  | "settings"
  | "library"
  | "store"
  | "servers"
  | "crosshairs"
  | "skins"
  | "foundry"
  | "autoexec"
  | "stats";

export type SettingsSectionId =
  | "launch-options"
  | "autoexec"
  | "game"
  | "application"
  | "themes"
  | "network"
  | "discord"
  | "tools"
  | "backups"
  | "logging"
  | "privacy";

type NavigationState = {
  screen: ScreenId;
  theme: PreviewThemeId;
  settingsSection: SettingsSectionId;
};

// Navigation lives outside React so other landing sections (the theme cards)
// can drive the preview without sharing a provider with it.
let state: NavigationState = {
  screen: "dashboard",
  theme: "default",
  settingsSection: "themes",
};
const listeners = new Set<() => void>();

const commit = (next: Partial<NavigationState>) => {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
};

// Only worth it when the preview is on screen; a view transition briefly
// freezes the whole page.
const canCrossFade = () => {
  if (typeof document === "undefined") return false;
  if (typeof document.startViewTransition !== "function") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  const preview = document.querySelector("[data-app-preview]");
  if (!preview) return false;
  const { top, bottom } = preview.getBoundingClientRect();
  return bottom > 0 && top < window.innerHeight;
};

/** Theme changes cross-fade the recolor when the browser supports it. */
const setState = (next: Partial<NavigationState>) => {
  if (
    next.theme === undefined ||
    next.theme === state.theme ||
    !canCrossFade()
  ) {
    commit(next);
    return;
  }
  return document.startViewTransition(() => flushSync(() => commit(next)));
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const usePreviewNavigation = () => {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  return {
    ...current,
    setScreen: (screen: ScreenId) => setState({ screen }),
    setTheme: (theme: PreviewThemeId) => setState({ theme }),
    setSettingsSection: (settingsSection: SettingsSectionId) =>
      setState({ settingsSection }),
  };
};

const scrollToTour = () =>
  document
    .getElementById("tour")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });

/** Opens the preview on the Themes screen with a theme applied. */
export const showThemeInPreview = (theme: PreviewThemeId) => {
  // A view transition freezes the page while it runs, so scroll afterwards.
  const transition = setState({
    theme,
    screen: "settings",
    settingsSection: "themes",
  });
  if (transition) transition.finished.then(scrollToTour, scrollToTour);
  else scrollToTour();
};
