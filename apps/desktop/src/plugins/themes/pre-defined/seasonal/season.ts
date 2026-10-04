import type { ComponentType, CSSProperties } from "react";
import type { ArtId } from "./art";
import type { Effect } from "./effect-canvas";

export type Hideout = {
  id: ArtId;
  /** `/` matches only the dashboard; other routes also match their sub-pages. */
  route: string;
  place: "hang" | "bottom" | "right";
  /** Percent along the edge. */
  at: number;
  /** String length in px for hanging items. */
  drop?: number;
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
