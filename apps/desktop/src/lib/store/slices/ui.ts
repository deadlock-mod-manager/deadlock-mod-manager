import type { StateCreator } from 'zustand';
import type { State } from '..';

export type UIState = {
  showWhatsNew: boolean;
  lastSeenVersion: string | null;

  forceShowWhatsNew: () => void;
  markVersionAsSeen: (version: string) => void;
  setShowWhatsNew: (show: boolean) => void;
};

export const createUISlice: StateCreator<State, [], [], UIState> = (set) => ({
  showWhatsNew: false,
  lastSeenVersion: null,

  forceShowWhatsNew: () =>
    set(() => ({
      showWhatsNew: true,
    })),

  markVersionAsSeen: (version: string) =>
    set(() => ({
      showWhatsNew: false,
      lastSeenVersion: version,
    })),

  setShowWhatsNew: (show: boolean) =>
    set(() => ({
      showWhatsNew: show,
    })),
});
