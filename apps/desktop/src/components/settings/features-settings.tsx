import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  ChartLineUpIcon,
  CrosshairIcon,
  GaugeIcon,
  GlobeHemisphereWestIcon,
  HammerIcon,
  HardDrivesIcon,
  type Icon,
  PuzzlePieceIcon,
  TerminalWindowIcon,
  TShirtIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FeatureToggleRow } from "@/components/settings/feature-toggle-row";
import { MinimalModeCard } from "@/components/settings/minimal-mode-card";
import { useFeatureLeftovers } from "@/hooks/use-feature-leftovers";
import { OPTIONAL_FEATURES } from "@/lib/constants";
import { syncPluginRuntime } from "@/lib/external-plugins";
import {
  FEATURE_EXPERIMENTAL_FLAGS,
  isExperimentalFeatureOn,
  isFeatureEnabled,
  type OptionalFeature,
} from "@/lib/features";
import { isPluginsBuilt } from "@/lib/runtime-bootstrap";
import { type State, usePersistedStore } from "@/lib/store";

const FEATURE_GROUPS = ["matches", "customization", "tools"] as const;

// Icons match the sidebar entries each feature adds.
const FEATURE_DISPLAY = {
  stats: { group: "matches", icon: ChartLineUpIcon },
  "server-browser": { group: "matches", icon: HardDrivesIcon },
  "server-picker": { group: "matches", icon: GlobeHemisphereWestIcon },
  crosshairs: { group: "customization", icon: CrosshairIcon },
  skins: { group: "customization", icon: TShirtIcon },
  performance: { group: "customization", icon: GaugeIcon },
  foundry: { group: "tools", icon: HammerIcon },
  autoexec: { group: "tools", icon: TerminalWindowIcon },
  plugins: { group: "tools", icon: PuzzlePieceIcon },
} satisfies Record<
  OptionalFeature,
  { group: (typeof FEATURE_GROUPS)[number]; icon: Icon }
>;

type FeatureChange =
  | { kind: "feature"; feature: OptionalFeature; enabled: boolean }
  | { kind: "minimal"; enabled: boolean };

const applyChange = (state: State, change: FeatureChange): State =>
  change.kind === "minimal"
    ? { ...state, minimalMode: change.enabled }
    : {
        ...state,
        features: { ...state.features, [change.feature]: change.enabled },
      };

const BADGE_CLASS = "px-1.5 py-0 text-[10px] uppercase tracking-wide";

const featureBadge = (
  t: TFunction,
  { paused, flagOff }: { paused: boolean; flagOff: boolean },
  onOpenExperimental: () => void,
): ReactNode => {
  if (paused) {
    return (
      <Badge className={BADGE_CLASS} variant='outline'>
        {t("optionalFeatures.pausedBadge")}
      </Badge>
    );
  }
  if (!flagOff) return null;
  return (
    <>
      <Badge className={BADGE_CLASS} variant='outline'>
        {t("optionalFeatures.experimentalBadge")}
      </Badge>
      <Button
        className='h-auto p-0 text-xs'
        onClick={onOpenExperimental}
        size='sm'
        variant='link'>
        {t("optionalFeatures.turnOnExperimental")}
      </Button>
    </>
  );
};

export const FeaturesSettings = ({
  onOpenExperimental,
}: {
  onOpenExperimental: () => void;
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const features = usePersistedStore((state) => state.features);
  const minimalMode = usePersistedStore((state) => state.minimalMode);
  const experimentalFeatures = usePersistedStore(
    (state) => state.experimentalFeatures,
  );
  const setFeatureEnabled = usePersistedStore(
    (state) => state.setFeatureEnabled,
  );
  const setMinimalMode = usePersistedStore((state) => state.setMinimalMode);
  const markFeatureUsed = usePersistedStore((state) => state.markFeatureUsed);

  // Opening this tab puts Minimal DMM in front of the user, so its hint is done.
  useEffect(() => {
    markFeatureUsed("minimal-mode");
  }, [markFeatureUsed]);
  const updateFeatures = useMutation({
    mutationFn: async (change: FeatureChange) => {
      const state = usePersistedStore.getState();
      await syncPluginRuntime(queryClient, state, applyChange(state, change));
      if (change.kind === "minimal") {
        setMinimalMode(change.enabled);
      } else {
        setFeatureEnabled(change.feature, change.enabled);
      }
    },
  });

  const isFlagOff = (feature: OptionalFeature) => {
    const flag = FEATURE_EXPERIMENTAL_FLAGS[feature];
    return (
      flag !== null && !isExperimentalFeatureOn({ experimentalFeatures }, flag)
    );
  };
  // Builds without the plugin runtime have no plugins to turn off. Read at
  // render time: this module loads before the runtime bootstrap resolves.
  const visibleFeatures = OPTIONAL_FEATURES.filter(
    (feature) => feature !== "plugins" || isPluginsBuilt(),
  );
  const featureState = { features, experimentalFeatures, minimalMode };
  const leftoverFor = useFeatureLeftovers(
    (feature) => !isFeatureEnabled(featureState, feature),
  );
  // What Minimal DMM pauses, or what is on without it.
  const enabledCount = visibleFeatures.filter(
    (feature) => features[feature] && !isFlagOff(feature),
  ).length;

  return (
    <div className='space-y-6'>
      <MinimalModeCard
        checked={minimalMode}
        disabled={updateFeatures.isPending}
        enabledCount={enabledCount}
        onCheckedChange={(checked) =>
          updateFeatures.mutate({ kind: "minimal", enabled: checked })
        }
        total={visibleFeatures.length}
      />
      {FEATURE_GROUPS.map((group) => {
        const groupFeatures = visibleFeatures.filter(
          (feature) => FEATURE_DISPLAY[feature].group === group,
        );
        if (groupFeatures.length === 0) return null;
        return (
          <section aria-labelledby={`feature-group-${group}`} key={group}>
            <h4
              className='px-1 pb-2 font-semibold text-[11px] text-muted-foreground/70 uppercase tracking-wider'
              id={`feature-group-${group}`}>
              {t(`optionalFeatures.groups.${group}`)}
            </h4>
            <div className='divide-y divide-border overflow-hidden rounded-lg border border-border bg-card'>
              {groupFeatures.map((feature) => {
                // The user's choice is kept while the flag is off and
                // applies again once it is turned on.
                const flagOff = isFlagOff(feature);
                const paused = minimalMode && features[feature] && !flagOff;
                return (
                  <FeatureToggleRow
                    badge={featureBadge(
                      t,
                      { paused, flagOff },
                      onOpenExperimental,
                    )}
                    checked={isFeatureEnabled(featureState, feature)}
                    description={t(
                      `optionalFeatures.features.${feature}.description`,
                    )}
                    disabled={
                      flagOff || minimalMode || updateFeatures.isPending
                    }
                    icon={FEATURE_DISPLAY[feature].icon}
                    id={`feature-${feature}`}
                    key={feature}
                    leftover={leftoverFor(feature)}
                    onCheckedChange={(checked) =>
                      updateFeatures.mutate({
                        kind: "feature",
                        feature,
                        enabled: checked,
                      })
                    }
                    title={t(`optionalFeatures.features.${feature}.title`)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};
