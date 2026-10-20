import type { ComponentType, CSSProperties } from "react";
import type { ArtId } from "./art";
import type { Effect } from "./effect-canvas";

export type Hideout = {
  id: ArtId;
  /**
   * App path this item lives on. `/` is the dashboard only.
   * Any other route also matches its sub-pages (`/settings` covers
   * `/settings/autoexec`), and the longest match wins when several could.
   */
  route: string;
  place: "hang" | "bottom" | "right";
  /** Percent along the edge. */
  at: number;
  /** String length in px for hanging items. */
  drop?: number;
};

/** `/` is exact. Every other route includes its own sub-pages. */
export const matchesHideoutRoute = (route: string, pathname: string) =>
  route === "/"
    ? pathname === "/"
    : pathname === route || pathname.startsWith(`${route}/`);

/** Hideouts for this path. A more specific route hides its parent. */
export const hideoutsOnPath = <T extends { route: string }>(
  hideouts: readonly T[],
  pathname: string,
): T[] => {
  const matches = hideouts.filter((hideout) =>
    matchesHideoutRoute(hideout.route, pathname),
  );
  const longest = matches.reduce(
    (length, hideout) => Math.max(length, hideout.route.length),
    0,
  );
  return matches.filter((hideout) => hideout.route.length === longest);
};

export type Season = {
  /** Key under `plugins.seasonal` in the locale files. */
  i18nKey: string;
  rootClass: string;
  backdrop: CSSProperties;
  effect: () => Effect;
  /** `front` floats over the UI without catching clicks; `back` paints behind the app shell. */
  layer: "front" | "back";
  opacity?: number;
  Extra?: ComponentType;
  Sidebar: ComponentType;
  logo: {
    colors: Record<
      "--primary" | "--primary-foreground" | "--secondary",
      string
    >;
    Accessory?: ComponentType<{ className?: string }>;
  };
  /** One item per page, so the whole set only turns up by wandering through the app. */
  hideouts: Hideout[];
};
