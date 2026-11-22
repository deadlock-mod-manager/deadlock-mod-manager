import { OPTIONAL_FEATURES } from "@/lib/constants";
import { isPluginsBuilt } from "@/lib/runtime-bootstrap";
import type { ExperimentalFeature, UIState } from "@/lib/store/slices/ui";

export type OptionalFeature = (typeof OPTIONAL_FEATURES)[number];

/**
 * The experimental flag an optional feature still sits behind. Such a feature
 * stays hidden until the flag is on, and the user's own toggle is kept for
 * when it is. Set the entry to null when its flag graduates.
 */
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

/** The optional feature an experimental flag gates, if any. */
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

/** Plugins also need a build that ships the plugin runtime. */
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
