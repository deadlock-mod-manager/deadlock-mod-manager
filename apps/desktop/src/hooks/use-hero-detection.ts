import type { HeroDetectionResult } from "@deadlock-mods/hero-parser";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { isGameRunning } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { STALE_TIME_POLL } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";

const logger = createLogger("hero-detection");
const BATCH_SIZE = 10;

interface ModDetectionRequest {
  modId: string;
  installedVpks: string[] | null;
}

interface ModDetectionResponse {
  modId: string;
  result: HeroDetectionResult;
}

let activeAbortController: AbortController | null = null;
let pausedByGame = false;

const abortActiveScan = () => {
  if (activeAbortController) {
    activeAbortController.abort(
      new DOMException("Scan cancelled", "AbortError"),
    );
    activeAbortController = null;
  }
};

const resetToIdle = () => {
  const { setHeroDetection } = usePersistedStore.getState();
  setHeroDetection({
    status: "idle",
    current: 0,
    total: 0,
    currentModName: null,
  });
};

const detectBatch = async (
  batch: ModDetectionRequest[],
): Promise<ModDetectionResponse[]> => {
  return invoke<ModDetectionResponse[]>("detect_mod_heroes_batch", {
    mods: batch,
  });
};

export const useHeroDetection = () => {
  const localMods = usePersistedStore((state) => state.localMods);
  const setDetectedHero = usePersistedStore((state) => state.setDetectedHero);
  const setHeroDetection = usePersistedStore((state) => state.setHeroDetection);
  const gamePath = usePersistedStore((state) => state.gamePath);
  const hasRun = useRef(false);
  const prevGameRunning = useRef(false);

  const { data: gameRunning } = useQuery({
    queryKey: ["is-game-running"],
    queryFn: () => isGameRunning(),
    staleTime: STALE_TIME_POLL,
    refetchInterval: 5000,
    enabled: !!gamePath,
  });

  useEffect(() => {
    const wasRunning = prevGameRunning.current;
    const isRunning = gameRunning === true;
    prevGameRunning.current = isRunning;

    if (!wasRunning && isRunning) {
      pausedByGame = true;
      abortActiveScan();
      resetToIdle();
      logger.info("Hero detection paused: Deadlock is running");
    }

    if (wasRunning && !isRunning && pausedByGame) {
      pausedByGame = false;
      logger.info("Hero detection resumed: Deadlock stopped");
      startBackgroundScan();
    }
  }, [gameRunning]);

  useEffect(() => {
    if (hasRun.current) return;
    if (pausedByGame) return;

    const modsWithoutHero = localMods.filter(
      (mod) => mod.detectedHero === undefined,
    );

    if (modsWithoutHero.length === 0) return;

    hasRun.current = true;

    const timer = setTimeout(() => {
      if (!pausedByGame) {
        runBackgroundScan(modsWithoutHero);
      }
    }, 15_000);

    return () => clearTimeout(timer);
  }, [localMods, setDetectedHero, setHeroDetection]);
};

const runBatchedDetection = async (mods: LocalMod[], signal: AbortSignal) => {
  const { setDetectedHero, setHeroDetection } = usePersistedStore.getState();
  const total = mods.length;

  for (let offset = 0; offset < mods.length; offset += BATCH_SIZE) {
    if (signal.aborted) return;

    const batch = mods.slice(offset, offset + BATCH_SIZE);

    setHeroDetection({
      current: offset,
      currentModName: batch[0].name,
    });

    const requests: ModDetectionRequest[] = batch.map((mod) => ({
      modId: mod.remoteId,
      installedVpks: mod.installedVpks ?? null,
    }));

    try {
      const responses = await detectBatch(requests);
      for (const resp of responses) {
        setDetectedHero(
          resp.modId,
          resp.result.hero ?? null,
          resp.result.usesCriticalPaths,
        );
      }

      logger
        .withMetadata({ batchOffset: offset, batchSize: batch.length })
        .debug("Batch hero detection complete");
    } catch (error) {
      logger
        .withError(error instanceof Error ? error : new Error(String(error)))
        .warn("Batch hero detection failed, falling back to individual");

      for (const mod of batch) {
        if (signal.aborted) return;
        try {
          const result = await invoke<HeroDetectionResult>("detect_mod_hero", {
            modId: mod.remoteId,
            installedVpks: mod.installedVpks ?? null,
          });
          setDetectedHero(
            mod.remoteId,
            result.hero ?? null,
            result.usesCriticalPaths,
          );
        } catch {
          setDetectedHero(mod.remoteId, null, false);
        }
      }
    }
  }

  setHeroDetection({
    status: "idle",
    current: total,
    total,
    currentModName: null,
  });
};

const runBackgroundScan = (mods: LocalMod[]) => {
  const { setHeroDetection } = usePersistedStore.getState();
  const total = mods.length;

  logger
    .withMetadata({ count: total })
    .info("Background hero detection started");

  setHeroDetection({
    status: "scanning",
    current: 0,
    total,
    currentModName: null,
  });

  const controller = new AbortController();
  activeAbortController = controller;

  runBatchedDetection(mods, controller.signal)
    .then(() => logger.info("Background hero detection complete"))
    .catch(() => logger.info("Background hero detection cancelled"));
};

export const detectHeroForMod = async (
  remoteId: string,
  installedVpks?: string[],
): Promise<HeroDetectionResult> => {
  return invoke<HeroDetectionResult>("detect_mod_hero", {
    modId: remoteId,
    installedVpks: installedVpks ?? null,
  });
};

export const stopHeroDetection = () => {
  abortActiveScan();
  resetToIdle();
  logger.info("Hero detection stopped by user");
};

export const startBackgroundScan = () => {
  abortActiveScan();

  const { localMods } = usePersistedStore.getState();
  const modsWithoutHero = localMods.filter(
    (mod) => mod.detectedHero === undefined,
  );

  if (modsWithoutHero.length === 0) return;

  runBackgroundScan(modsWithoutHero);
};

export const clearAllDetectedHeroes = () => {
  abortActiveScan();
  usePersistedStore.getState().clearAllDetectedHeroes();
  invoke("clear_vpk_entry_cache").catch(() => {});
  resetToIdle();
  logger.info("All detected heroes and VPK cache cleared by user");
};

export const forceRescanAllMods = async () => {
  abortActiveScan();

  const store = usePersistedStore.getState();
  const { localMods, setHeroDetection } = store;

  const total = localMods.length;
  if (total === 0) return;

  logger.withMetadata({ count: total }).info("Force rescan started");

  const controller = new AbortController();
  activeAbortController = controller;

  setHeroDetection({
    status: "scanning",
    current: 0,
    total,
    currentModName: null,
  });

  await runBatchedDetection(localMods, controller.signal);
  logger.info("Force rescan complete");
};

export const indexUnindexedModsNow = async () => {
  abortActiveScan();

  const store = usePersistedStore.getState();
  const { localMods, setHeroDetection } = store;

  const unindexedMods = localMods.filter(
    (mod) => mod.detectedHero === undefined,
  );
  const total = unindexedMods.length;
  if (total === 0) return;

  logger.withMetadata({ count: total }).info("Index unindexed mods started");

  const controller = new AbortController();
  activeAbortController = controller;

  setHeroDetection({
    status: "scanning",
    current: 0,
    total,
    currentModName: null,
  });

  await runBatchedDetection(unindexedMods, controller.signal);
  logger.info("Index unindexed mods complete");
};
