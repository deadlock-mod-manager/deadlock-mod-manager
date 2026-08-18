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
import { ModStatus } from "@/types/mods";

const logger = createLogger("nuke-reinstall");

export type NukePhase =
  | "idle"
  | "snapshot"
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
    setState(INITIAL_STATE);
  }, []);

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

      // purge + 2 cleanup steps + (download + install) per mod
      const totalUnits = targets.length * 3 + 2;
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

      let missingOnDisk = 0;

      setState((current) => ({ ...current, phase: "purging" }));
      for (const mod of targets) {
        setState((current) => ({ ...current, currentMod: mod.name }));
        try {
          await invoke("purge_mod", {
            modId: mod.remoteId,
            vpks: mod.installedVpks ?? [],
            profileFolder,
          });
        } catch (error) {
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

      setState((current) => ({ ...current, phase: "reinstalling" }));
      const reinstallBase = completedUnits;
      for (const [index, mod] of targets.entries()) {
        if (cancelRef.current) {
          logger.info("Nuke & reinstall cancelled by user");
          break;
        }

        setState((current) => ({ ...current, currentMod: mod.name }));

        const result = await reinstallMod(mod, {
          // The purge phase above already wiped every file.
          skipPurge: true,
          onStep: (step) => {
            if (step === "purging") {
              return;
            }
            patchMod(mod.remoteId, { outcome: step });
            // The download unit is done once installing starts.
            completedUnits =
              reinstallBase + index * 2 + (step === "installing" ? 1 : 0);
            setProgress();
          },
          onDownloadProgress: setProgress,
        });

        // Both units are settled for this mod, however it turned out.
        completedUnits = reinstallBase + (index + 1) * 2;
        setProgress();
        patchMod(mod.remoteId, {
          outcome: result.outcome,
          error: result.error,
        });
      }

      setState((current) => ({ ...current, progress: 100 }));

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
        phase: current.phase === "failed" ? "failed" : "done",
        currentMod: null,
        isRunning: false,
      }));
    }
  }, [reinstallMod, patchMod]);

  return { state, run, reset, requestCancel };
};
