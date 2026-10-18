import { ExperimentalTour } from "@/components/experimental-tour/experimental-tour";
import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";
import { EXPERIMENTAL_FEATURES } from "@/lib/constants";

export const FeatureFlagsSettings = () => {
  const { t } = useTranslation();
  const experimentalFeatures = usePersistedStore(
    (state) => state.experimentalFeatures,
  );
  const setExperimentalFeature = usePersistedStore(
    (state) => state.setExperimentalFeature,
  );

  return (
    <div className='space-y-4'>
      <ExperimentalTour replay />
      {EXPERIMENTAL_FEATURES.map((feature) => (
        <div
          className='rounded-lg border border-border bg-card p-4'
          key={feature}>
          <SettingToggleRow
            checked={experimentalFeatures[feature]}
            description={t(`featureFlags.features.${feature}.description`)}
            id={`experimental-${feature}`}
            onCheckedChange={(checked) =>
              setExperimentalFeature(feature, checked)
            }
            title={t(`featureFlags.features.${feature}.title`)}
          />
        </div>
      ))}
    </div>
  );
};
