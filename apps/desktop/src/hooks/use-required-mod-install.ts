import { toast } from "@deadlock-mods/ui/components/sonner";
import { useState } from "react";
import { getModDownloads } from "@/lib/api";
import { downloadManager } from "@/lib/download/manager";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";
import useInstall from "./use-install";
import type {
  ResolvedRequirementStatus,
  useServerJoin,
} from "./use-server-join";

type ServerJoinState = ReturnType<typeof useServerJoin>;

export const useRequiredModInstall = (join: ServerJoinState) => {
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [enablingId, setEnablingId] = useState<string | null>(null);

  const addLocalMod = usePersistedStore((s) => s.addLocalMod);
  const setModStatus = usePersistedStore((s) => s.setModStatus);
  const setModProgress = usePersistedStore((s) => s.setModProgress);
  const setInstalledVpks = usePersistedStore((s) => s.setInstalledVpks);
  const setModEnabledInCurrentProfile = usePersistedStore(
    (s) => s.setModEnabledInCurrentProfile,
  );
  const getActiveProfile = usePersistedStore((s) => s.getActiveProfile);
  const localMods = usePersistedStore((s) => s.localMods);
  const { install } = useInstall();

  const installSingle = async (requirement: ResolvedRequirementStatus) => {
    if (!requirement.mod || !requirement.remoteId) return;
    setInstallingId(requirement.remoteId);
    try {
      const downloads = await getModDownloads(requirement.remoteId);
      if (!downloads || downloads.downloads.length === 0) {
        toast.error(`No downloadable files for ${requirement.mod.name}`);
        return;
      }
      const files = downloads.downloads;
      addLocalMod(requirement.mod, {
        downloads: files,
        selectedDownloads: files,
      });
      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;
      const remoteId = requirement.remoteId;
      const modName = requirement.mod.name;

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
        onComplete: () => {
          setModStatus(remoteId, ModStatus.Downloaded);
          toast.success(`${modName} downloaded`);
          join.refetch();
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

  const enableSingle = async (requirement: ResolvedRequirementStatus) => {
    if (!requirement.remoteId) return;
    const remoteId = requirement.remoteId;
    const local = localMods.find((m) => m.remoteId === remoteId);
    if (!local) return;

    setEnablingId(remoteId);
    try {
      const modToInstall =
        local.status === ModStatus.Installed
          ? { ...local, status: ModStatus.Downloaded }
          : local;
      const result = await install(modToInstall, {
        onStart: (m) => {
          setModStatus(m.remoteId, ModStatus.Installing);
        },
        onComplete: (m, res) => {
          setModStatus(m.remoteId, ModStatus.Installed);
          setInstalledVpks(m.remoteId, res.installed_vpks, res.file_tree);
          setModEnabledInCurrentProfile(m.remoteId, true);
          toast.success(`${m.name} enabled`);
          join.refetch();
        },
        onError: (m, error) => {
          setModStatus(m.remoteId, ModStatus.Downloaded);
          toast.error(`Failed to enable ${m.name}: ${error.message}`);
        },
      });
      return result;
    } catch (err) {
      logger.withError(err).error("Failed to enable required mod");
      toast.error("Failed to enable mod");
    } finally {
      setEnablingId(null);
    }
  };

  const enableAll = async () => {
    for (const req of join.disabled) {
      await enableSingle(req);
    }
  };

  return {
    installingId,
    installSingle,
    installAll,
    enablingId,
    enableSingle,
    enableAll,
  };
};
