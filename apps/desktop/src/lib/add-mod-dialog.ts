import { create } from "zustand";
import type { DetectedSource } from "@/lib/file-utils";

export const IMPORT_MODS_KEY = ["import-local-mods"];

type AddModDialogState = {
  open: boolean;
  source: DetectedSource | null;
  session: number;
  show: (source?: DetectedSource) => void;
  setSource: (source: DetectedSource) => void;
  close: () => void;
};

export const useAddModDialog = create<AddModDialogState>()((set) => ({
  open: false,
  source: null,
  session: 0,
  show: (source) =>
    set((state) => ({
      open: true,
      source: source ?? null,
      session: state.session + 1,
    })),
  setSource: (source) => set({ source }),
  close: () => set({ open: false, source: null }),
}));
