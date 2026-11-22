import { Button } from "@deadlock-mods/ui/components/button";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";
import { EXPERIMENTAL_FEATURES } from "@/lib/constants";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { syncPluginRuntime } from "@/lib/external-plugins";
import { featureForFlag, type OptionalFeature } from "@/lib/features";
import { isPluginsBuilt } from "@/lib/runtime-bootstrap";
import type { ExperimentalFeature } from "@/lib/store/slices/ui";

/**
 * Why an opted-in experiment does nothing: the Features tab keeps the feature
 * it belongs to off.
 */
const blockedReason = (
  flag: ExperimentalFeature,
  flagOn: boolean,
  features: Record<OptionalFeature, boolean>,
  minimalMode: boolean,
): "minimal" | "feature" | null => {
  const optional = featureForFlag(flag);
  if (!flagOn || optional === null) return null;
  if (minimalMode) return "minimal";
  return features[optional] ? null : "feature";
};

export const FeatureFlagsSettings = ({
  onOpenFeatures,
}: {
  onOpenFeatures: () => void;
}) => {
  const { t } = useTranslation();
  const experimentalFeatures = usePersistedStore(
    (state) => state.experimentalFeatures,
  );
  const features = usePersistedStore((state) => state.features);
  const minimalMode = usePersistedStore((state) => state.minimalMode);
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
      const state = usePersistedStore.getState();
      await syncPluginRuntime(queryClient, state, {
        ...state,
        experimentalFeatures: {
          ...state.experimentalFeatures,
          [feature]: enabled,
        },
      });
      setExperimentalFeature(feature, enabled);
    },
  });

  return (
    <div className='space-y-4'>
      {EXPERIMENTAL_FEATURES.filter(
        (feature) => feature !== "plugins" || isPluginsBuilt(),
      ).map((feature) => {
        const blockedBy = blockedReason(
          feature,
          experimentalFeatures[feature],
          features,
          minimalMode,
        );
        return (
          <div
            className='rounded-lg border border-border bg-card p-4'
            key={feature}>
            <SettingToggleRow
              checked={experimentalFeatures[feature]}
              disabled={updateFeature.isPending}
              description={t(`featureFlags.features.${feature}.description`)}
              id={`experimental-${feature}`}
              notes={
                blockedBy && (
                  <p className='flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-1 text-amber-400 text-xs'>
                    <WarningCircleIcon
                      aria-hidden='true'
                      className='size-3.5 shrink-0'
                      weight='bold'
                    />
                    {t(`featureFlags.blockedBy.${blockedBy}`)}
                    <Button
                      className='h-auto p-0 text-xs'
                      onClick={onOpenFeatures}
                      size='sm'
                      variant='link'>
                      {t("featureFlags.openFeatures")}
                    </Button>
                  </p>
                )
              }
              onCheckedChange={(checked) =>
                updateFeature.mutate({ feature, enabled: checked })
              }
              title={t(`featureFlags.features.${feature}.title`)}
            />
          </div>
        );
      })}
    </div>
  );
};
