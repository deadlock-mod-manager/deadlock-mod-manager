import { create } from "zustand";
import type { DetectedSource } from "@/lib/file-utils";

export const IMPORT_MODS_KEY = ["import-local-mods"];

type AddModDialogState = {
  open: boolean;
  // The files being added; none while the dialog asks for them.
  source: DetectedSource | null;
  // Bumped for each new set of files, so their details start fresh.
  session: number;
  show: (source?: DetectedSource) => void;
  // Parts added or removed in the details step.
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
