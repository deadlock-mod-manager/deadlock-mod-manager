import { create } from "zustand";
import type { FeatureHintId } from "@/lib/feature-hints";

type FeatureHintsSession = {
  candidates: FeatureHintId[];
  active: FeatureHintId | null;
  shownThisSession: boolean;
  register: (id: FeatureHintId) => void;
  unregister: (id: FeatureHintId) => void;
  activate: (id: FeatureHintId) => void;
  release: (id: FeatureHintId) => void;
};

export const useFeatureHintsSession = create<FeatureHintsSession>()((set) => ({
  candidates: [],
  active: null,
  shownThisSession: false,
  register: (id) =>
    set((state) =>
      state.candidates.includes(id)
        ? state
        : { candidates: [...state.candidates, id] },
    ),
  unregister: (id) =>
    set((state) => ({
      candidates: state.candidates.filter((candidate) => candidate !== id),
    })),
  activate: (id) => set({ active: id, shownThisSession: true }),
  release: (id) =>
    set((state) => (state.active === id ? { active: null } : state)),
}));
