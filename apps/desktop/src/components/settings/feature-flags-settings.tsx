import { useLocation } from "react-router";
import { ExperimentalTour } from "@/components/experimental-tour/experimental-tour";
import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";
import { EXPERIMENTAL_FEATURES } from "@/lib/constants";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  EXTERNAL_PLUGINS_QUERY_KEY,
  setPluginRuntimeEnabled,
} from "@/lib/external-plugins";
import { isPluginsBuilt } from "@/lib/runtime-bootstrap";
import type { ExperimentalFeature } from "@/lib/store/slices/ui";

export const FeatureFlagsSettings = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const openTour = new URLSearchParams(location.search).get("tour") === "1";
  const experimentalFeatures = usePersistedStore(
    (state) => state.experimentalFeatures,
  );
  const setExperimentalFeature = usePersistedStore(
    (state) => state.setExperimentalFeature,
  );
  const queryClient = useQueryClient();
  const updateFeature = useMutation({
    mutationFn: async ({
      feature,
      enabled,
    }: {
      feature: ExperimentalFeature;
      enabled: boolean;
    }) => {
      if (feature === "plugins") {
        await setPluginRuntimeEnabled(enabled);
        queryClient.removeQueries({ queryKey: EXTERNAL_PLUGINS_QUERY_KEY });
      }
      setExperimentalFeature(feature, enabled);
    },
  });

  return (
    <div className='space-y-4'>
      <ExperimentalTour key={location.key} replay startOpen={openTour} />
      {EXPERIMENTAL_FEATURES.filter(
        (feature) => feature !== "plugins" || isPluginsBuilt(),
      ).map((feature) => (
        <div
          className='rounded-lg border border-border bg-card p-4'
          key={feature}>
          <SettingToggleRow
            checked={experimentalFeatures[feature]}
            disabled={updateFeature.isPending}
            description={t(`featureFlags.features.${feature}.description`)}
            id={`experimental-${feature}`}
            onCheckedChange={(checked) =>
              updateFeature.mutate({ feature, enabled: checked })
            }
            title={t(`featureFlags.features.${feature}.title`)}
          />
        </div>
      ))}
    </div>
  );
};
