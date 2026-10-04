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

export interface AlbumNavigationTarget {
  slug: string;
  name: string;
}

export interface ModDetailNavigationState {
  collection: ModsCollection;
  author?: AuthorNavigationTarget;
  album?: AlbumNavigationTarget;
}

const getBackTarget = (
  collection: ModsCollection,
  author?: AuthorNavigationTarget,
  album?: AlbumNavigationTarget,
) => {
  if (author) {
    return {
      path: `/authors/${author.id}`,
      labelKey: "modDetail.backToAuthorMods",
      labelValues: { author: author.name },
    };
  }
  if (album) {
    return {
      path: `/albums/${album.slug}`,
      labelKey: "modDetail.backToAlbum",
      labelValues: { album: album.name },
    };
  }
  return {
    ...COLLECTION_NAVIGATION[collection],
    labelValues: {},
  };
};

export const getBackNavigation = (
  { collection, author, album }: ModDetailNavigationState = {
    collection: "mods",
  },
) => ({
  ...getBackTarget(collection, author, album),
  state: { collection },
});
