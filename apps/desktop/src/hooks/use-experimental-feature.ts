import { isExperimentalFeatureOn } from "@/lib/features";
import { usePersistedStore } from "@/lib/store";
import type { ExperimentalFeature } from "@/lib/store/slices/ui";

export const useExperimentalFeature = (feature: ExperimentalFeature) =>
  usePersistedStore((state) => isExperimentalFeatureOn(state, feature));
