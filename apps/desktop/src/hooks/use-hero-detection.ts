import type { HeroDetectionResult } from "@deadlock-mods/hero-parser";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { createLogger } from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

const logger = createLogger("hero-detection");

const DEFAULT_INTERVAL_MS = 30_000;

let activeAbortController: AbortController | null = null;

const cancellableSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

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

export const useHeroDetection = () => {
  const localMods = usePersistedStore((state) => state.localMods);
  const setDetectedHero = usePersistedStore((state) => state.setDetectedHero);
  const setHeroDetection = usePersistedStore((state) => state.setHeroDetection);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;

    const modsWithoutHero = localMods.filter(
      (mod) => mod.detectedHero === undefined,
    );

    if (modsWithoutHero.length === 0) return;

    hasRun.current = true;

    runBackgroundScan(modsWithoutHero);
  }, [localMods, setDetectedHero, setHeroDetection]);
};

const runBackgroundScan = (
  mods: ReturnType<typeof usePersistedStore.getState>["localMods"],
) => {
  const { setDetectedHero, setHeroDetection } = usePersistedStore.getState();
  const total = mods.length;

  logger
    .withMetadata({ count: total })
    .info("Background hero detection scheduled");

  setHeroDetection({
    status: "scanning",
    current: 0,
    total,
    currentModName: null,
  });

  const controller = new AbortController();
  activeAbortController = controller;
  const { signal } = controller;

  const detectAll = async () => {
    const intervalMs =
      usePersistedStore.getState().heroParserIntervalSeconds * 1000 ||
      DEFAULT_INTERVAL_MS;

    try {
      await cancellableSleep(intervalMs, signal);

      for (let i = 0; i < mods.length; i++) {
        if (signal.aborted) return;

        const mod = mods[i];

        if (i > 0) {
          await cancellableSleep(intervalMs, signal);
        }

        setHeroDetection({
          current: i,
          currentModName: mod.name,
        });

        try {
          const result = await invoke<HeroDetectionResult>("detect_mod_hero", {
            modId: mod.remoteId,
            installedVpks: mod.installedVpks ?? null,
          });
          setDetectedHero(mod.remoteId, result.hero ?? null);

          logger
            .withMetadata({
              modId: mod.remoteId,
              hero: result.hero,
              category: result.category,
            })
            .debug("Hero detected for mod");
        } catch (error) {
          logger
            .withMetadata({ modId: mod.remoteId })
            .withError(
              error instanceof Error ? error : new Error(String(error)),
            )
            .warn("Failed to detect hero for mod");
          setDetectedHero(mod.remoteId, null);
        }
      }

      setHeroDetection({
        status: "idle",
        current: total,
        total,
        currentModName: null,
      });

      logger.info("Background hero detection complete");
    } catch {
      logger.info("Background hero detection cancelled");
    }
  };

  detectAll();
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
  resetToIdle();
  logger.info("All detected heroes cleared by user");
};

export const forceRescanAllMods = async () => {
  abortActiveScan();

  const store = usePersistedStore.getState();
  const { localMods, setDetectedHero, setHeroDetection } = store;

  const total = localMods.length;
  if (total === 0) return;

  logger.withMetadata({ count: total }).info("Force rescan started");

  const controller = new AbortController();
  activeAbortController = controller;
  const { signal } = controller;

  setHeroDetection({
    status: "scanning",
    current: 0,
    total,
    currentModName: null,
  });

  try {
    for (let i = 0; i < localMods.length; i++) {
      if (signal.aborted) return;

      const mod = localMods[i];

      setHeroDetection({
        current: i,
        currentModName: mod.name,
      });

      try {
        const result = await invoke<HeroDetectionResult>("detect_mod_hero", {
          modId: mod.remoteId,
          installedVpks: mod.installedVpks ?? null,
        });
        setDetectedHero(mod.remoteId, result.hero ?? null);
      } catch {
        setDetectedHero(mod.remoteId, null);
      }
    }

    setHeroDetection({
      status: "idle",
      current: total,
      total,
      currentModName: null,
    });

    logger.info("Force rescan complete");
  } catch {
    logger.info("Force rescan cancelled");
  }
};

export const indexUnindexedModsNow = async () => {
  abortActiveScan();

  const store = usePersistedStore.getState();
  const { localMods, setDetectedHero, setHeroDetection } = store;

  const unindexedMods = localMods.filter(
    (mod) => mod.detectedHero === undefined,
  );
  const total = unindexedMods.length;
  if (total === 0) return;

  logger.withMetadata({ count: total }).info("Index unindexed mods started");

  const controller = new AbortController();
  activeAbortController = controller;
  const { signal } = controller;

  setHeroDetection({
    status: "scanning",
    current: 0,
    total,
    currentModName: null,
  });

  try {
    for (let i = 0; i < unindexedMods.length; i++) {
      if (signal.aborted) return;

      const mod = unindexedMods[i];

      setHeroDetection({
        current: i,
        currentModName: mod.name,
      });

      try {
        const result = await invoke<HeroDetectionResult>("detect_mod_hero", {
          modId: mod.remoteId,
          installedVpks: mod.installedVpks ?? null,
        });
        setDetectedHero(mod.remoteId, result.hero ?? null);
      } catch {
        setDetectedHero(mod.remoteId, null);
      }
    }

    setHeroDetection({
      status: "idle",
      current: total,
      total,
      currentModName: null,
    });

    logger.info("Index unindexed mods complete");
  } catch {
    logger.info("Index unindexed mods cancelled");
  }
};
