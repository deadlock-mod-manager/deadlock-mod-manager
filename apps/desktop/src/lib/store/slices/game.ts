import type { StateCreator } from 'zustand';
import type { State } from '..';

export type GameState = {
  gamePath: string;
  setGamePath: (path: string) => void;
};

export const createGameSlice: StateCreator<State, [], [], GameState> = (
  set
) => ({
  gamePath: '',
  setGamePath: (path: string) => set({ gamePath: path }),
});
