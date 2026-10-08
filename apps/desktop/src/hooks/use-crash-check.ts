import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import { useRemovePerfConfig } from "@/hooks/performance/use-perf-mutations";
import { analytics } from "@/lib/analytics";
import { invokeGuarded, isGameRunningError } from "@/lib/game-guard";
import {
  SESSION_ENDED_EVENT,
  SESSION_STARTED_EVENT,
  acknowledgeSession,
  getPendingSessionReports,
  recordClientFingerprint,
  setSessionTrackingEnabled,
} from "@/lib/launch-health/api";
import { buildClientFingerprint } from "@/lib/launch-health/client-fingerprint";
import {
  type CrashCheckPrompt,
  planReports,
} from "@/lib/launch-health/evaluate";
import type {
  ClientModRef,
  SessionAckOutcome,
  SessionReport,
  SessionStartedEvent,
} from "@/lib/launch-health/types";
import logger from "@/lib/logger";
import { STALE_TIME_POLL } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import { isGameRunning } from "@/lib/tauri-commands";
import { ModStatus } from "@/types/mods";

const acknowledge = (sessionId: string, outcome: SessionAckOutcome) => {
  usePersistedStore.getState().markSessionAcknowledged(sessionId);
  void acknowledgeSession(sessionId, outcome).catch((error) => {
    logger
      .withMetadata({ sessionId, outcome })
      .withError(error)
      .warn("Failed to acknowledge game session");
  });
};

const attachClientFingerprint = (sessionId: string | null) => {
  const state = usePersistedStore.getState();
  const data = buildClientFingerprint(
    state.getActiveProfile(),
    state.localMods,
    state.isModEnabledInCurrentProfile,
  );
  if (!data) return;
  void recordClientFingerprint(sessionId, data).catch((error) => {
    logger.withError(error).warn("Failed to record the launch fingerprint");
  });
};

/**
 * Watches finished game sessions. A normal one becomes the baseline; an early
 * abnormal exit with changes since that baseline becomes a prompt with undo
 * actions. Mounted once, by the launch health renderer.
 */
