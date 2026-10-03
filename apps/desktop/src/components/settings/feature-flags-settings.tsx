import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import { EXPERIMENTAL_FEATURES } from "@/lib/store/slices/ui";

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
      {EXPERIMENTAL_FEATURES.map((feature) => {
        const id = `experimental-${feature}`;
        return (
          <div
            className='flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4'
            key={feature}>
            <div className='flex-1 space-y-1'>
              <Label className='font-semibold text-sm' htmlFor={id}>
                {t(`featureFlags.features.${feature}.title`)}
              </Label>
              <p className='text-muted-foreground text-sm'>
                {t(`featureFlags.features.${feature}.description`)}
              </p>
            </div>
            <Switch
              checked={experimentalFeatures[feature]}
              id={id}
              onCheckedChange={(checked) =>
                setExperimentalFeature(feature, checked)
              }
            />
          </div>
        );
      })}
    </div>
  );
};
