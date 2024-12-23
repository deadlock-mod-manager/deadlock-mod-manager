import { getStore } from '@tauri-apps/plugin-store'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { STORE_NAME } from '../constants'
import { createGameSlice, type GameState } from './slices/game'
import { createModsSlice, type ModsState } from './slices/mods'

export type State = ModsState & GameState

const tauriStore = () => {
  return {
    getItem: async (key: string) => (await (await getStore(STORE_NAME))?.get<string>(key)) ?? null,
    setItem: async (key: string, value: string) => (await getStore(STORE_NAME))?.set(key, value),
    removeItem: async (key: string) => (await getStore(STORE_NAME))?.delete(key)
  }
}

export const usePersistedStore = create<State>()(
  persist(
    (...a) => ({
      ...createModsSlice(...a),
      ...createGameSlice(...a)
    }),
    {
      name: 'mods',
      storage: createJSONStorage(() => tauriStore()),
      partialize: (state) => Object.fromEntries(Object.entries(state).filter(([key]) => !['gamePath'].includes(key)))
    }
  )
)
