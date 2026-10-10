import type { ModEntryPoint } from "@/lib/analytics/schema";
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

export interface CuratedCollectionNavigationTarget {
  id: string;
  name: string;
}

export interface ModDetailNavigationState {
  collection: ModsCollection;
  analyticsEntryPoint?: ModEntryPoint;
  author?: AuthorNavigationTarget;
  curatedCollection?: CuratedCollectionNavigationTarget;
}

const getBackTarget = (
  collection: ModsCollection,
  author?: AuthorNavigationTarget,
  curatedCollection?: CuratedCollectionNavigationTarget,
) => {
  if (author) {
    return {
      path: `/authors/${author.id}`,
      labelKey: "modDetail.backToAuthorMods",
      labelValues: { author: author.name },
    };
  }
  if (curatedCollection) {
    return {
      path: `/collections/${curatedCollection.id}`,
      labelKey: "modDetail.backToCollection",
      labelValues: { collection: curatedCollection.name },
    };
  }
  return {
    ...COLLECTION_NAVIGATION[collection],
    labelValues: {},
  };
};

export const getBackNavigation = (
  { collection, author, curatedCollection }: ModDetailNavigationState = {
    collection: "mods",
  },
) => ({
  ...getBackTarget(collection, author, curatedCollection),
  state: { collection },
});
