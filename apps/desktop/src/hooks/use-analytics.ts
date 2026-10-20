import { useLayoutEffect, useMemo } from "react";
import useAbout from "@/hooks/use-about";
import { useHardwareId } from "@/hooks/use-hardware-id";
import {
  analytics,
  configureAnalytics,
  identifyAnalytics,
} from "@/lib/analytics";
import { usePersistedStore } from "@/lib/store";

export interface UseAnalyticsReturn {
  track: typeof analytics.track;
  isEnabled: boolean;
}

export const useAnalytics = (): UseAnalyticsReturn => {
  const enabled = usePersistedStore(
    (state) => state.telemetrySettings.analyticsEnabled,
  );
  const { data } = useAbout();
  const { hardwareId } = useHardwareId();
  useLayoutEffect(() => {
    if (data) configureAnalytics(data.version, data.releaseChannel);
  }, [data]);
  useLayoutEffect(() => {
    if (hardwareId) identifyAnalytics(hardwareId);
  }, [hardwareId]);
  const isEnabled =
    enabled &&
    !!data &&
    !!hardwareId &&
    !!import.meta.env.VITE_GA_MEASUREMENT_ID &&
    !import.meta.env.DEV &&
    import.meta.env.VITE_DMM_E2E_HARNESS !== "1";
  return useMemo(
    () => ({
      track: analytics.track,
      isEnabled,
    }),
    [isEnabled],
  );
};
