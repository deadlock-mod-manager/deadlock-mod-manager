import type { HeroDetectionResult } from "@deadlock-mods/hero-parser";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { createLogger } from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

const logger = createLogger("hero-detection");

const INITIAL_DELAY_MS = 60_000;
const BETWEEN_MOD_DELAY_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

    const total = modsWithoutHero.length;

    logger
      .withMetadata({ count: total })
      .info("Background hero detection scheduled");

    setHeroDetection({
      status: "scanning",
      current: 0,
      total,
      currentModName: null,
    });

    const detectAll = async () => {
      await sleep(INITIAL_DELAY_MS);

      for (let i = 0; i < modsWithoutHero.length; i++) {
        const mod = modsWithoutHero[i];

        if (i > 0) {
          await sleep(BETWEEN_MOD_DELAY_MS);
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
    };

    detectAll();
  }, [localMods, setDetectedHero, setHeroDetection]);
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

export const forceRescanAllMods = async () => {
  const store = usePersistedStore.getState();
  const { localMods, setDetectedHero, setHeroDetection } = store;

  const total = localMods.length;
  if (total === 0) return;

  logger.withMetadata({ count: total }).info("Force rescan started");

  setHeroDetection({
    status: "scanning",
    current: 0,
    total,
    currentModName: null,
  });

  for (let i = 0; i < localMods.length; i++) {
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
};
