import { OPTIONAL_FEATURES } from "@/lib/constants";
import { isPluginsBuilt } from "@/lib/runtime-bootstrap";
import type { ExperimentalFeature, UIState } from "@/lib/store/slices/ui";

export type OptionalFeature = (typeof OPTIONAL_FEATURES)[number];

export const FEATURE_EXPERIMENTAL_FLAGS = {
  stats: null,
  "server-browser": null,
  "server-picker": null,
  crosshairs: null,
  skins: null,
  autoexec: null,
  performance: "performance-configs",
  foundry: "mod-foundry",
  plugins: "plugins",
} as const satisfies Record<OptionalFeature, ExperimentalFeature | null>;

export const featureForFlag = (
  flag: ExperimentalFeature,
): OptionalFeature | null =>
  OPTIONAL_FEATURES.find(
    (feature) => FEATURE_EXPERIMENTAL_FLAGS[feature] === flag,
  ) ?? null;

export type FeatureState = Pick<
  UIState,
  "features" | "experimentalFeatures" | "minimalMode"
>;

export const isExperimentalFeatureOn = (
  state: Pick<UIState, "experimentalFeatures">,
  flag: ExperimentalFeature,
): boolean =>
  state.experimentalFeatures[flag] && (flag !== "plugins" || isPluginsBuilt());

export const isFeatureEnabled = (
  state: FeatureState,
  feature: OptionalFeature,
): boolean => {
  const flag = FEATURE_EXPERIMENTAL_FLAGS[feature];
  return (
    !state.minimalMode &&
    state.features[feature] &&
    (flag === null || isExperimentalFeatureOn(state, flag))
  );
};
