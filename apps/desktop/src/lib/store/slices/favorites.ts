import type { StateCreator } from "zustand";
import type { State } from "..";

export type FavoritesState = {
  favorites: string[];
  toggleFavorite: (remoteId: string) => void;
  addFavorite: (remoteId: string) => void;
  removeFavorite: (remoteId: string) => void;
  isFavorite: (remoteId: string) => boolean;
  clearFavorites: () => void;
};

export const favoritesDeepMergeKeys =
  [] as const satisfies readonly (keyof FavoritesState)[];

export const createFavoritesSlice: StateCreator<
  State,
  [],
  [],
  FavoritesState
> = (set, get) => ({
  favorites: [],

  toggleFavorite: (remoteId) =>
    set((state) => {
      const isFav = state.favorites.includes(remoteId);
      return {
        favorites: isFav
          ? state.favorites.filter((id) => id !== remoteId)
          : [...state.favorites, remoteId],
      };
    }),

  addFavorite: (remoteId) =>
    set((state) =>
      state.favorites.includes(remoteId)
        ? state
        : { favorites: [...state.favorites, remoteId] },
    ),

  removeFavorite: (remoteId) =>
    set((state) => ({
      favorites: state.favorites.filter((id) => id !== remoteId),
    })),

  isFavorite: (remoteId) => get().favorites.includes(remoteId),

  clearFavorites: () => set({ favorites: [] }),
});
