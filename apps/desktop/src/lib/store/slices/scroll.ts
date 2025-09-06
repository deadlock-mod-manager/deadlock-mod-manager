import type { StateCreator } from 'zustand';
import type { State } from '..';

export type ScrollState = {
  scrollPositions: Record<string, number>;
  setScrollPosition: (key: string, position: number) => void;
  getScrollPosition: (key: string) => number;
  clearScrollPosition: (key: string) => void;
};

export const createScrollSlice: StateCreator<State, [], [], ScrollState> = (
  set,
  get
) => ({
  scrollPositions: {},

  setScrollPosition: (key: string, position: number) => {
    set((state) => ({
      scrollPositions: {
        ...state.scrollPositions,
        [key]: position,
      },
    }));
  },

  getScrollPosition: (key: string) => {
    return get().scrollPositions[key] || 0;
  },

  clearScrollPosition: (key: string) => {
    set((state) => {
      const newPositions = { ...state.scrollPositions };
      delete newPositions[key];
      return { scrollPositions: newPositions };
    });
  },
});
