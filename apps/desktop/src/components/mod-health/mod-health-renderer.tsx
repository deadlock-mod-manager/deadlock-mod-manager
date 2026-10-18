import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef } from "react";
import {
  useActiveProfileFolder,
  useCheckModHealth,
  useModHealthProgress,
  useModHealthReport,
} from "@/hooks/use-mod-health";
import { gameUpdatedSinceLastCheck } from "@/lib/mods/mod-health";
import { usePersistedStore } from "@/lib/store";
import type { ModHealthProgress } from "@/types/generated/ModHealthProgress";
import { ModStatus } from "@/types/mods";

const FORCED_BUILD_STORAGE_KEY = "mod-health.forced-game-build";
// Enable all and collection installs land one mod at a time.
const INSTALL_CHECK_DELAY_MS = 1500;

/**
 * Keeps the mod health report current: checks once per profile after start,
 * rechecks every mod after a game update, and checks newly installed files.
 * Mounted once in app.tsx.
 */
export const ModHealthRenderer = () => {
  const profileFolder = useActiveProfileFolder();
  const report = useModHealthReport(profileFolder);
  const check = useCheckModHealth();
  const setProgress = useModHealthProgress((state) => state.setProgress);
  const localMods = usePersistedStore((state) => state.localMods);
  const checkedProfiles = useRef(new Set<string | null>());
  const previousInstalled = useRef<ReadonlyMap<string, string> | null>(null);
  const pendingModIds = useRef(new Set<string>());

  useEffect(() => {
    const unlisten = listen<ModHealthProgress>("mod-health-progress", (event) =>
      setProgress(event.payload),
    );
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [setProgress]);

  useEffect(() => {
    if (!report.data || checkedProfiles.current.has(profileFolder)) return;
    checkedProfiles.current.add(profileFolder);
    // previousGameBuild still names the old build after the recheck, so the
    // forced run is remembered per build instead of repeating on every start.
    const build = String(report.data.gameBuild);
    const force =
      gameUpdatedSinceLastCheck(report.data) &&
      window.localStorage.getItem(FORCED_BUILD_STORAGE_KEY) !== build;
    if (force) window.localStorage.setItem(FORCED_BUILD_STORAGE_KEY, build);
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
    for (const [modId, vpks] of installed) {
      if (before.get(modId) !== vpks) pendingModIds.current.add(modId);
    }
    if (pendingModIds.current.size === 0) return;
    const timer = setTimeout(() => {
      const modIds = [...pendingModIds.current];
      pendingModIds.current.clear();
      check({ profileFolder, modIds });
    }, INSTALL_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [installed, profileFolder, check]);

  return null;
};