export const useCrashCheck = () => {
  const { t } = useTranslation();
  const featureEnabled = useExperimentalFeature("performance-configs");
  const crashCheckEnabled = usePersistedStore(
    (state) => state.crashCheckEnabled,
  );
  const setCrashCheckEnabled = usePersistedStore(
    (state) => state.setCrashCheckEnabled,
  );
  const gamePath = usePersistedStore((state) => state.gamePath);
  const active = featureEnabled && crashCheckEnabled;
  const {
    mutate: removePerfConfig,
    mutateAsync: removePerfConfigAsync,
    isPending: turningOffConfig,
  } = useRemovePerfConfig();

  // useHeroDetection already polls this key every 5s; a second interval here
  // would double the process scans.
  const { data: gameRunning = false } = useQuery({
    queryKey: ["is-game-running"],
    queryFn: isGameRunning,
    staleTime: STALE_TIME_POLL,
    enabled: active && !!gamePath,
  });

  const [prompt, setPrompt] = useState<CrashCheckPrompt | null>(null);
  const [presented, setPresented] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [optOut, setOptOut] = useState(false);
  const [configTurnedOff, setConfigTurnedOff] = useState(false);
  const [modsDisabled, setModsDisabled] = useState(false);
  const promptRef = useRef<CrashCheckPrompt | null>(null);

  const show = useCallback((next: CrashCheckPrompt) => {
    promptRef.current = next;
    setPrompt(next);
    setPresented(false);
    setDialogOpen(false);
    setOptOut(false);
    setConfigTurnedOff(false);
    setModsDisabled(false);
  }, []);

  const clear = useCallback(() => {
    promptRef.current = null;
    setPrompt(null);
    setPresented(false);
    setDialogOpen(false);
  }, []);

  // A prompt that arrives while Deadlock runs again (restarted before the
  // crash was noticed) waits until the game closes.
  useEffect(() => {
    if (!prompt || presented || gameRunning) return;
    setPresented(true);
    setDialogOpen(prompt.decision.presentation === "dialog");
    analytics.track("crash_check_shown", {
      classification:
        prompt.report.classification === "crash" ? "crash" : "ambiguous",
      change_count: prompt.decision.changes.length,
      uptime_seconds: prompt.report.uptimeSecs ?? undefined,
    });
  }, [prompt, presented, gameRunning]);

  const handleReports = useCallback(
    (reports: SessionReport[]) => {
      const state = usePersistedStore.getState();
      const shown = promptRef.current;
      const plan = planReports(
        reports.filter(
          (report) => report.sessionId !== shown?.report.sessionId,
        ),
        state.lastNormalFingerprint,
        new Set(state.acknowledgedSessionIds),
      );
      if (plan.newBaseline) state.setLastNormalFingerprint(plan.newBaseline);
      for (const { sessionId, outcome } of plan.acknowledgements) {
        acknowledge(sessionId, outcome);
      }
      // A newer crash, or a normal session since, makes the open one stale.
      if (shown && (plan.prompt || plan.newBaseline)) {
        acknowledge(shown.report.sessionId, "superseded");
        clear();
      }
      if (plan.prompt) show(plan.prompt);
    },
    [clear, show],
  );

  useEffect(() => {
    void setSessionTrackingEnabled(active).catch((error) => {
      logger.withError(error).warn("Failed to sync the crash check setting");
    });
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    const stops: UnlistenFn[] = [];
    const keep = (stop: UnlistenFn) => {
      if (disposed) stop();
      else stops.push(stop);
    };
    // A session that was already running when the app started.
    attachClientFingerprint(null);
    // Pending reports are read only once the listeners are live, so a session
    // that ends in between isn't missed until the next start.
    void Promise.all([
      listen<SessionReport>(SESSION_ENDED_EVENT, (event) =>
        handleReports([event.payload]),
      ).then(keep),
      listen<SessionStartedEvent>(SESSION_STARTED_EVENT, (event) =>
        attachClientFingerprint(event.payload.sessionId),
      ).then(keep),
    ])
      .then(() => (disposed ? [] : getPendingSessionReports()))
      .then((reports) => {
        if (!disposed) handleReports(reports);
      })
      .catch((error) => {
        logger.withError(error).warn("Failed to load finished game sessions");
      });
    return () => {
      disposed = true;
      for (const stop of stops) stop();
    };
  }, [active, handleReports]);

  /** Ends the prompt; every way out goes through here. */
  const resolve = useCallback(
    (outcome: SessionAckOutcome) => {
      const current = promptRef.current;
      if (!current) return;
      acknowledge(current.report.sessionId, outcome);
      if (outcome === "closedByUser") {
        usePersistedStore
          .getState()
          .setLastNormalFingerprint(current.report.fingerprint);
      }
      if (optOut) {
        setCrashCheckEnabled(false);
        analytics.track("crash_check_action", { action: "opt_out" });
      }
      clear();
    },
    [clear, optOut, setCrashCheckEnabled],
  );

  const markConfigTurnedOff = useCallback(() => {
    setConfigTurnedOff(true);
    analytics.track("crash_check_action", { action: "turn_off_config" });
  }, []);

  // The remove mutation reports its own failures.
  const turnOffConfig = useCallback(() => {
    removePerfConfig(
      { entryPoint: "crash_check" },
      { onSuccess: markConfigTurnedOff },
    );
  }, [markConfigTurnedOff, removePerfConfig]);

  const disableMods = useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async (mods: ClientModRef[]) => {
      const state = usePersistedStore.getState();
      const profileFolder = state.getActiveProfile()?.folderName ?? null;
      const ids = new Set(mods.map((mod) => mod.remoteId));
      const targets = state.localMods.filter(
        (mod) =>
          ids.has(mod.remoteId) &&
          mod.status === ModStatus.Installed &&
          state.isModEnabledInCurrentProfile(mod.remoteId),
      );
      for (const mod of targets) {
        await invokeGuarded("uninstall_mod", {
          modId: mod.remoteId,
          vpks: mod.installedVpks ?? [],
          profileFolder,
        });
        state.setModStatus(mod.remoteId, ModStatus.Downloaded);
        state.setModEnabledInCurrentProfile(mod.remoteId, false);
      }
      return targets.length;
    },
    onSuccess: (count) => {
      setModsDisabled(true);
      analytics.track("crash_check_action", { action: "disable_mods" });
      toast.success(t("launchHealth.toasts.modsDisabled", { count }));
    },
    onError: (error) => {
      if (isGameRunningError(error)) return;
      logger
        .withError(error)
        .error("Disabling mods from the crash check failed");
      toast.error(t("launchHealth.toasts.disableFailed"));
    },
  });

  /** Returns the report to relaunch for, or `null` once the prompt is gone. */
  const prepareRelaunch = useCallback(
    async (turnOffConfigFirst: boolean): Promise<SessionReport | null> => {
      const current = promptRef.current;
      if (!current) return null;
      if (turnOffConfigFirst && !configTurnedOff) {
        await removePerfConfigAsync({ entryPoint: "crash_check" });
        markConfigTurnedOff();
      }
      analytics.track("crash_check_action", { action: "relaunch" });
      resolve("actedOn");
      return current.report;
    },
    [configTurnedOff, markConfigTurnedOff, removePerfConfigAsync, resolve],
  );

  const closedByUser = useCallback(() => {
    analytics.track("crash_check_action", { action: "closed_by_user" });
    resolve("closedByUser");
  }, [resolve]);

  const dismiss = useCallback(() => {
    analytics.track("crash_check_action", { action: "dismiss" });
    resolve(configTurnedOff || modsDisabled ? "actedOn" : "dismissed");
  }, [configTurnedOff, modsDisabled, resolve]);

  const openDialog = useCallback(() => setDialogOpen(true), []);

  return {
    prompt: presented ? prompt : null,
    gameRunning,
    dialogOpen,
    openDialog,
    optOut,
    setOptOut,
    configTurnedOff,
    modsDisabled,
    turnOffConfig,
    turningOffConfig,
    disableMods,
    prepareRelaunch,
    closedByUser,
    dismiss,
  };
};

export type CrashCheck = ReturnType<typeof useCrashCheck>;
