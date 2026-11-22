import { create } from "zustand";
import type { ModEntryPoint } from "@/lib/analytics/schema";

type OneClickInstalls = {
  active: Record<string, ModEntryPoint>;
};

export const useOneClickInstalls = create<OneClickInstalls>()(() => ({
  active: {},
}));

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
