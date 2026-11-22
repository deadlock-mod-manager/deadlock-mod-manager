import type { ComponentType, CSSProperties } from "react";
import type { ArtId } from "./art";
import type { Effect } from "./effect-canvas";

export type Hideout = {
  id: ArtId;
  route: string;
  place: "hang" | "bottom" | "right";
  at: number;
  drop?: number;
};

export const matchesHideoutRoute = (route: string, pathname: string) =>
  route === "/"
    ? pathname === "/"
    : pathname === route || pathname.startsWith(`${route}/`);

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
  i18nKey: string;
  rootClass: string;
  backdrop: CSSProperties;
  effect: () => Effect;
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
  hideouts: Hideout[];
};
