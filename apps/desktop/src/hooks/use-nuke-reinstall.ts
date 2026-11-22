import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";
import {
  type ReinstallOutcome,
  useReinstallMod,
} from "@/hooks/use-reinstall-mod";
import { getErrorMessage } from "@/lib/errors";
import i18n from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import { isLocalMod } from "@/lib/mods/installed-helpers";
import { usePersistedStore } from "@/lib/store";
import { type LocalMod, ModStatus } from "@/types/mods";
import type { KeptChoices } from "@/types/generated/KeptChoices";
import { invokeGuarded } from "@/lib/game-guard";

const logger = createLogger("nuke-reinstall");

export type NukePhase =
  | "idle"
  | "snapshot"
  | "backingUp"
  | "backupFailed"
  | "purging"
  | "clearingCache"
  | "clearingState"
  | "reinstalling"
  | "done"
  | "failed";

export type NukeModOutcome =
  | "pending"
  | "downloading"
  | "installing"
  | ReinstallOutcome;

export type NukeModEntry = {
  remoteId: string;
  name: string;
  wasInstalled: boolean;
  outcome: NukeModOutcome;
  error?: string;
};

export type NukeState = {
  phase: NukePhase;
  progress: number;
  currentMod: string | null;
  mods: NukeModEntry[];
  error?: string;
  isRunning: boolean;
  cancelRequested: boolean;
};

const INITIAL_STATE: NukeState = {
  phase: "idle",
  progress: 0,
  currentMod: null,
  mods: [],
  isRunning: false,
  cancelRequested: false,
};

