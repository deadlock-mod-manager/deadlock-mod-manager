import { create } from "zustand";
import { usePersistedStore } from "@/lib/store";

type BisectDialog = "explainer" | "setup" | null;

type BisectDialogState = {
  dialog: BisectDialog;
  explainerNext: "setup" | null;
  showExplainer: (next: "setup" | null) => void;
  showSetup: () => void;
  close: () => void;
};

export const useBisectDialog = create<BisectDialogState>()((set) => ({
  dialog: null,
  explainerNext: null,
  showExplainer: (next) => set({ dialog: "explainer", explainerNext: next }),
  showSetup: () => set({ dialog: "setup", explainerNext: null }),
  close: () => set({ dialog: null, explainerNext: null }),
}));

export const openFindBrokenMod = () => {
  const dialogs = useBisectDialog.getState();
  if (usePersistedStore.getState().bisectExplainerSeen) dialogs.showSetup();
  else dialogs.showExplainer("setup");
};
