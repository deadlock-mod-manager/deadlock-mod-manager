import {
  RuntimeError,
  ValidationError,
} from "@deadlock-mods/common/client-errors";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createLogger } from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import {
  type LocalMod,
  type ModDownloadItem,
  type ModFile,
  type ModFileTree,
  ModStatus,
} from "@/types/mods";

const logger = createLogger("use-mod-options");

interface SwapModOptionsResult {
  installed_vpks: string[];
  original_vpk_names: string[];
  file_tree: ModFileTree;
}

interface StageDownloadArchiveResult {
  staged_originals: string[];
}

interface MissingVariantArchive {
  url: string;
  archive_name: string;
  wanted_originals: string[];
}

interface FetchMissingModVariantsResult {
  staged_originals: string[];
  skipped_originals: string[];
  missing_originals: string[];
}

interface ApplyUnifiedPayload {
  selectedVpkNames: string[];
  selectedArchives: ModDownloadItem[];
}

const deriveCurrentOriginalNames = (mod: LocalMod): string[] => {
  if (!mod.installedFileTree) {
    return mod.installedVpks ?? [];
  }
  const selected = mod.installedFileTree.files.filter((f) => f.is_selected);
  return selected.map((f) => f.name);
};

const buildUnionFileTree = (
  onDiskOptions: ModFileTree | null,
  archiveTree: ModFileTree | undefined,
): { fileTree: ModFileTree; notOnDisk: Set<string> } => {
  const onDiskByName = new Map<string, ModFile>();
  for (const f of onDiskOptions?.files ?? []) {
    onDiskByName.set(f.name, f);
  }

  const archiveByName = new Map<string, ModFile>();
  for (const f of archiveTree?.files ?? []) {
    if (!archiveByName.has(f.name)) {
      archiveByName.set(f.name, f);
    }
  }

  const merged: ModFile[] = [];
  const seen = new Set<string>();

  for (const f of onDiskOptions?.files ?? []) {
    merged.push(f);
    seen.add(f.name);
  }

  for (const f of archiveByName.values()) {
    if (seen.has(f.name)) continue;
    merged.push({ ...f, is_selected: false });
    seen.add(f.name);
  }

  merged.sort((a, b) => a.name.localeCompare(b.name));

  const notOnDisk = new Set<string>();
  for (const f of merged) {
    if (!onDiskByName.has(f.name)) notOnDisk.add(f.name);
  }

  return {
    fileTree: {
      files: merged,
      total_files: merged.length,
      has_multiple_files: merged.length > 1,
    },
    notOnDisk,
  };
};

const mergeFileTreeAfterSwap = (
  previous: ModFileTree | undefined,
  swapResult: ModFileTree,
): ModFileTree => {
  if (!previous || previous.files.length === 0) {
    return swapResult;
  }

  const selectedNames = new Set(
    swapResult.files.filter((f) => f.is_selected).map((f) => f.name),
  );
  const knownNames = new Set(previous.files.map((f) => f.name));

  const merged: ModFile[] = previous.files.map((f) => ({
    ...f,
    is_selected: selectedNames.has(f.name),
  }));

  for (const f of swapResult.files) {
    if (!knownNames.has(f.name)) {
      merged.push({ ...f });
    }
  }

  return {
    files: merged,
    total_files: merged.length,
    has_multiple_files: merged.length > 1,
  };
};

const groupMissingByArchive = (
  missingOriginals: string[],
  mod: LocalMod,
): MissingVariantArchive[] => {
  const archiveLookup = new Map<string, string>();
  for (const f of mod.installedFileTree?.files ?? []) {
    if (f.archive_name && !archiveLookup.has(f.name)) {
      archiveLookup.set(f.name, f.archive_name);
    }
  }

  const urlByArchive = new Map<string, string>();
  const candidateDownloads: ModDownloadItem[] = [
    ...(mod.selectedDownloads ?? []),
    ...(mod.downloads ?? []),
  ];
  for (const d of candidateDownloads) {
    if (!urlByArchive.has(d.name)) {
      urlByArchive.set(d.name, d.url);
    }
  }

  const grouped = new Map<string, MissingVariantArchive>();
  for (const original of missingOriginals) {
    const archiveName = archiveLookup.get(original);
    if (!archiveName) {
      logger
        .withMetadata({ modId: mod.remoteId, original })
        .warn("Missing original has no archive_name in installedFileTree");
      continue;
    }
    const url = urlByArchive.get(archiveName);
    if (!url) {
      logger
        .withMetadata({ modId: mod.remoteId, original, archiveName })
        .warn("No download URL found for archive containing missing variant");
      continue;
    }
    const existing = grouped.get(archiveName);
    if (existing) {
      existing.wanted_originals.push(original);
    } else {
      grouped.set(archiveName, {
        url,
        archive_name: archiveName,
        wanted_originals: [original],
      });
    }
  }
  return Array.from(grouped.values());
};

