import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { isGameRunning } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { STALE_TIME_POLL } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";

const logger = createLogger("mod-compression");

type CompressionProgressPayload = {
  stage: string;
  current: number;
  total: number;
  currentMod: string | null;
};

type CompressionModUpdatePayload = {
  modId: string;
  installedVpks: string[];
  usesCompression: boolean;
};

type CompressionCompletedPayload = {
  shardCount: number;
  totalBytes: number;
  shardFiles?: string[];
  modUpdates?: CompressionModUpdatePayload[];
};

export const useModCompression = () => {
  const gamePath = usePersistedStore((state) => state.gamePath);
  const compressionEnabled = usePersistedStore(
    (state) => state.compressionEnabled,
  );
  const activeProfileId = usePersistedStore((state) => state.activeProfileId);
  const profiles = usePersistedStore((state) => state.profiles);
  const setCompressionProgress = usePersistedStore(
    (state) => state.setCompressionProgress,
  );
  const setCompressionEnabled = usePersistedStore(
    (state) => state.setCompressionEnabled,
  );
  const prevGameRunning = useRef(false);

  const { data: gameRunning } = useQuery({
    queryKey: ["is-game-running"],
    queryFn: () => isGameRunning(),
    staleTime: STALE_TIME_POLL,
    refetchInterval: 5000,
    enabled: !!gamePath,
  });

  useEffect(() => {
    const profileFolder = profiles[activeProfileId]?.folderName ?? null;
    logger
      .withMetadata({ enabled: compressionEnabled, profileFolder })
      .info("Syncing compression config to backend");
    void invoke("mod_compression_set_config", {
      enabled: compressionEnabled,
      profileFolder,
    }).catch((e) => {
      logger
        .withError(e instanceof Error ? e : new Error(String(e)))
        .warn("mod_compression_set_config failed");
    });
  }, [compressionEnabled, activeProfileId, profiles]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<CompressionProgressPayload>(
      "mod-compression-progress",
      (event) => {
        const p = event.payload;
        const status =
          p.stage === "merging"
            ? "merging"
            : p.stage === "extracting"
              ? "extracting"
              : "idle";
        setCompressionProgress({
          status,
          current: p.current,
          total: p.total,
          currentModName: p.currentMod,
        });
      },
    ).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [setCompressionProgress]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<CompressionCompletedPayload>(
      "mod-compression-completed",
      (event) => {
        const p = event.payload;
        const modUpdates = p.modUpdates;
        usePersistedStore.getState().setCompressionProgress({
          status: "idle",
          current: 0,
          total: 0,
          currentModName: null,
        });
        if (modUpdates !== undefined && modUpdates.length > 0) {
          usePersistedStore.setState((s) => ({
            localMods: s.localMods.map((m) => {
              const u = modUpdates.find(
                (x) => x.modId === m.remoteId || x.modId === m.id,
              );
              if (!u) return m;
              return {
                ...m,
                installedVpks: u.installedVpks,
                usesCompression: u.usesCompression,
                compression: undefined,
              };
            }),
          }));
          return;
        }
        if (
          p.shardCount > 0 &&
          p.shardFiles !== undefined &&
          p.shardFiles.length > 0
        ) {
          usePersistedStore.setState((s) => ({
            localMods: s.localMods.map((m) => {
              if (m.status === ModStatus.Installed && m.isMap !== true) {
                return {
                  ...m,
                  installedVpks: p.shardFiles,
                  usesCompression: true,
                };
              }
              return m;
            }),
          }));
        }
      },
    ).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const wasRunning = prevGameRunning.current;
    const isRunning = gameRunning === true;
    prevGameRunning.current = isRunning;

    if (!wasRunning && isRunning) {
      void invoke("mod_compression_cancel").catch(() => undefined);
      setCompressionProgress({
        status: "paused",
        current: 0,
        total: 0,
        currentModName: null,
      });
    }
  }, [gameRunning, setCompressionProgress]);

  const getProfileFolder = (): string | null => {
    const s = usePersistedStore.getState();
    return s.profiles[s.activeProfileId]?.folderName ?? null;
  };

  const collectInstalledMods = () => {
    const s = usePersistedStore.getState();
    return s.localMods
      .filter(
        (m) =>
          m.status === ModStatus.Installed &&
          (m.installedVpks?.length ?? 0) > 0,
      )
      .map((m) => ({
        id: m.remoteId ?? m.id,
        name: m.name,
        isMap: Boolean(m.isMap),
        installedVpks: m.installedVpks ?? [],
        fileTree: m.installedFileTree,
        installOrder: m.installOrder,
        originalVpkNames: m.compression?.originalVpkNames ?? [],
        usesCompression: m.usesCompression ?? false,
      }));
  };

  const enableCompression = async () => {
    const profileFolder = getProfileFolder();
    const mods = collectInstalledMods();
    logger
      .withMetadata({ mods: mods.length })
      .info("enableCompression: sending mod list to backend");
    setCompressionEnabled(true);
    await invoke("mod_compression_set_config", {
      enabled: true,
      profileFolder,
    });
    setCompressionProgress({
      status: "merging",
      current: 0,
      total: 1,
      currentModName: null,
    });
    await invoke("mod_compression_rebuild", { profileFolder, mods });
    setCompressionProgress({
      status: "idle",
      current: 0,
      total: 0,
      currentModName: null,
    });
  };

  const disableCompression = async () => {
    const profileFolder = getProfileFolder();
    const mods = collectInstalledMods();
    logger
      .withMetadata({ mods: mods.length })
      .info("disableCompression: sending mod list to backend");
    setCompressionProgress({
      status: "extracting",
      current: 0,
      total: 1,
      currentModName: null,
    });
    await invoke("mod_compression_disable", { profileFolder, mods });
    setCompressionEnabled(false);
    await invoke("mod_compression_set_config", {
      enabled: false,
      profileFolder,
    });
    setCompressionProgress({
      status: "idle",
      current: 0,
      total: 0,
      currentModName: null,
    });
  };

  const cancelCompression = async () => {
    await invoke("mod_compression_cancel");
    setCompressionProgress({
      status: "idle",
      current: 0,
      total: 0,
      currentModName: null,
    });
  };

  return {
    enableCompression,
    disableCompression,
    cancelCompression,
  };
};
