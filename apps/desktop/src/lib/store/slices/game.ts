import { StateCreator } from 'zustand';
import { State } from '..';

export interface GameState {
  gamePath: string;
  setGamePath: (path: string) => void;
}

export const createGameSlice: StateCreator<State, [], [], GameState> = (set) => ({
  gamePath: '',
  setGamePath: (path: string) => set({ gamePath: path })
});