export const useModOptions = (mod: LocalMod | null) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
  const setInstalledVpks = usePersistedStore((state) => state.setInstalledVpks);
  const setSelectedDownloads = usePersistedStore(
    (state) => state.setSelectedDownloads,
  );
  const setActiveVariantArchive = usePersistedStore(
    (state) => state.setActiveVariantArchive,
  );

  const profileFolder = getActiveProfile()?.folderName ?? null;
  const installedVpks = mod?.installedVpks ?? [];
  const currentOriginalNames = mod ? deriveCurrentOriginalNames(mod) : [];

  const downloads = mod?.downloads ?? [];
  const selectedDownloadNames = new Set(
    (mod?.selectedDownloads ?? []).map((d) => d.name),
  );

  const activeArchiveName = useMemo(() => {
    if (mod?.activeVariantArchive) return mod.activeVariantArchive;
    if (mod?.selectedDownloads?.length === 1)
      return mod.selectedDownloads[0].name;
    return null;
  }, [mod?.activeVariantArchive, mod?.selectedDownloads]);

  const switchableDownloads = activeArchiveName
    ? downloads.filter((d) => d.name !== activeArchiveName)
    : downloads;
  const hasDownloadVariants =
    mod?.status === ModStatus.Installed && switchableDownloads.length > 0;

  const optionsQuery = useQuery<ModFileTree>({
    queryKey: [
      "mod-options",
      mod?.remoteId,
      profileFolder,
      installedVpks.join("|"),
    ],
    enabled: !!mod && isOpen,
    queryFn: async () => {
      if (!mod) {
        throw new ValidationError("No mod selected");
      }
      return await invoke<ModFileTree>("get_mod_available_options", {
        modId: mod.remoteId,
        profileFolder,
        currentInstalledVpks: installedVpks,
        currentOriginalNames,
      });
    },
  });

  const { fileTree: unionFileTree, notOnDisk } = useMemo(
    () => buildUnionFileTree(optionsQuery.data ?? null, mod?.installedFileTree),
    [optionsQuery.data, mod?.installedFileTree],
  );

  const hasVpkVariants = unionFileTree.files.length > 1;
  const showButton =
    mod?.status === ModStatus.Installed &&
    downloads.length > 1 &&
    (hasVpkVariants || hasDownloadVariants);

  const applyMutation = useMutation<
    SwapModOptionsResult,
    Error,
    ApplyUnifiedPayload
  >({
    mutationFn: async ({ selectedVpkNames, selectedArchives }) => {
      if (!mod) {
        throw new ValidationError("No mod selected");
      }

      let combinedSelection = [...selectedVpkNames];

      if (selectedArchives.length > 0) {
        logger
          .withMetadata({
            modId: mod.remoteId,
            archiveCount: selectedArchives.length,
          })
          .info("Staging new download archives");

        for (const archive of selectedArchives) {
          const result = await invoke<StageDownloadArchiveResult>(
            "stage_download_archive",
            {
              modId: mod.remoteId,
              profileFolder,
              archiveUrl: archive.url,
              archiveName: archive.name,
            },
          );
          combinedSelection.push(...result.staged_originals);
        }
      }

      combinedSelection = [...new Set(combinedSelection)];

      const missingOriginals = combinedSelection.filter((n) =>
        notOnDisk.has(n),
      );

      if (missingOriginals.length > 0) {
        const archives = groupMissingByArchive(missingOriginals, mod);

        if (archives.length > 0) {
          const fetchResult = await invoke<FetchMissingModVariantsResult>(
            "fetch_missing_mod_variants",
            {
              modId: mod.remoteId,
              profileFolder,
              archives,
            },
          );

          if (fetchResult.missing_originals.length > 0) {
            throw new RuntimeError(
              t("modOptions.fetchMissingNotFound", {
                defaultValue:
                  "Some variants were not found in their source archives: {{names}}",
                names: fetchResult.missing_originals.join(", "),
              }),
            );
          }
        }
      }

      logger
        .withMetadata({
          modId: mod.remoteId,
          previousCount: installedVpks.length,
          newCount: combinedSelection.length,
          stagedArchives: selectedArchives.length,
        })
        .info("Applying unified variant selection");

      return await invoke<SwapModOptionsResult>("swap_mod_options", {
        modId: mod.remoteId,
        profileFolder,
        currentInstalledVpks: installedVpks,
        currentOriginalNames,
        selectedOriginalNames: combinedSelection,
      });
    },
    onSuccess: (result, { selectedArchives }) => {
      if (!mod) return;
      const mergedTree = mergeFileTreeAfterSwap(
        mod.installedFileTree,
        result.file_tree,
      );
      setInstalledVpks(mod.remoteId, result.installed_vpks, mergedTree);
      if (selectedArchives.length > 0) {
        const lastArchive = selectedArchives[selectedArchives.length - 1];
        setActiveVariantArchive(mod.remoteId, lastArchive.name);

        const existingNames = new Set(
          (mod.selectedDownloads ?? []).map((d) => d.name),
        );
        const newArchives = selectedArchives.filter(
          (a) => !existingNames.has(a.name),
        );
        if (newArchives.length > 0) {
          const updatedSelected = [
            ...(mod.selectedDownloads ?? []),
            ...newArchives,
          ];
          setSelectedDownloads(mod.remoteId, updatedSelected);
        }
      }
      toast.success(t("modOptions.applySuccess"));
      setIsOpen(false);
    },
    onError: (error) => {
      logger
        .withError(error instanceof Error ? error : new Error(String(error)))
        .error("Failed to apply variant change");
      const message =
        error instanceof Error ? error.message : t("modOptions.applyError");
      toast.error(message);
    },
  });

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  const apply = (
    selectedVpkNames: string[],
    selectedArchives: ModDownloadItem[],
  ) => {
    applyMutation.mutate({ selectedVpkNames, selectedArchives });
  };

  return {
    isOpen,
    open,
    close,
    apply,
    fileTree: unionFileTree.files.length > 0 ? unionFileTree : null,
    notOnDisk,
    isLoading: optionsQuery.isLoading,
    isSaving: applyMutation.isPending,
    showButton,
    switchableDownloads,
    onDiskArchiveNames: selectedDownloadNames,
    activeArchiveName,
  };
};
