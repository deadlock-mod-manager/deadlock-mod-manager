import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { useTranslation } from "react-i18next";
import { getModDownloads } from "@/lib/api-client";
import { downloadManager } from "@/lib/download/manager";
import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import {
  type InstallableMod,
  type LocalMod,
  type ModDownloadItem,
  type ModFileTree,
  ModStatus,
  type RepairDownloadItem,
  type RepairReason,
} from "@/types/mods";

type RepairSkipReason =
  | "missing-downloads"
  | "multiple-downloads"
  | "needs-file-selection";

export type RepairSkippedMod = {
  remoteId: string;
  reason: RepairSkipReason;
};

export type RepairFailedMod = {
  remoteId: string;
  error: string;
};

export type RepairModsResult = {
  queued: string[];
  repaired: string[];
  skipped: RepairSkippedMod[];
  failed: RepairFailedMod[];
};

type RepairModOptions = {
  interactive?: boolean;
  availableFiles?: ModDownloadItem[];
  requestDownloadSelection?: () => Promise<void> | void;
  installInteractively?: (mod: LocalMod) => Promise<void>;
};

export const normalizeRepairDownloads = (
  downloads: RepairDownloadItem[],
): ModDownloadItem[] =>
  downloads.map((download) => ({
    name: download.name,
    size: download.size,
    url: download.url,
    description: download.description ?? null,
    createdAt: download.createdAt ?? null,
    updatedAt: download.updatedAt ?? null,
    md5Checksum: download.md5Checksum ?? null,
  }));

const downloadFilesForMetadata = (downloads: ModDownloadItem[]) =>
  downloads.map((download) => ({
    name: download.name,
    size: download.size ?? 0,
    url: download.url,
    md5Checksum: download.md5Checksum ?? null,
  }));

const getStoredDownloads = (mod: LocalMod): ModDownloadItem[] | null => {
  if (mod.repairDownloads?.length) {
    return normalizeRepairDownloads(mod.repairDownloads);
  }

  if (mod.selectedDownloads?.length) {
    return mod.selectedDownloads;
  }

  return null;
};

const repairReasonForSkip = (reason: RepairSkipReason): RepairReason => {
  switch (reason) {
    case "multiple-downloads":
      return "needsDownloadChoice";
    case "needs-file-selection":
      return "needsFileSelection";
    case "missing-downloads":
      return "missingPayload";
  }
};

const selectedFileTreeForBatch = (
  mod: LocalMod,
  analyzedFileTree: ModFileTree,
): ModFileTree | RepairSkipReason => {
  if (!analyzedFileTree.has_multiple_files) {
    return analyzedFileTree;
  }

  const previousTree = mod.installedFileTree;
  if (!previousTree?.has_multiple_files) {
    return "needs-file-selection";
  }

  const selectedNames = new Set(
    previousTree.files
      .filter((file) => file.is_selected)
      .flatMap((file) => [file.name, file.path]),
  );
  if (selectedNames.size === 0) {
    return "needs-file-selection";
  }

  const files = analyzedFileTree.files.map((file) => ({
    ...file,
    is_selected: selectedNames.has(file.name) || selectedNames.has(file.path),
  }));
  if (!files.some((file) => file.is_selected)) {
    return "needs-file-selection";
  }

  return {
    ...analyzedFileTree,
    files,
  };
};

