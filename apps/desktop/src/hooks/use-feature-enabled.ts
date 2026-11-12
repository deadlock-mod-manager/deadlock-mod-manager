import { isFeatureEnabled, type OptionalFeature } from "@/lib/features";
import { usePersistedStore } from "@/lib/store";

export const useFeatureEnabled = (feature: OptionalFeature) =>
  usePersistedStore((state) => isFeatureEnabled(state, feature));
