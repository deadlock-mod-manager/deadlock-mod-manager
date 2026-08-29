export interface AuthorModDetailBackNavigation {
  kind: "author";
  authorName: string;
  path: string;
}

export interface CollectionModDetailBackNavigation {
  kind: "mods" | "library" | "favorites" | "dashboard";
  path: string;
}

export type ModDetailBackNavigation =
  | AuthorModDetailBackNavigation
  | CollectionModDetailBackNavigation;

export interface ModDetailNavigationState {
  backNavigation?: ModDetailBackNavigation;
  authorProfileBackNavigation?: CollectionModDetailBackNavigation;
}

export const MODS_STORE_BACK_NAVIGATION: CollectionModDetailBackNavigation = {
  kind: "mods",
  path: "/mods",
};

export const MODS_LIBRARY_BACK_NAVIGATION: CollectionModDetailBackNavigation = {
  kind: "library",
  path: "/my-mods",
};

export const FAVORITES_BACK_NAVIGATION: CollectionModDetailBackNavigation = {
  kind: "favorites",
  path: "/favorites",
};

export const DASHBOARD_BACK_NAVIGATION: CollectionModDetailBackNavigation = {
  kind: "dashboard",
  path: "/",
};

export const resolveAuthorProfileBackNavigation = (
  navigationState?: ModDetailNavigationState | null,
): CollectionModDetailBackNavigation => {
  const backNavigation = navigationState?.backNavigation;
  if (!backNavigation) {
    return MODS_STORE_BACK_NAVIGATION;
  }
  if (backNavigation.kind === "author") {
    return (
      navigationState.authorProfileBackNavigation ?? MODS_STORE_BACK_NAVIGATION
    );
  }
  return backNavigation;
};
