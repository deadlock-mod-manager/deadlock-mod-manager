import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";
import {
  type ReinstallOutcome,
  useReinstallMod,
} from "@/hooks/use-reinstall-mod";
import { getErrorMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { isLocalMod } from "@/lib/mods/installed-helpers";
import { usePersistedStore } from "@/lib/store";
import { type LocalMod, ModStatus } from "@/types/mods";
import { invokeGuarded, isGameRunningError } from "@/lib/game-guard";

const logger = createLogger("nuke-reinstall");

export type NukePhase =
  | "idle"
  | "snapshot"
  | "backingUp"
  /** The safety backup failed, so the run stopped before deleting anything. */
  | "backupFailed"
  | "purging"
  | "clearingCache"
  | "clearingState"
  | "reinstalling"
  | "done"
  /** Aborted by an unexpected error - the state is left half-rebuilt. */
  | "failed";

export type NukeModOutcome =
  | "pending"
  | "downloading"
  | "installing"
  | ReinstallOutcome;

export type NukeModEntry = {
  remoteId: string;
  name: string;
  /** Was it installed into the game folder, or only downloaded? */
  wasInstalled: boolean;
  outcome: NukeModOutcome;
  error?: string;
};

export type NukeState = {
  phase: NukePhase;
  /** 0-100 across the whole operation. */
  progress: number;
  currentMod: string | null;
  mods: NukeModEntry[];
  /** Mods that were already gone from disk - expected, not an error. */
  missingOnDisk: number;
  /** Set when the run itself broke down, not just a single mod. */
  error?: string;
  isRunning: boolean;
  cancelRequested: boolean;
};

const INITIAL_STATE: NukeState = {
  phase: "idle",
  progress: 0,
  currentMod: null,
  mods: [],
  missingOnDisk: 0,
  isRunning: false,
  cancelRequested: false,
};

/**
 * The mod manager's state and the game folder drift apart over time: mods get
 * deleted by hand, installs half-fail, the VPK ledger stops matching reality.
 * This takes the mods the manager *thinks* it has, wipes cache, state and the
 * files on disk, and rebuilds that list from scratch.
 *
 * Purge failures are expected - a mod the manager believes in may not be on
 * disk at all - so they are counted, never fatal.
 */
export const useNukeReinstall = () => {
  const [state, setState] = useState<NukeState>(INITIAL_STATE);
  const cancelRef = useRef(false);
  /** The pre-nuke records, kept so failed mods can be retried after the run. */
  const targetsRef = useRef<LocalMod[]>([]);
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
    setState(INITIAL_STATE);
  }, []);

  /**
   * Downloads and installs each target in order. Progress runs from
   * `startUnits` to `totalUnits`, two units (download, install) per mod.
   */
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
          // Files were wiped by the purge phase, or never landed on a retry.
          skipPurge: true,
          onStep: (step) => {
            if (step === "purging") {
              return;
            }
            patchMod(mod.remoteId, { outcome: step });
            // The download unit is done once installing starts.
            setProgress(modUnits + (step === "installing" ? 1 : 0));
          },
          onDownloadProgress: (fraction) => setProgress(modUnits, fraction),
        });

        // Both units are settled for this mod, however it turned out.
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

      // Snapshot first: everything below deletes the state we are reading here.
      const snapshot = [...store.localMods];
      const localMods = snapshot.filter(isLocalMod);
      // Restoring in the original install order makes the backend hand out the
      // same pak numbers again, so load order survives the nuke without a
      // separate reorder pass.
      const targets = snapshot
        .filter((mod) => !isLocalMod(mod))
        .sort((a, b) => (a.installOrder ?? 0) - (b.installOrder ?? 0));
      targetsRef.current = targets;

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

      // backup + purge + 2 cleanup steps + (download + install) per mod
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

      // Everything after this deletes files, so a failed backup ends the run here.
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

      let missingOnDisk = 0;

      setState((current) => ({ ...current, phase: "purging" }));
      for (const mod of targets) {
        setState((current) => ({ ...current, currentMod: mod.name }));
        try {
          await invokeGuarded("purge_mod", {
            modId: mod.remoteId,
            vpks: mod.installedVpks ?? [],
            profileFolder,
          });
        } catch (error) {
          // A guard block is not drift: the files are in use. Aborting here
          // leaves the state intact instead of nuking it for nothing.
          if (isGameRunningError(error)) throw error;
          // Expected whenever the manager's state is ahead of the file system.
          missingOnDisk += 1;
          logger
            .withMetadata({ mod: mod.remoteId })
            .withError(error)
            .warn("Purge failed during nuke (file likely already gone)");
        }
        completedUnits += 1;
        setProgress();
      }
      setState((current) => ({ ...current, missingOnDisk, currentMod: null }));

      setState((current) => ({ ...current, phase: "clearingCache" }));
      try {
        // Deliberately not clear_all_mods_data: that would also delete local mods,
        // which we cannot download again.
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
      // Whatever went wrong, the dialog must never stay stuck on "running".
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
  }, [reinstallTargets]);

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
