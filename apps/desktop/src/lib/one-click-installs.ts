import { create } from "zustand";
import type { ModEntryPoint } from "@/lib/analytics/schema";

type OneClickInstalls = {
  /** Mods between link arrival and install finishing, keyed by slug. */
  active: Record<string, ModEntryPoint>;
};

export const useOneClickInstalls = create<OneClickInstalls>()(() => ({
  active: {},
}));

/** Returns false when the mod is already being handled. */
export const startOneClickInstall = (
  slug: string,
  entryPoint: ModEntryPoint,
): boolean => {
  if (slug in useOneClickInstalls.getState().active) {
    return false;
  }
  useOneClickInstalls.setState((state) => ({
    active: { ...state.active, [slug]: entryPoint },
  }));
  return true;
};

export const finishOneClickInstall = (slug: string) =>
  useOneClickInstalls.setState((state) => {
    const { [slug]: _finished, ...active } = state.active;
    return { active };
  });
