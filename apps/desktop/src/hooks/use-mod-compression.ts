import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { isGameRunning } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { STALE_TIME_POLL } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import type { CompressionLevel } from "@/lib/store/slices/compression";
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
  originalVpkNames?: string[];
};

type CompressionCompletedPayload = {
  bucketId?: number;
  shardCount: number;
  totalBytes: number;
  shardFiles?: string[];
  modUpdates?: CompressionModUpdatePayload[];
};

type AddonsBackupRestoredPayload = {
  hasCompressionManifest: boolean;
  compressionLevel: string | null;
  modUpdates?: CompressionModUpdatePayload[];
};

const levelToBackend = (l: CompressionLevel): string => l;

function applyCompressionModUpdates(modUpdates: CompressionModUpdatePayload[]) {
  usePersistedStore.setState((s) => ({
    localMods: s.localMods.map((m) => {
      const u = modUpdates.find(
        (x) => x.modId === m.remoteId || x.modId === m.id,
      );
      if (!u) return m;
      const originalVpkNames =
        u.originalVpkNames && u.originalVpkNames.length > 0
          ? u.originalVpkNames
          : (m.compression?.originalVpkNames ?? []);
      if (u.usesCompression) {
        return {
          ...m,
          installedVpks: u.installedVpks,
          usesCompression: true,
          compression: {
            mergedShards: u.installedVpks,
            originalVpkNames,
            loadOrder: m.compression?.loadOrder ?? m.installOrder ?? 0,
            assetKeys: m.compression?.assetKeys ?? [],
          },
        };
      }
      return {
        ...m,
        installedVpks: u.installedVpks,
        usesCompression: false,
        compression: undefined,
      };
    }),
  }));
}

