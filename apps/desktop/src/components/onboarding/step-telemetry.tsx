import { useCallback, useEffect, useRef, useState } from "react";
import { TelemetryConsentContent } from "@/components/telemetry/telemetry-consent-content";
import { usePersistedStore } from "@/lib/store";

type TelemetryStepProps = {
  onComplete: () => void;
};

export const OnboardingStepTelemetry = ({ onComplete }: TelemetryStepProps) => {
  const updateTelemetrySettings = usePersistedStore(
    (state) => state.updateTelemetrySettings,
  );
  const [analyticsEnabled, setAnalyticsEnabled] = useState(() => {
    const settings = usePersistedStore.getState().telemetrySettings;
    return settings.hasSeenTelemetryPrompt ? settings.analyticsEnabled : true;
  });
  const analyticsEnabledRef = useRef(analyticsEnabled);

  useEffect(() => {
    onComplete();

    return () => {
      updateTelemetrySettings({
        analyticsEnabled: analyticsEnabledRef.current,
        hasSeenTelemetryPrompt: true,
      });
    };
  }, [onComplete, updateTelemetrySettings]);

  const handleAnalyticsEnabledChange = useCallback((enabled: boolean) => {
    setAnalyticsEnabled(enabled);
    analyticsEnabledRef.current = enabled;
  }, []);

  return (
    <TelemetryConsentContent
      analyticsEnabled={analyticsEnabled}
      onAnalyticsEnabledChange={handleAnalyticsEnabledChange}
      showSwitch
    />
  );
};