export const useNukeReinstall = () => {
  const [state, setState] = useState<NukeState>(INITIAL_STATE);
  const cancelRef = useRef(false);
  const targetsRef = useRef<LocalMod[]>([]);
  const keptChoicesRef = useRef(new Map<string, KeptChoices>());
  const { reinstallMod } = useReinstallMod();

  const patchMod = useCallback(
    (remoteId: string, patch: Partial<NukeModEntry>) => {
      setState((current) => ({
        ...current,
        mods: current.mods.map((entry) =>
          entry.remoteId === remoteId ? { ...entry, ...patch } : entry,
        ),
      }));
    },
    [],
  );

  const requestCancel = useCallback(() => {
    cancelRef.current = true;
    setState((current) => ({ ...current, cancelRequested: true }));
  }, []);

  const reset = useCallback(() => {
    cancelRef.current = false;
    targetsRef.current = [];
    keptChoicesRef.current = new Map();
    setState(INITIAL_STATE);
  }, []);

  const reinstallTargets = useCallback(
    async (targets: LocalMod[], startUnits: number, totalUnits: number) => {
      const setProgress = (units: number, fraction = 0) => {
        setState((current) => ({
          ...current,
          progress: Math.min(100, ((units + fraction) / totalUnits) * 100),
        }));
      };

      setState((current) => ({ ...current, phase: "reinstalling" }));
      for (const [index, mod] of targets.entries()) {
        if (cancelRef.current) {
          logger.info("Nuke & reinstall cancelled by user");
          break;
        }

        setState((current) => ({ ...current, currentMod: mod.name }));
        patchMod(mod.remoteId, { outcome: "pending", error: undefined });
        const modUnits = startUnits + index * 2;

        const result = await reinstallMod(mod, {
          skipPurge: true,
          keptChoices: keptChoicesRef.current.get(mod.remoteId),
          onStep: (step) => {
            if (step === "purging") {
              return;
            }
            patchMod(mod.remoteId, { outcome: step });
            setProgress(modUnits + (step === "installing" ? 1 : 0));
          },
          onDownloadProgress: (fraction) => setProgress(modUnits, fraction),
        });

        setProgress(modUnits + 2);
        patchMod(mod.remoteId, {
          outcome: result.outcome,
          error: result.error,
        });
      }

      setState((current) => ({ ...current, progress: 100 }));
    },
    [reinstallMod, patchMod],
  );

  const run = useCallback(async () => {
    try {
      const store = usePersistedStore.getState();
      const profileFolder = store.getActiveProfile()?.folderName ?? null;

      const snapshot = [...store.localMods];
      const localMods = snapshot.filter(isLocalMod);
      const targets = snapshot
        .filter((mod) => !isLocalMod(mod))
        .sort((a, b) => (a.installOrder ?? 0) - (b.installOrder ?? 0));
      targetsRef.current = targets;
      keptChoicesRef.current = new Map();

      cancelRef.current = false;
      setState({
        ...INITIAL_STATE,
        phase: "snapshot",
        isRunning: true,
        mods: targets.map((mod) => ({
          remoteId: mod.remoteId,
          name: mod.name,
          wasInstalled: mod.status === ModStatus.Installed,
          outcome: "pending",
        })),
      });

      logger
        .withMetadata({
          total: snapshot.length,
          reinstallable: targets.length,
          localMods: localMods.length,
          profileFolder,
        })
        .info("Starting nuke & reinstall");

      const totalUnits = targets.length * 3 + 3;
      let completedUnits = 0;
      const setProgress = (fraction = 0) => {
        setState((current) => ({
          ...current,
          progress: Math.min(
            100,
            ((completedUnits + fraction) / totalUnits) * 100,
          ),
        }));
      };

      setState((current) => ({ ...current, phase: "backingUp" }));
      try {
        await invoke("create_addons_backup", {
          maxBackups: store.maxBackupCount,
        });
      } catch (error) {
        logger.withError(error).error("Backup before nuke failed");
        setState((current) => ({
          ...current,
          phase: "backupFailed",
          error: getErrorMessage(error),
        }));
        return;
      }
      completedUnits += 1;
      setProgress();

      setState((current) => ({ ...current, phase: "purging" }));
      for (const [index, mod] of targets.entries()) {
        setState((current) => ({ ...current, currentMod: mod.name }));
        try {
          const kept = await invokeGuarded<KeptChoices | null>("purge_mod", {
            modId: mod.remoteId,
            vpks: mod.installedVpks ?? [],
            profileFolder,
          });
          if (kept) keptChoicesRef.current.set(mod.remoteId, kept);
        } catch (error) {
          for (const purged of targets.slice(0, index)) {
            patchMod(purged.remoteId, {
              outcome: "failed",
              error: i18n.t("nuke.removedBeforeStop"),
            });
          }
          throw error;
        }
        completedUnits += 1;
        setProgress();
      }
      setState((current) => ({ ...current, currentMod: null }));

      setState((current) => ({ ...current, phase: "clearingCache" }));
      try {
        await invoke<number>("clear_download_cache");
      } catch (error) {
        logger
          .withError(error)
          .warn("Failed to clear download cache during nuke");
      }
      completedUnits += 1;
      setProgress();

      setState((current) => ({ ...current, phase: "clearingState" }));
      usePersistedStore
        .getState()
        .nukeModsState(localMods.map((m) => m.remoteId));
      completedUnits += 1;
      setProgress();

      await reinstallTargets(targets, completedUnits, totalUnits);

      logger.info("Nuke & reinstall finished");
    } catch (error) {
      logger.withError(error).error("Nuke & reinstall failed");
      setState((current) => ({
        ...current,
        phase: "failed",
        error: getErrorMessage(error),
      }));
    } finally {
      setState((current) => ({
        ...current,
        phase:
          current.phase === "failed" || current.phase === "backupFailed"
            ? current.phase
            : "done",
        currentMod: null,
        isRunning: false,
      }));
    }
  }, [reinstallTargets, patchMod]);

  const retryFailed = useCallback(async () => {
    const failedIds = new Set(
      state.mods
        .filter((entry) => entry.outcome === "failed")
        .map((entry) => entry.remoteId),
    );
    const targets = targetsRef.current.filter((mod) =>
      failedIds.has(mod.remoteId),
    );
    if (targets.length === 0) {
      return;
    }

    cancelRef.current = false;
    setState((current) => ({
      ...current,
      isRunning: true,
      cancelRequested: false,
      progress: 0,
      error: undefined,
    }));
    logger
      .withMetadata({ count: targets.length })
      .info("Retrying failed nuke reinstalls");

    try {
      await reinstallTargets(targets, 0, targets.length * 2);
    } catch (error) {
      logger.withError(error).error("Retrying failed reinstalls failed");
      setState((current) => ({
        ...current,
        phase: "failed",
        error: getErrorMessage(error),
      }));
    } finally {
      setState((current) => ({
        ...current,
        phase: current.phase === "failed" ? "failed" : "done",
        currentMod: null,
        isRunning: false,
      }));
    }
  }, [state.mods, reinstallTargets]);

  return { state, run, reset, requestCancel, retryFailed };
};
