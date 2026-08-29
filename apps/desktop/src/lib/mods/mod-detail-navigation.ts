export interface AuthorNavigationTarget {
  kind: "author";
  label: string;
  path: string;
}

export interface CollectionNavigationTarget {
  kind: "mods" | "maps" | "library" | "favorites" | "dashboard";
  path: string;
}

export type NavigationTarget =
  | AuthorNavigationTarget
  | CollectionNavigationTarget;
export type NavigationTrail = readonly [
  CollectionNavigationTarget,
  ...AuthorNavigationTarget[],
];

export interface ModDetailNavigationState {
  navigationTrail?: NavigationTrail;
}

export const MODS_STORE_NAVIGATION: CollectionNavigationTarget = {
  kind: "mods",
  path: "/mods",
};

export const MAPS_STORE_NAVIGATION: CollectionNavigationTarget = {
  kind: "maps",
  path: "/maps",
};

export const MODS_LIBRARY_NAVIGATION: CollectionNavigationTarget = {
  kind: "library",
  path: "/my-mods",
};

export const FAVORITES_NAVIGATION: CollectionNavigationTarget = {
  kind: "favorites",
  path: "/favorites",
};

export const DASHBOARD_NAVIGATION: CollectionNavigationTarget = {
  kind: "dashboard",
  path: "/",
};

export const MODS_STORE_NAVIGATION_TRAIL: NavigationTrail = [
  MODS_STORE_NAVIGATION,
];
export const MAPS_STORE_NAVIGATION_TRAIL: NavigationTrail = [
  MAPS_STORE_NAVIGATION,
];
export const MODS_LIBRARY_NAVIGATION_TRAIL: NavigationTrail = [
  MODS_LIBRARY_NAVIGATION,
];
export const FAVORITES_NAVIGATION_TRAIL: NavigationTrail = [
  FAVORITES_NAVIGATION,
];
export const DASHBOARD_NAVIGATION_TRAIL: NavigationTrail = [
  DASHBOARD_NAVIGATION,
];

export const getBackNavigation = (
  navigationTrail?: NavigationTrail,
): NavigationTarget => navigationTrail?.at(-1) ?? MODS_STORE_NAVIGATION;

export const getCollectionNavigationTrail = (
  navigationTrail?: NavigationTrail,
): NavigationTrail => [navigationTrail?.[0] ?? MODS_STORE_NAVIGATION];

export const getModsCollectionNavigationTrail = (
  mapsOnly: boolean,
): NavigationTrail =>
  mapsOnly ? MAPS_STORE_NAVIGATION_TRAIL : MODS_STORE_NAVIGATION_TRAIL;

export const appendNavigation = (
  navigationTrail: NavigationTrail,
  target: AuthorNavigationTarget,
): NavigationTrail => [...navigationTrail, target];
