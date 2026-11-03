import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useActiveProfileFolder,
  useCheckModHealth,
  useGameRunning,
  useModHealthProgress,
  useModHealthReport,
  useRefreshModFixes,
  useRepairPlanProgress,
} from "@/hooks/use-mod-health";
import { didGameExit } from "@/lib/gameinfo-auto-reset";
import logger from "@/lib/logger";
import { gameUpdatedSinceLastCheck } from "@/lib/mods/mod-health";
import {
  forcedBuildStorageKey,
  invalidateModHealth,
} from "@/lib/mods/mod-health-queries";
import {
  createActivationTracker,
  createModHealthRefreshQueue,
} from "@/lib/mods/mod-health-refresh";
import { usePersistedStore } from "@/lib/store";
import type { ModHealthProgress } from "@/types/generated/ModHealthProgress";
import type { RepairPlanProgress } from "@/types/generated/RepairPlanProgress";
import { ModStatus } from "@/types/mods";

/**
 * Keeps the mod health report current: checks once per profile after start,
 * rechecks every mod after a game update, and after any library change or game
 * exit checks the mods whose files changed. It rebuilds the fixed mods' repair
 * package after any library change, when a profile becomes active, when a check
 * saves newly observed game data, and whenever the game exits, since each of
 * those can leave the saved package stale. Mounted once in app.tsx.
 */
export const ModHealthRenderer = () => {
  const queryClient = useQueryClient();
  const profileFolder = useActiveProfileFolder();
  const report = useModHealthReport(profileFolder);
  const check = useCheckModHealth();
  const { mutate: refreshFixes } = useRefreshModFixes();
  const setProgress = useModHealthProgress((state) => state.setProgress);
  const localMods = usePersistedStore((state) => state.localMods);
  const gamePath = usePersistedStore((state) => state.gamePath);
  const gameRunning = useGameRunning();
  const previousGameRunning = useRef(gameRunning);
  const [historyReady, setHistoryReady] = useState(false);
  const shouldRefreshActivation = useMemo(createActivationTracker, []);
  const checkedProfiles = useRef(new Set<string | null>());
  const previousInstalled = useRef<ReadonlyMap<string, string> | null>(null);
  const refreshQueue = useMemo(
    () =>
      createModHealthRefreshQueue({
        refreshFixes,
        checkHealth: (folder) => check({ profileFolder: folder }),
      }),
    [refreshFixes, check],
  );

  useEffect(() => () => refreshQueue.cancelAll(), [refreshQueue]);

  useEffect(() => {
    const unlisten = listen<ModHealthProgress>("mod-health-progress", (event) =>
      setProgress(event.payload),
    );
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [setProgress]);

  useEffect(() => {
    const unlisten = listen<RepairPlanProgress>(
      "repair-plan-progress",
      (event) => useRepairPlanProgress.getState().setProgress(event.payload),
    );
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);

  useEffect(() => {
    let active = true;
    const unlisten = listen<string | null>(
      "mod-compatibility-changed",
      ({ payload: folder }) => {
        if (!active) return;
        void invalidateModHealth(queryClient);
        refreshQueue.schedule(folder);
      },
    );
    return () => {
      active = false;
      void unlisten.then((stop) => stop());
    };
  }, [queryClient, refreshQueue]);

  // Rebuilds skipped while the game ran are applied once it exits; the backend
  // returns early when the package is already current.
  useEffect(() => {
    const previous = previousGameRunning.current;
    previousGameRunning.current = gameRunning;
    if (didGameExit(previous, gameRunning))
      refreshQueue.schedule(profileFolder);
  }, [gameRunning, profileFolder, refreshQueue]);

  // A check that learns game data stales every receipt on this install, so
  // startup work waits until this listener is registered and can't miss it.
  // If registering fails, learned-data rebuilds wait for the next start or
  // library change, but the startup check and refresh still run.
  useEffect(() => {
    let active = true;
    const unlisten = listen("compatibility-history-changed", () => {
      if (!active) return;
      void invalidateModHealth(queryClient);
      const { profiles, activeProfileId } = usePersistedStore.getState();
      refreshQueue.schedule(profiles[activeProfileId]?.folderName ?? null);
    }).catch((error) => {
      logger
        .withError(error)
        .warn("Could not listen for compatibility history changes");
      return null;
    });
    void unlisten.then(() => {
      if (active) setHistoryReady(true);
    });
    return () => {
      active = false;
      void unlisten.then((stop) => stop?.());
    };
  }, [queryClient, refreshQueue]);

  useEffect(() => {
    if (
      !report.data ||
      !historyReady ||
      checkedProfiles.current.has(profileFolder)
    )
      return;
    checkedProfiles.current.add(profileFolder);
    const force =
      gameUpdatedSinceLastCheck(report.data) &&
      window.localStorage.getItem(forcedBuildStorageKey(profileFolder)) !==
        String(report.data.gameBuild);
    check({ profileFolder, force });
  }, [report.data, historyReady, profileFolder, check]);

  // The game or app may have changed while DMM was closed or this profile was
  // inactive. A current package costs only a stamp comparison.
  useEffect(() => {
    if (!gamePath || !report.data || !historyReady) return;
    if (shouldRefreshActivation({ gamePath, profileFolder })) {
      refreshQueue.schedule(profileFolder);
    }
  }, [
    gamePath,
    report.data,
    historyReady,
    profileFolder,
    refreshQueue,
    shouldRefreshActivation,
  ]);

  const installed = useMemo(
    () =>
      new Map(
        localMods
          .filter((mod) => mod.status === ModStatus.Installed)
          .map((mod) => [mod.remoteId, (mod.installedVpks ?? []).join("|")]),
      ),
    [localMods],
  );

  useEffect(() => {
    const before = previousInstalled.current;
    previousInstalled.current = installed;
    if (!before) return;
    if (
      installed.size !== before.size ||
      [...installed].some(([modId, vpks]) => before.get(modId) !== vpks)
    ) {
      refreshQueue.schedule(profileFolder);
    }
  }, [installed, profileFolder, refreshQueue]);

  return null;
};
