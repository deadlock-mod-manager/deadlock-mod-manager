import { toast } from "@deadlock-mods/ui/components/sonner";
import { useState } from "react";
import { getModDownloads } from "@/lib/api";
import { downloadManager } from "@/lib/download/manager";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { type LocalMod, ModStatus } from "@/types/mods";
import useInstallWithCollection from "./use-install-with-collection";
import type {
  ResolvedRequirementStatus,
  useServerJoin,
} from "./use-server-join";

type ServerJoinState = ReturnType<typeof useServerJoin>;

export const useRequiredModInstall = (join: ServerJoinState) => {
  const [installingId, setInstallingId] = useState<string | null>(null);

  const addLocalMod = usePersistedStore((s) => s.addLocalMod);
  const setModStatus = usePersistedStore((s) => s.setModStatus);
  const setModProgress = usePersistedStore((s) => s.setModProgress);
  const setInstalledVpks = usePersistedStore((s) => s.setInstalledVpks);
  const setModEnabledInCurrentProfile = usePersistedStore(
    (s) => s.setModEnabledInCurrentProfile,
  );
  const getActiveProfile = usePersistedStore((s) => s.getActiveProfile);
  const collection = useInstallWithCollection();

  const runInstall = async (mod: LocalMod, displayName: string) => {
    const remoteId = mod.remoteId;
    return collection.install(mod, {
      onStart: () => {
        setModStatus(remoteId, ModStatus.Installing);
      },
      onComplete: (m, result) => {
        setModStatus(remoteId, ModStatus.Installed);
        setInstalledVpks(remoteId, result.installed_vpks, result.file_tree);
        setModEnabledInCurrentProfile(remoteId, true);
        toast.success(`${m.name} installed`);
        join.refetch();
      },
      onError: (m, error) => {
        setModStatus(remoteId, ModStatus.Downloaded);
        toast.error(
          `Failed to install ${m.name}: ${error.message ?? "Unknown error"}`,
        );
      },
      onCancel: () => {
        setModStatus(remoteId, ModStatus.Downloaded);
        toast.info(`${displayName} installation canceled`);
      },
    });
  };

  const installSingle = async (requirement: ResolvedRequirementStatus) => {
    if (!requirement.mod || !requirement.remoteId) return;
    const remoteId = requirement.remoteId;
    const modName = requirement.mod.name;
    setInstallingId(remoteId);
    try {
      const existing = usePersistedStore
        .getState()
        .localMods.find((m) => m.remoteId === remoteId);

      if (
        existing &&
        (existing.status === ModStatus.Downloaded ||
          existing.status === ModStatus.FailedToInstall)
      ) {
        await runInstall(existing, modName);
        return;
      }

      const downloads = await getModDownloads(remoteId);
      if (!downloads || downloads.downloads.length === 0) {
        toast.error(`No downloadable files for ${modName}`);
        return;
      }
      const files = downloads.downloads;
      addLocalMod(requirement.mod, {
        downloads: files,
        selectedDownloads: files,
      });
      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      downloadManager.addToQueue({
        ...requirement.mod,
        downloads: files,
        profileFolder,
        onStart: () => {
          setModStatus(remoteId, ModStatus.Downloading);
        },
        onProgress: (progress) => {
          setModProgress(remoteId, progress);
        },
        onComplete: async () => {
          setModStatus(remoteId, ModStatus.Downloaded);
          const downloaded = usePersistedStore
            .getState()
            .localMods.find((m) => m.remoteId === remoteId);
          if (!downloaded) {
            toast.error(`Could not locate ${modName} after download`);
            return;
          }
          await runInstall(downloaded, modName);
        },
        onError: (err) => {
          toast.error(`Failed to download ${modName}: ${err.message}`);
          setModStatus(remoteId, ModStatus.FailedToDownload);
        },
      });
    } catch (err) {
      logger.withError(err).error("Failed to enqueue required mod download");
      toast.error("Failed to start download");
    } finally {
      setInstallingId(null);
    }
  };

  const installAll = async () => {
    for (const req of join.missing) {
      await installSingle(req);
    }
  };

  return {
    installingId,
    installSingle,
    installAll,
    collection,
  };
};
