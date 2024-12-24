import { getStore } from '@tauri-apps/plugin-store';
import { StateStorage } from 'zustand/middleware';
import { STORE_NAME } from '../constants';

const store = await getStore(STORE_NAME);

const storage: StateStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const value = await store?.get<string>(key);
    return value ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await store?.set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    await store?.delete(key);
  }
};

export default storage;
