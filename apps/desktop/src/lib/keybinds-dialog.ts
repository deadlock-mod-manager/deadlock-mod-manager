import { create } from "zustand";

type KeybindsDialogState = {
  open: boolean;
  /** The control that opened the dialog gets focus back when it closes. */
  opener: HTMLElement | null;
  show: (opener?: HTMLElement) => void;
  hide: () => void;
};

/** The one shortcuts editor, opened from Settings, the menu bar or a keybind. */
export const useKeybindsDialog = create<KeybindsDialogState>()((set) => ({
  open: false,
  opener: null,
  show: (opener) =>
    set((state) => (state.open ? {} : { open: true, opener: opener ?? null })),
  hide: () => set({ open: false }),
}));
