import {
  RuntimeError,
  ValidationError,
} from "@deadlock-mods/common/client-errors";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo, useRef, useState } from "react";
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
  selectedArchives: ModDownloadItem[];
  deselectedArchives: ModDownloadItem[];
  allCheckedArchiveNames: string[];
}

const deriveCurrentOriginalNames = (mod: LocalMod): string[] => {
  if (!mod.installedFileTree) {
    return mod.installedVpks ?? [];
  }
  const selected = mod.installedFileTree.files.filter((f) => f.is_selected);
  return selected.map((f) => f.name);
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
  const swapArchiveByName = new Map<string, string>();
  for (const f of swapResult.files) {
    if (f.archive_name) {
      swapArchiveByName.set(f.name, f.archive_name);
    }
  }
  const knownNames = new Set(previous.files.map((f) => f.name));

  const merged: ModFile[] = previous.files.map((f) => ({
    ...f,
    is_selected: selectedNames.has(f.name),
    archive_name: swapArchiveByName.get(f.name) ?? f.archive_name,
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

const deriveOriginalsForArchive = (
  mod: LocalMod,
  archiveName: string,
): string[] => {
  return (mod.installedFileTree?.files ?? [])
    .filter((f) => f.archive_name === archiveName)
    .map((f) => f.name);
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
  const onDiskArchiveNames = useMemo(
    () => new Set((mod?.selectedDownloads ?? []).map((d) => d.name)),
    [mod?.selectedDownloads],
  );

  const activeArchiveNames = useMemo(() => {
    const names = new Set<string>();
    for (const f of mod?.installedFileTree?.files ?? []) {
      if (f.is_selected && f.archive_name) names.add(f.archive_name);
    }
    if (names.size === 0 && mod?.activeVariantArchive) {
      for (const part of mod.activeVariantArchive.split(",")) {
        if (part) names.add(part);
      }
    }
    if (
      names.size === 0 &&
      mod?.selectedDownloads &&
      mod.selectedDownloads.length > 0
    ) {
      for (const d of mod.selectedDownloads) {
        names.add(d.name);
      }
    }
    return names;
  }, [
    mod?.installedFileTree,
    mod?.activeVariantArchive,
    mod?.selectedDownloads,
  ]);

  const showButton =
    mod?.status === ModStatus.Installed && downloads.length > 1;

  const stagedOriginalsMapRef = useRef(new Map<string, string>());

  const applyMutation = useMutation<
    SwapModOptionsResult,
    Error,
    ApplyUnifiedPayload
  >({
    mutationFn: async ({ selectedArchives, deselectedArchives }) => {
      if (!mod) {
        throw new ValidationError("No mod selected");
      }

      stagedOriginalsMapRef.current.clear();
      let combinedSelection = [...currentOriginalNames];

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
          for (const original of result.staged_originals) {
            stagedOriginalsMapRef.current.set(original, archive.name);
          }
          combinedSelection.push(...result.staged_originals);
        }
      }

      if (deselectedArchives.length > 0) {
        const originalsToRemove = new Set<string>();
        const stagedNames = new Set(stagedOriginalsMapRef.current.keys());
        for (const archive of deselectedArchives) {
          for (const name of deriveOriginalsForArchive(mod, archive.name)) {
            if (!stagedNames.has(name)) {
              originalsToRemove.add(name);
            }
          }
        }
        combinedSelection = combinedSelection.filter(
          (n) => !originalsToRemove.has(n),
        );
      }

      combinedSelection = [...new Set(combinedSelection)];

      const notOnDiskNames = new Set<string>();
      const onDiskByName = new Map<string, boolean>();
      for (const f of mod.installedFileTree?.files ?? []) {
        onDiskByName.set(f.name, true);
      }
      for (const n of combinedSelection) {
        if (!onDiskByName.has(n)) notOnDiskNames.add(n);
      }

      if (notOnDiskNames.size > 0) {
        const archives = groupMissingByArchive([...notOnDiskNames], mod);

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
        .info("Applying unified file selection");

      return await invoke<SwapModOptionsResult>("swap_mod_options", {
        modId: mod.remoteId,
        profileFolder,
        currentInstalledVpks: installedVpks,
        currentOriginalNames,
        selectedOriginalNames: combinedSelection,
      });
    },
    onSuccess: (result, { selectedArchives, allCheckedArchiveNames }) => {
      if (!mod) return;

      const mergedTree = mergeFileTreeAfterSwap(
        mod.installedFileTree,
        result.file_tree,
      );

      for (const f of mergedTree.files) {
        const archiveName = stagedOriginalsMapRef.current.get(f.name);
        if (archiveName) f.archive_name = archiveName;
      }

      setInstalledVpks(mod.remoteId, result.installed_vpks, mergedTree);

      if (allCheckedArchiveNames.length > 0) {
        setActiveVariantArchive(mod.remoteId, allCheckedArchiveNames.join(","));
      }

      if (selectedArchives.length > 0) {
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
        .error("Failed to apply file selection change");
      const message =
        error instanceof Error ? error.message : t("modOptions.applyError");
      toast.error(message);
    },
  });

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  const apply = (
    selectedArchives: ModDownloadItem[],
    deselectedArchives: ModDownloadItem[],
    allCheckedArchiveNames: string[],
  ) => {
    applyMutation.mutate({
      selectedArchives,
      deselectedArchives,
      allCheckedArchiveNames,
    });
  };

  return {
    isOpen,
    open,
    close,
    apply,
    isSaving: applyMutation.isPending,
    showButton,
    downloads,
    onDiskArchiveNames,
    activeArchiveNames,
  };
};
