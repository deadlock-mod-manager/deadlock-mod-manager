import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { usePerfStatus } from "@/hooks/performance/use-perf-queries";
import { serverPickerStateQuery } from "@/hooks/use-server-picker";
import type { OptionalFeature } from "@/lib/features";
import { usePersistedStore } from "@/lib/store";

/**
 * Turning a feature off only hides it. This describes what a hidden feature
 * still leaves applied to the game, which only its own page can undo.
 */
export const useFeatureLeftovers = (
  isOff: (feature: OptionalFeature) => boolean,
) => {
  const { t } = useTranslation();
  const perfStatus = usePerfStatus(isOff("performance"));
  const serverPicker = useQuery({
    ...serverPickerStateQuery,
    enabled: isOff("server-picker"),
  });
  const crosshairApplied = usePersistedStore(
    (state) => state.crosshairsEnabled && state.activeCrosshair !== null,
  );

  return (feature: OptionalFeature): string | null => {
    if (!isOff(feature)) return null;
    switch (feature) {
      case "performance":
        return perfStatus.data?.applied
          ? t("optionalFeatures.leftovers.performance")
          : null;
      case "server-picker": {
        const count = serverPicker.data?.blockedLocations.length ?? 0;
        return count > 0
          ? t("optionalFeatures.leftovers.serverPicker", { count })
          : null;
      }
      case "crosshairs":
        return crosshairApplied
          ? t("optionalFeatures.leftovers.crosshairs")
          : null;
      default:
        return null;
    }
  };
};
