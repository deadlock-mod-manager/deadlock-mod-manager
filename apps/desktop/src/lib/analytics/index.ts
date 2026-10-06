import { createInstallTracker } from "./install";
import ReactGA from "react-ga4";
import { platform } from "@tauri-apps/plugin-os";
import { usePersistedStore } from "@/lib/store";
import {
  createAnalyticsClient,
  type AnalyticsProperties,
  type AnalyticsEntryPoint,
  type AnalyticsMilestone,
} from "./client";

const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
let version: string | undefined;
let releaseChannel = "unknown";
let consentEpoch = 0;
let initialized = false;
const modSources = new Map<string, AnalyticsEntryPoint>();

const isEnabled = () =>
  !!measurementId &&
  !import.meta.env.DEV &&
  import.meta.env.VITE_DMM_E2E_HARNESS !== "1" &&
  usePersistedStore.getState().telemetrySettings.analyticsEnabled;
const syncConsent = () => {
  if (typeof window !== "undefined" && measurementId) {
    Object.defineProperty(window, `ga-disable-${measurementId}`, {
      value: !isEnabled() || !version,
      configurable: true,
      writable: true,
    });
  }
};
usePersistedStore.subscribe((state, previous) => {
  if (
    state.telemetrySettings.analyticsEnabled !==
    previous.telemetrySettings.analyticsEnabled
  ) {
    consentEpoch += 1;
    modSources.clear();
    syncConsent();
  }
});
syncConsent();

export const configureAnalytics = (appVersion: string, channel: string) => {
  version = appVersion;
  releaseChannel = channel;
  syncConsent();
};

const initialize = () => {
  if (!initialized && measurementId) {
    ReactGA.initialize(measurementId, {
      gtagOptions: {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      },
    });
    initialized = true;
  }
};

export const analyticsClient = createAnalyticsClient({
  getContext: () => ({
    enabled: isEnabled(),
    version,
    os: platform(),
    releaseChannel,
    consentEpoch,
  }),
  send: (event, properties) => {
    initialize();
    ReactGA.event(event, properties);
  },
  now: () => Date.now(),
  createId: () => crypto.randomUUID(),
});

export const captureAnalytics = async (
  event: string,
  properties?: AnalyticsProperties,
): Promise<void> => {
  analyticsClient.capture(event, properties);
};

export const identifyAnalytics = async (distinctId: string): Promise<void> => {
  if (!isEnabled() || !version) return;
  try {
    initialize();
    ReactGA.set({ userId: distinctId });
  } catch {
    // Analytics must never block a user action.
  }
};

export const rememberModEntryPoint = (
  modId: string,
  source: AnalyticsEntryPoint,
) => {
  if (isEnabled() && version) modSources.set(modId, source);
};
export const getModEntryPoint = (
  modId: string,
  fallback: AnalyticsEntryPoint = "other",
) => modSources.get(modId) ?? fallback;

export const captureMilestone = (
  milestone: AnalyticsMilestone,
  properties?: AnalyticsProperties,
) => {
  try {
    const state = usePersistedStore.getState();
    if (state.telemetrySettings.analyticsMilestones?.[milestone]) return;
    if (analyticsClient.capture(milestone, properties)) {
      state.updateTelemetrySettings({
        analyticsMilestones: {
          ...state.telemetrySettings.analyticsMilestones,
          [milestone]: true,
        },
      });
    }
  } catch {
    // A failed persistence write must not interrupt installation or launch.
  }
};

export const trackAppReady = async (
  properties?: AnalyticsProperties,
): Promise<void> => {
  if (analyticsClient.capture("app_ready", properties)) {
    captureMilestone("first_eligible_use", {
      has_existing_mods: usePersistedStore.getState().localMods.length > 0,
    });
  }
};

export const trackInstallOptions = createInstallTracker({
  start: analyticsClient.start,
  getModEntryPoint,
  captureMilestone,
});
