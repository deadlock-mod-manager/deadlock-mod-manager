import type { StateCreator } from "zustand";
import type { State } from "..";

export type FavoritesState = {
  favorites: string[];
  pendingSoundFavoriteChecks: string[];
  toggleFavorite: (remoteId: string) => void;
  addFavorite: (remoteId: string) => void;
  removeFavorite: (remoteId: string) => void;
  isFavorite: (remoteId: string) => boolean;
  clearFavorites: () => void;
  applySoundFavoriteChecks: (soundIds: string[]) => void;
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
  pendingSoundFavoriteChecks: [],

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

  applySoundFavoriteChecks: (soundIds) =>
    set((state) => {
      const sounds = new Set(soundIds);
      const favorites = state.favorites.map((id) =>
        sounds.has(id) ? `snd-${id}` : id,
      );
      return {
        favorites: [...new Set(favorites)],
        pendingSoundFavoriteChecks: [],
      };
    }),
});
