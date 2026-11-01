import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useActiveProfileFolder,
  useCheckModHealth,
  useModHealthProgress,
  useModHealthReport,
  useRefreshModFixes,
  useRepairPlanProgress,
} from "@/hooks/use-mod-health";
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
 * rechecks every mod after a game update, and checks newly installed files.
 * It rebuilds the fixed mods' repair package after any library change, when a
 * profile becomes active, and when a check saves newly observed game data,
 * since each of those can leave the saved package stale. Mounted once in
 * app.tsx.
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
  const [historyReady, setHistoryReady] = useState(false);
  const shouldRefreshActivation = useMemo(createActivationTracker, []);
  const checkedProfiles = useRef(new Set<string | null>());
  const previousInstalled = useRef<ReadonlyMap<string, string> | null>(null);
  const refreshQueue = useMemo(
    () =>
      createModHealthRefreshQueue((folder, modIds) => {
        refreshFixes(folder);
        if (modIds.length > 0) check({ profileFolder: folder, modIds });
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

  // A check that learns game data stales every receipt on this install, so
  // startup work waits until this listener is registered and can't miss it.
  useEffect(() => {
    let active = true;
    const unlisten = listen("compatibility-history-changed", () => {
      if (!active) return;
      void invalidateModHealth(queryClient);
      const { profiles, activeProfileId } = usePersistedStore.getState();
      refreshQueue.schedule(profiles[activeProfileId]?.folderName ?? null);
    });
    void unlisten.then(() => {
      if (active) setHistoryReady(true);
    });
    return () => {
      active = false;
      void unlisten.then((stop) => stop());
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
    const modIds = [...installed]
      .filter(([modId, vpks]) => before.get(modId) !== vpks)
      .map(([modId]) => modId);
    if (
      modIds.length > 0 ||
      [...before.keys()].some((modId) => !installed.has(modId))
    ) {
      refreshQueue.schedule(profileFolder, modIds);
    }
  }, [installed, profileFolder, refreshQueue]);

  return null;
};