export const useModCompression = () => {
  const { t } = useTranslation();
  const gamePath = usePersistedStore((state) => state.gamePath);
  const compressionEnabled = usePersistedStore(
    (state) => state.compressionEnabled,
  );
  const compressionLevel = usePersistedStore((state) => state.compressionLevel);
  const setCompressionLevel = usePersistedStore(
    (state) => state.setCompressionLevel,
  );
  const maxBackupCount = usePersistedStore((state) => state.maxBackupCount);
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
      .withMetadata({
        enabled: compressionEnabled,
        profileFolder,
        level: compressionLevel,
      })
      .info("Syncing compression config to backend");
    void invoke("mod_compression_set_config", {
      enabled: compressionEnabled,
      level: levelToBackend(compressionLevel),
      profileFolder,
    }).catch((e) => {
      logger
        .withError(e instanceof Error ? e : new Error(String(e)))
        .warn("mod_compression_set_config failed");
    });
  }, [compressionEnabled, compressionLevel, activeProfileId, profiles]);

  useEffect(() => {
    const unlistenPromise = listen<CompressionProgressPayload>(
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
    );
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [setCompressionProgress]);

  useEffect(() => {
    const unlistenPromise = listen<CompressionCompletedPayload>(
      "mod-compression-completed",
      (event) => {
        const p = event.payload;
        const modUpdates = p.modUpdates;
        const shardFiles = p.shardFiles ?? [];
        usePersistedStore.getState().setCompressionProgress({
          status: "idle",
          current: 0,
          total: 0,
          currentModName: null,
          shardCount: p.shardCount,
          shardFiles,
        });
        if (modUpdates !== undefined && modUpdates.length > 0) {
          applyCompressionModUpdates(modUpdates);
          return;
        }
        if (p.shardCount > 0 && shardFiles.length > 0) {
          usePersistedStore.setState((s) => ({
            localMods: s.localMods.map((m) => {
              if (m.status === ModStatus.Installed && m.isMap !== true) {
                return {
                  ...m,
                  installedVpks: shardFiles,
                  usesCompression: true,
                };
              }
              return m;
            }),
          }));
        }
      },
    );
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const unlistenPromise = listen<AddonsBackupRestoredPayload>(
      "addons-backup-restored",
      (ev) => {
        const p = ev.payload;
        if (p.hasCompressionManifest) {
          if (
            p.compressionLevel === "low" ||
            p.compressionLevel === "medium" ||
            p.compressionLevel === "high" ||
            p.compressionLevel === "extreme"
          ) {
            setCompressionLevel(p.compressionLevel);
          }
          setCompressionEnabled(true);
        } else {
          setCompressionEnabled(false);
          usePersistedStore.setState((s) => ({
            localMods: s.localMods.map((m) => {
              if (m.status !== ModStatus.Installed || m.isMap === true) {
                return m;
              }
              // Restore stale shard-based installedVpks back to the
              // pre-compression slot names (e.g. pak01_dir.vpk). The restored
              // backup contains those exact filenames on disk, so re-enabling
              // compression will find them again.
              const originalNames = m.compression?.originalVpkNames ?? [];
              const nextInstalledVpks =
                m.usesCompression === true && originalNames.length > 0
                  ? originalNames
                  : (m.installedVpks ?? []);
              return {
                ...m,
                installedVpks: nextInstalledVpks,
                usesCompression: false,
                compression: undefined,
              };
            }),
          }));
        }
        if (p.modUpdates !== undefined && p.modUpdates.length > 0) {
          applyCompressionModUpdates(p.modUpdates);
        }
        const profileFolder = profiles[activeProfileId]?.folderName ?? null;
        const enabled = p.hasCompressionManifest;
        const lev = usePersistedStore.getState().compressionLevel;
        void invoke("mod_compression_set_config", {
          enabled,
          level: levelToBackend(lev),
          profileFolder,
        }).catch(() => undefined);
        toast.success(t("settings.backupRestored"));
      },
    );
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [
    setCompressionEnabled,
    setCompressionLevel,
    activeProfileId,
    profiles,
    t,
  ]);

  useEffect(() => {
    const wasRunning = prevGameRunning.current;
    const isRunning = gameRunning === true;
    prevGameRunning.current = isRunning;

    if (!wasRunning && isRunning) {
      const compressionProgress =
        usePersistedStore.getState().compressionProgress;
      if (
        compressionProgress.status === "running" ||
        compressionProgress.currentModName != null ||
        compressionProgress.total > 0
      ) {
        void invoke("mod_compression_cancel").catch(() => undefined);
        setCompressionProgress({
          status: "paused",
          current: 0,
          total: 0,
          currentModName: null,
        });
      }
      return;
    }

    if (wasRunning && !isRunning) {
      const currentStatus =
        usePersistedStore.getState().compressionProgress.status;
      if (currentStatus === "paused") {
        setCompressionProgress({
          status: "idle",
          current: 0,
          total: 0,
          currentModName: null,
        });
      }
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

  const enableCompression = async (opts: { createBackup: boolean }) => {
    const mods = collectInstalledMods();
    const level = usePersistedStore.getState().compressionLevel;
    const pf = getProfileFolder();
    logger
      .withMetadata({ mods: mods.length, createBackup: opts.createBackup })
      .info("enableCompression");
    if (opts.createBackup) {
      await invoke("create_addons_backup", {
        maxBackups: maxBackupCount,
        profileFolder: pf,
      });
    }
    setCompressionProgress({
      status: "merging",
      current: 0,
      total: Math.max(mods.length, 1),
      currentModName: null,
      shardCount: 0,
      shardFiles: [],
    });
    try {
      await invoke("mod_compression_set_config", {
        enabled: true,
        level: levelToBackend(level),
        profileFolder: pf,
      });
      setCompressionEnabled(true);
      await invoke("mod_compression_rebuild", {
        profileFolder: pf,
        mods,
        level: levelToBackend(level),
      });
    } catch (e) {
      setCompressionEnabled(false);
      void invoke("mod_compression_set_config", {
        enabled: false,
        level: levelToBackend(level),
        profileFolder: pf,
      }).catch(() => undefined);
      throw e;
    } finally {
      setCompressionProgress({
        status: "idle",
        current: 0,
        total: 0,
        currentModName: null,
      });
    }
  };

  const changeCompressionLevel = async (next: CompressionLevel) => {
    const profileFolder = getProfileFolder();
    const mods = collectInstalledMods();
    const prev = usePersistedStore.getState().compressionLevel;
    try {
      await invoke("mod_compression_change_level", {
        profileFolder,
        mods,
        level: levelToBackend(next),
      });
      setCompressionLevel(next);
    } catch (e) {
      setCompressionLevel(prev);
      throw e;
    }
  };

  const disableCompression = async () => {
    const profileFolder = getProfileFolder();
    const mods = collectInstalledMods();
    const level = usePersistedStore.getState().compressionLevel;
    logger.withMetadata({ mods: mods.length }).info("disableCompression");
    setCompressionProgress({
      status: "extracting",
      current: 0,
      total: Math.max(mods.length, 1),
      currentModName: null,
      shardCount: 0,
      shardFiles: [],
    });
    try {
      await invoke("mod_compression_disable", { profileFolder, mods });
      setCompressionEnabled(false);
      await invoke("mod_compression_set_config", {
        enabled: false,
        level: levelToBackend(level),
        profileFolder,
      });
    } catch (e) {
      logger
        .withError(e instanceof Error ? e : new Error(String(e)))
        .error("disableCompression failed");
      throw e;
    } finally {
      setCompressionProgress({
        status: "idle",
        current: 0,
        total: 0,
        currentModName: null,
        shardCount: 0,
        shardFiles: [],
      });
    }
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
    changeCompressionLevel,
    disableCompression,
    cancelCompression,
  };
};