export const useRepairMods = () => {
  const { t } = useTranslation();
  const {
    getActiveProfile,
    setModStatus,
    setModProgress,
    setInstalledVpks,
    setSelectedDownloads,
    setModDownloads,
    setModEnabledInCurrentProfile,
    isRepairingMods,
    setIsRepairingMods,
    setModRepairReason,
  } = usePersistedStore();

  const persistRepairMetadata = async (
    profileFolder: string | null,
    modId: string,
    sourceDownloads: ModDownloadItem[],
  ) => {
    await invoke("update_profile_vpk_manifest_repair_metadata", {
      profileFolder,
      modId,
      sourceDownloads: downloadFilesForMetadata(sourceDownloads),
    });
  };

  const resolveDownloads = async (
    mod: LocalMod,
    options: RepairModOptions,
  ): Promise<ModDownloadItem[] | RepairSkipReason> => {
    const storedDownloads = getStoredDownloads(mod);
    if (storedDownloads?.length) {
      return storedDownloads;
    }

    const availableFiles = options.availableFiles ?? [];
    if (availableFiles.length === 1) {
      return availableFiles;
    }
    if (availableFiles.length > 1) {
      return "multiple-downloads";
    }

    try {
      const response = await getModDownloads(mod.remoteId);
      if (response.downloads.length === 1) {
        return response.downloads;
      }
      return response.downloads.length > 1
        ? "multiple-downloads"
        : "missing-downloads";
    } catch (error) {
      logger
        .withMetadata({ modId: mod.remoteId })
        .withError(error)
        .warn("Failed to fetch repair downloads");
      return "missing-downloads";
    }
  };

  const queueRepairDownload = (
    mod: LocalMod,
    downloads: ModDownloadItem[],
    profileFolder: string | null,
  ) =>
    new Promise<void>((resolve, reject) => {
      setModStatus(mod.remoteId, ModStatus.Downloading);
      downloadManager.addToQueue({
        ...mod,
        downloads,
        profileFolder,
        onStart: () => {
          setModStatus(mod.remoteId, ModStatus.Downloading);
        },
        onProgress: (progress) => {
          setModProgress(mod.remoteId, progress);
        },
        onComplete: () => {
          setModStatus(mod.remoteId, ModStatus.Downloaded);
          resolve();
        },
        onError: (error) => {
          setModStatus(mod.remoteId, ModStatus.NeedsRepair);
          setModRepairReason(mod.remoteId, "repairFailed");
          reject(error);
        },
      });
    });

  const rememberRepairDownloads = (
    mod: LocalMod,
    downloads: ModDownloadItem[],
  ) => {
    setModDownloads(mod.remoteId, downloads);
    setSelectedDownloads(mod.remoteId, downloads);
    usePersistedStore.setState((state) => ({
      localMods: state.localMods.map((localMod) =>
        localMod.remoteId === mod.remoteId
          ? { ...localMod, repairDownloads: downloads }
          : localMod,
      ),
    }));
  };

  const installDownloadedRepair = async (
    mod: LocalMod,
    downloads: ModDownloadItem[],
    profileFolder: string | null,
  ): Promise<RepairModsResult> => {
    try {
      const base = await appLocalDataDir();
      const modsRoot = await join(base, "mods");
      const modDir = await join(modsRoot, mod.remoteId);
      const analyzedFileTree = await invoke<ModFileTree>("get_mod_file_tree", {
        modPath: modDir,
      });
      const fileTree = selectedFileTreeForBatch(mod, analyzedFileTree);
      if (typeof fileTree === "string") {
        setModStatus(mod.remoteId, ModStatus.NeedsRepair);
        setModRepairReason(mod.remoteId, repairReasonForSkip(fileTree));
        return {
          queued: [],
          repaired: [],
          skipped: [{ remoteId: mod.remoteId, reason: fileTree }],
          failed: [],
        };
      }

      setModStatus(mod.remoteId, ModStatus.Installing);
      const result = await invoke<InstallableMod>("install_mod", {
        deadlockMod: {
          id: mod.remoteId,
          name: mod.name,
          is_map: mod.isMap,
          file_tree: fileTree,
        },
        profileFolder,
      });

      setInstalledVpks(mod.remoteId, result.installed_vpks, result.file_tree);
      setModEnabledInCurrentProfile(mod.remoteId, true);
      setModRepairReason(mod.remoteId, undefined);
      await persistRepairMetadata(profileFolder, mod.remoteId, downloads);

      return {
        queued: [],
        repaired: [mod.remoteId],
        skipped: [],
        failed: [],
      };
    } catch (error) {
      const message = getErrorMessage(error);
      logger
        .withMetadata({ modId: mod.remoteId })
        .withError(error)
        .error("Failed to repair mod");
      setModStatus(mod.remoteId, ModStatus.NeedsRepair);
      setModRepairReason(mod.remoteId, "repairFailed");
      return {
        queued: [],
        repaired: [],
        skipped: [],
        failed: [{ remoteId: mod.remoteId, error: message }],
      };
    }
  };

  const repairModDirectly = async (
    mod: LocalMod,
    downloads: ModDownloadItem[],
    profileFolder: string | null,
  ): Promise<RepairModsResult> => {
    rememberRepairDownloads(mod, downloads);
    await queueRepairDownload(mod, downloads, profileFolder);
    const result = await installDownloadedRepair(mod, downloads, profileFolder);
    return {
      ...result,
      queued: [mod.remoteId],
    };
  };

  const repairMod = async (
    mod: LocalMod,
    options: RepairModOptions = {},
  ): Promise<RepairModsResult> => {
    const interactive = options.interactive ?? true;
    const profileFolder = getActiveProfile()?.folderName ?? null;
    const downloads = await resolveDownloads(mod, options);

    if (typeof downloads === "string") {
      setModStatus(mod.remoteId, ModStatus.NeedsRepair);
      setModRepairReason(mod.remoteId, repairReasonForSkip(downloads));
      if (interactive && options.requestDownloadSelection) {
        await options.requestDownloadSelection();
      }
      return {
        queued: [],
        repaired: [],
        skipped: [{ remoteId: mod.remoteId, reason: downloads }],
        failed: [],
      };
    }

    if (interactive && options.installInteractively) {
      rememberRepairDownloads(mod, downloads);
      const repairCandidate: LocalMod = {
        ...mod,
        status: ModStatus.Downloaded,
        downloads,
        selectedDownloads: downloads,
        repairDownloads: downloads,
      };

      downloadManager.addToQueue({
        ...repairCandidate,
        downloads,
        profileFolder,
        onStart: () => {
          setModStatus(mod.remoteId, ModStatus.Downloading);
        },
        onProgress: (progress) => {
          setModProgress(mod.remoteId, progress);
        },
        onComplete: async () => {
          setModStatus(mod.remoteId, ModStatus.Downloaded);
          const latestMod =
            usePersistedStore
              .getState()
              .localMods.find((m) => m.remoteId === mod.remoteId) ??
            repairCandidate;

          await options.installInteractively?.({
            ...latestMod,
            status: ModStatus.Downloaded,
            downloads,
            selectedDownloads: downloads,
            repairDownloads: downloads,
          });
        },
        onError: (error) => {
          toast.error(`Failed to repair ${mod.name}: ${error.message}`);
          setModStatus(mod.remoteId, ModStatus.NeedsRepair);
          setModRepairReason(mod.remoteId, "repairFailed");
        },
      });

      return {
        queued: [mod.remoteId],
        repaired: [],
        skipped: [],
        failed: [],
      };
    }

    return repairModDirectly(mod, downloads, profileFolder);
  };

  const repairMods = async (mods: LocalMod[]): Promise<RepairModsResult> => {
    if (mods.length === 0 || usePersistedStore.getState().isRepairingMods) {
      return { queued: [], repaired: [], skipped: [], failed: [] };
    }

    setIsRepairingMods(true);
    const aggregate: RepairModsResult = {
      queued: [],
      repaired: [],
      skipped: [],
      failed: [],
    };

    try {
      const profileFolder = getActiveProfile()?.folderName ?? null;
      const resolvedRepairs = await Promise.all(
        mods.map(async (mod) => ({
          mod,
          downloads: await resolveDownloads(mod, { interactive: false }),
        })),
      );

      const queuedRepairs: Array<{
        mod: LocalMod;
        downloads: ModDownloadItem[];
        downloadComplete: Promise<
          | { ok: true }
          | {
              ok: false;
              error: string;
            }
        >;
      }> = [];

      for (const { mod, downloads } of resolvedRepairs) {
        if (typeof downloads === "string") {
          setModStatus(mod.remoteId, ModStatus.NeedsRepair);
          setModRepairReason(mod.remoteId, repairReasonForSkip(downloads));
          aggregate.skipped.push({ remoteId: mod.remoteId, reason: downloads });
          continue;
        }

        rememberRepairDownloads(mod, downloads);
        queuedRepairs.push({
          mod,
          downloads,
          downloadComplete: queueRepairDownload(mod, downloads, profileFolder)
            .then(() => ({ ok: true as const }))
            .catch((error) => ({
              ok: false as const,
              error: getErrorMessage(error),
            })),
        });
        aggregate.queued.push(mod.remoteId);
      }

      for (const repair of queuedRepairs) {
        const downloadResult = await repair.downloadComplete;
        if (!downloadResult.ok) {
          aggregate.failed.push({
            remoteId: repair.mod.remoteId,
            error: downloadResult.error,
          });
          continue;
        }

        const result = await installDownloadedRepair(
          repair.mod,
          repair.downloads,
          profileFolder,
        );
        aggregate.repaired.push(...result.repaired);
        aggregate.skipped.push(...result.skipped);
        aggregate.failed.push(...result.failed);
      }

      if (aggregate.skipped.length === 0 && aggregate.failed.length === 0) {
        toast.success(
          t("modButton.repairAllSuccess", {
            count: aggregate.repaired.length,
          }),
        );
      } else if (
        aggregate.queued.length === 0 &&
        aggregate.repaired.length === 0 &&
        aggregate.failed.length === 0 &&
        aggregate.skipped.length > 0
      ) {
        toast.warning(
          t("modButton.repairAllManualOnly", {
            count: aggregate.skipped.length,
          }),
        );
      } else {
        toast.warning(
          t("modButton.repairAllPartial", {
            queued: aggregate.queued.length,
            repaired: aggregate.repaired.length,
            manual: aggregate.skipped.length,
            failed: aggregate.failed.length,
          }),
        );
      }

      return aggregate;
    } finally {
      setIsRepairingMods(false);
    }
  };

  return {
    isRepairing: isRepairingMods,
    repairMod,
    repairMods,
  };
};
