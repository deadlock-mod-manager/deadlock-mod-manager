import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef } from "react";
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
import { createModHealthRefreshQueue } from "@/lib/mods/mod-health-refresh";
import { usePersistedStore } from "@/lib/store";
import type { ModHealthProgress } from "@/types/generated/ModHealthProgress";
import type { RepairPlanProgress } from "@/types/generated/RepairPlanProgress";
import { ModStatus } from "@/types/mods";

/**
 * Keeps the mod health report current: checks once per profile after start,
 * rechecks every mod after a game update, and after any library change checks
 * the mods whose files changed and rebuilds the fixed mods' repair package.
 * Mounted once in app.tsx.
 */
export const ModHealthRenderer = () => {
  const queryClient = useQueryClient();
  const profileFolder = useActiveProfileFolder();
  const report = useModHealthReport(profileFolder);
  const check = useCheckModHealth();
  const { mutate: refreshFixes } = useRefreshModFixes();
  const setProgress = useModHealthProgress((state) => state.setProgress);
  const localMods = usePersistedStore((state) => state.localMods);
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

  useEffect(() => {
    if (!report.data || checkedProfiles.current.has(profileFolder)) return;
    checkedProfiles.current.add(profileFolder);
    const force =
      gameUpdatedSinceLastCheck(report.data) &&
      window.localStorage.getItem(forcedBuildStorageKey(profileFolder)) !==
        String(report.data.gameBuild);
    check({ profileFolder, force });
  }, [report.data, profileFolder, check]);

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
