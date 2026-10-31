import { usePersistedStore } from "@/lib/store";
import type { ExperimentalFeature } from "@/lib/store/slices/ui";
import { isPluginsBuilt } from "@/lib/runtime-bootstrap";

export const useExperimentalFeature = (feature: ExperimentalFeature) =>
  usePersistedStore(
    (state) =>
      state.experimentalFeatures[feature] &&
      (feature !== "plugins" || isPluginsBuilt()),
  );
