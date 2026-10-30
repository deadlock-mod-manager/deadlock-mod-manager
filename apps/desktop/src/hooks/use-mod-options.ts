import {
  RuntimeError,
  ValidationError,
} from "@deadlock-mods/common/client-errors";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Channel, invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { modDownloadsQueryOptions } from "@/hooks/use-mod-downloads";
import { getErrorMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { isLocalMod } from "@/lib/mods/installed-helpers";
import {
  deriveActiveArchiveNames,
  deriveActiveVariantCount,
} from "@/lib/mods/mod-variants";
import {
  insertFilesInAuthorOrder,
  sortNamesInLoadOrder,
} from "@/lib/mods/vpk-load-order";
import { usePersistedStore } from "@/lib/store";
import { isTauriError } from "@/types/tauri";
import {
  type LocalMod,
  type ModDownloadItem,
  type ModFile,
  type ModFileTree,
  ModStatus,
} from "@/types/mods";
import { invokeGuarded } from "@/lib/game-guard";

const logger = createLogger("use-mod-options");

type StageArchiveProgress =
  | { phase: "downloading"; downloaded: number; total: number | null }
  | { phase: "extracting" }
  | { phase: "copying" };

export type ModOptionsProgress =
  | (StageArchiveProgress & {
      archiveName: string;
      index: number;
      count: number;
    })
  | { phase: "applying" };

interface SwapModOptionsResult {
  installed_vpks: string[];
  original_vpk_names: string[];
  file_tree: ModFileTree;
}

interface StageDownloadArchiveResult {
  staged: { original: string; path: string; size: number }[];
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
  archiveNames: string[],
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

  const kept: ModFile[] = previous.files.map((f) => ({
    ...f,
    is_selected: selectedNames.has(f.name),
    archive_name: swapArchiveByName.get(f.name) ?? f.archive_name,
  }));

  const merged = insertFilesInAuthorOrder(
    kept,
    swapResult.files.filter((f) => !knownNames.has(f.name)),
    archiveNames,
  );

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

// Trees saved before variant names were made unique can give several archives
// the same name, which says nothing about which archive's file is on disk.
const deriveOwnedOriginalsForArchive = (
  mod: LocalMod,
  archiveName: string,
): string[] => {
  const otherArchiveNames = new Set(
    (mod.installedFileTree?.files ?? [])
      .filter((f) => f.archive_name !== archiveName)
      .map((f) => f.name),
  );
  return deriveOriginalsForArchive(mod, archiveName).filter(
    (name) => !otherArchiveNames.has(name),
  );
};

// Entries without an archive claim nothing: their file may be this archive's.
const deriveClaimedOriginals = (mod: LocalMod, archiveName: string): string[] =>
  (mod.installedFileTree?.files ?? [])
    .filter((f) => f.archive_name && f.archive_name !== archiveName)
    .map((f) => f.name);

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
  const setModDownloads = usePersistedStore((state) => state.setModDownloads);

  const profileFolder = getActiveProfile()?.folderName ?? null;
  const installedVpks = mod?.installedVpks ?? [];
  const currentOriginalNames = mod ? deriveCurrentOriginalNames(mod) : [];

  // Stored file IDs go stale when the author replaces files, and staging a
  // file GameBanana no longer has fails, so the dialog reads the live list.
  const { data: liveDownloads } = useQuery({
    ...modDownloadsQueryOptions(mod?.remoteId ?? ""),
    enabled: isOpen && !!mod && !isLocalMod(mod),
  });
  const downloads = liveDownloads?.downloads ?? mod?.downloads ?? [];

  useEffect(() => {
    if (!mod || !liveDownloads) return;
    const stored = (mod.downloads ?? []).map((d) => d.url).join(",");
    const live = liveDownloads.downloads.map((d) => d.url).join(",");
    if (stored !== live) {
      setModDownloads(mod.remoteId, liveDownloads.downloads);
    }
  }, [mod, liveDownloads, setModDownloads]);
  const onDiskArchiveNames = useMemo(
    () =>
      new Set([
        ...(mod?.selectedDownloads ?? []).map((d) => d.name),
        ...(mod?.installedFileTree?.files ?? []).flatMap((file) =>
          file.archive_name ? [file.archive_name] : [],
        ),
        ...deriveActiveArchiveNames(mod),
      ]),
    [mod?.selectedDownloads, mod?.installedFileTree, mod?.activeVariantArchive],
  );

  const activeArchiveNames = useMemo(
    () => deriveActiveArchiveNames(mod),
    [mod?.installedFileTree, mod?.activeVariantArchive, mod?.selectedDownloads],
  );

  const activeVariantCount = useMemo(
    () => deriveActiveVariantCount(mod),
    [
      mod?.installedFileTree,
      mod?.activeVariantArchive,
      mod?.selectedDownloads,
      mod?.installedVpks,
    ],
  );

  const fileTree = mod?.installedFileTree;
  const showButton =
    mod?.status === ModStatus.Installed &&
    (downloads.length > 1 || (fileTree?.files.length ?? 0) > 1);

  const stagedOriginalsMapRef = useRef(
    new Map<string, { archiveName: string; path: string; size: number }>(),
  );
  const archiveNames = downloads.map((d) => d.name);
  const [progress, setProgress] = useState<ModOptionsProgress | null>(null);

  const applyMutation = useMutation<
    SwapModOptionsResult,
    Error,
    ApplyUnifiedPayload
  >({
    meta: { skipGlobalErrorHandler: true },
    onSettled: () => setProgress(null),
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

        // Archives staged earlier in this apply aren't in the tree yet.
        const stagedThisApply: string[] = [];
        for (const [index, archive] of selectedArchives.entries()) {
          const position = {
            archiveName: archive.name,
            index,
            count: selectedArchives.length,
          };
          setProgress({
            ...position,
            phase: "downloading",
            downloaded: 0,
            total: archive.size || null,
          });
          const onProgress = new Channel<StageArchiveProgress>((message) =>
            setProgress({ ...position, ...message }),
          );
          const result = await invoke<StageDownloadArchiveResult>(
            "stage_download_archive",
            {
              modId: mod.remoteId,
              profileFolder,
              archiveUrl: archive.url,
              archiveName: archive.name,
              knownOriginals: deriveOwnedOriginalsForArchive(mod, archive.name),
              claimedOriginals: [
                ...deriveClaimedOriginals(mod, archive.name),
                ...stagedThisApply,
              ],
              fileserverPreference:
                usePersistedStore.getState().fileserverPreference,
              onProgress,
            },
          );
          for (const { original, path, size } of result.staged) {
            stagedOriginalsMapRef.current.set(original, {
              archiveName: archive.name,
              path,
              size,
            });
            combinedSelection.push(original);
            stagedThisApply.push(original);
          }
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
      const treeFiles = mod.installedFileTree?.files ?? [];
      const treeNames = new Set(treeFiles.map((f) => f.name));
      const stagedFiles: ModFile[] = [...stagedOriginalsMapRef.current]
        .filter(([name]) => !treeNames.has(name))
        .map(([name, staged]) => ({
          name,
          path: staged.path,
          size: 0,
          is_selected: true,
          archive_name: staged.archiveName,
        }));
      combinedSelection = sortNamesInLoadOrder(
        combinedSelection,
        insertFilesInAuthorOrder(treeFiles, stagedFiles, archiveNames),
      );

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
              fileserverPreference:
                usePersistedStore.getState().fileserverPreference,
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
      setProgress({ phase: "applying" });

      return await invokeGuarded<SwapModOptionsResult>("swap_mod_options", {
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
        {
          ...result.file_tree,
          files: result.file_tree.files.map((f) => {
            const staged = stagedOriginalsMapRef.current.get(f.name);
            return staged ? { ...f, archive_name: staged.archiveName } : f;
          }),
        },
        archiveNames,
      );

      for (const f of mergedTree.files) {
        const staged = stagedOriginalsMapRef.current.get(f.name);
        if (staged) {
          f.path = staged.path;
          f.size = staged.size;
        }
      }

      setInstalledVpks(mod.remoteId, result.installed_vpks, mergedTree);

      setActiveVariantArchive(mod.remoteId, allCheckedArchiveNames.join(","));

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
      if (isTauriError(error) && error.kind === "downloadCancelled") {
        logger.info("Variant download cancelled");
        setIsOpen(false);
        return;
      }
      logger.withError(error).error("Failed to apply file selection change");
      toast.error(getErrorMessage(error));
    },
  });

  const fileSelectionMutation = useMutation<
    SwapModOptionsResult,
    Error,
    string[]
  >({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async (selectedNames) => {
      if (!mod) {
        throw new ValidationError("No mod selected");
      }

      // Files left unchecked at install time were never copied to the addons
      // folder, so they have to come out of their archive again.
      const currentNames = new Set(currentOriginalNames);
      const newlyEnabled = selectedNames.filter((n) => !currentNames.has(n));
      const archives = groupMissingByArchive(newlyEnabled, mod);
      if (archives.length > 0) {
        const fetchResult = await invoke<FetchMissingModVariantsResult>(
          "fetch_missing_mod_variants",
          {
            modId: mod.remoteId,
            profileFolder,
            archives,
            fileserverPreference:
              usePersistedStore.getState().fileserverPreference,
          },
        );
        if (fetchResult.missing_originals.length > 0) {
          throw new RuntimeError(
            t("modOptions.fetchMissingNotFound", {
              names: fetchResult.missing_originals.join(", "),
            }),
          );
        }
      }

      logger
        .withMetadata({
          modId: mod.remoteId,
          previousCount: installedVpks.length,
          newCount: selectedNames.length,
        })
        .info("Applying per-file selection");

      return await invokeGuarded<SwapModOptionsResult>("swap_mod_options", {
        modId: mod.remoteId,
        profileFolder,
        currentInstalledVpks: installedVpks,
        currentOriginalNames,
        selectedOriginalNames: sortNamesInLoadOrder(
          selectedNames,
          mod.installedFileTree?.files ?? [],
        ),
      });
    },
    onSuccess: (result) => {
      if (!mod) return;
      const mergedTree = mergeFileTreeAfterSwap(
        mod.installedFileTree,
        result.file_tree,
        archiveNames,
      );
      setInstalledVpks(mod.remoteId, result.installed_vpks, mergedTree);
      const activeArchives = new Set(
        mergedTree.files
          .filter((f) => f.is_selected && f.archive_name)
          .map((f) => f.archive_name),
      );
      setActiveVariantArchive(mod.remoteId, [...activeArchives].join(","));
      toast.success(t("modOptions.applySuccess"));
      setIsOpen(false);
    },
    onError: (error) => {
      logger.withError(error).error("Failed to apply per-file selection");
      toast.error(getErrorMessage(error));
    },
  });

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  // Only the download can be stopped; extracting and applying run to the end.
  const cancelApply =
    mod && progress?.phase === "downloading"
      ? () => invoke("cancel_stage_download_archive", { modId: mod.remoteId })
      : undefined;

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
    progress,
    cancelApply,
    applyFileSelection: fileSelectionMutation.mutate,
    isSavingFiles: fileSelectionMutation.isPending,
    showButton,
    fileTree,
    downloads,
    onDiskArchiveNames,
    activeArchiveNames,
    activeVariantCount,
  };
};
