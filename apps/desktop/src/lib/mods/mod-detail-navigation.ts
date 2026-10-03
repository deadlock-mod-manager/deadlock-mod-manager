const COLLECTION_NAVIGATION = {
  mods: { path: "/mods", labelKey: "mods.backToMods" },
  maps: { path: "/maps", labelKey: "modDetail.backToMaps" },
  library: { path: "/my-mods", labelKey: "modDetail.backToLibrary" },
  favorites: { path: "/favorites", labelKey: "modDetail.backToFavorites" },
  dashboard: { path: "/", labelKey: "modDetail.backToDashboard" },
};

export type ModsCollection = keyof typeof COLLECTION_NAVIGATION;

export interface AuthorNavigationTarget {
  id: string;
  name: string;
}

export interface ModDetailNavigationState {
  collection: ModsCollection;
  author?: AuthorNavigationTarget;
}

export const getBackNavigation = (
  { collection, author }: ModDetailNavigationState = { collection: "mods" },
) => ({
  path: author
    ? `/authors/${author.id}`
    : COLLECTION_NAVIGATION[collection].path,
  labelKey: author
    ? "modDetail.backToAuthorMods"
    : COLLECTION_NAVIGATION[collection].labelKey,
  labelValues: { author: author?.name },
  state: { collection },
});
