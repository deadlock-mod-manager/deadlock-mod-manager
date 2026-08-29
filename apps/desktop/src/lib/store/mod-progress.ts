import { create } from "zustand";
import type { Progress } from "@/types/mods";

export type ModProgress = {
  percentage: number;
  speed?: number;
};

type ModProgressState = {
  progressByRemoteId: Record<string, ModProgress>;
  setModProgress: (remoteId: string, progress: Progress) => void;
  removeModProgress: (remoteId: string) => void;
  clearModProgress: () => void;
};

export const useModProgressStore = create<ModProgressState>()((set) => ({
  progressByRemoteId: {},
  setModProgress: (remoteId, progress) =>
    set((state) => ({
      progressByRemoteId: {
        ...state.progressByRemoteId,
        [remoteId]: {
          percentage:
            ((progress.progressTotal ?? 0) / (progress.total ?? 1)) * 100,
          speed: progress.transferSpeed,
        },
      },
    })),
  removeModProgress: (remoteId) =>
    set((state) => {
      const progressByRemoteId = { ...state.progressByRemoteId };
      delete progressByRemoteId[remoteId];
      return { progressByRemoteId };
    }),
  clearModProgress: () => set({ progressByRemoteId: {} }),
}));
