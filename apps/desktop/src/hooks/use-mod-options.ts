import {
  RuntimeError,
  ValidationError,
} from "@deadlock-mods/common/client-errors";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Channel, invoke } from "@tauri-apps/api/core";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { modDownloadsQueryOptions } from "@/hooks/use-mod-downloads";
import { getErrorMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { isLocalMod } from "@/lib/mods/installed-helpers";
import {
  deriveActiveArchiveNames,
  deriveActiveVariantCount,
  deriveFilesForArchive,
  deriveReusableFilesForArchive,
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
  reused: boolean;
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

export const mergeFileTreeAfterSwap = (
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
  return deriveFilesForArchive(mod, archiveName).map((f) => f.name);
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

type StagedOriginals = Map<
  string,
  { archiveName: string; path: string; size: number }
>;

export interface AppliedArchiveSelection {
  result: SwapModOptionsResult;
  stagedOriginals: StagedOriginals;
}

interface ApplyArchiveSelectionOptions {
  profileFolder: string | null;
  /** Every archive the mod offers, in the author's order. */
  archiveNames: string[];
  setProgress: (progress: ModOptionsProgress) => void;
  t: TFunction;
}

/**
 * Downloads the newly selected archives and swaps the mod's files in the game
 * to the new selection. Manage files and 1-click links for another file of an
 * installed mod both add archives through here.
 */
export const applyArchiveSelection = async (
  mod: LocalMod,
  {
    selectedArchives,
    deselectedArchives,
  }: Pick<ApplyUnifiedPayload, "selectedArchives" | "deselectedArchives">,
  { profileFolder, archiveNames, setProgress, t }: ApplyArchiveSelectionOptions,
): Promise<AppliedArchiveSelection> => {
  const installedVpks = mod.installedVpks ?? [];
  const currentOriginalNames = deriveCurrentOriginalNames(mod);
  const stagedOriginals: StagedOriginals = new Map();
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
      // Rust sends the first phase, so a reused archive shows no download.
      // The listed size only stands in until the transfer reports a total.
      const onProgress = new Channel<StageArchiveProgress>((message) =>
        setProgress(
          message.phase === "downloading" && message.downloaded === 0
            ? {
                ...position,
                ...message,
                total: message.total ?? (archive.size || null),
              }
            : { ...position, ...message },
        ),
      );
      const reusableFiles = deriveReusableFilesForArchive(mod, archive);
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
          reusableOriginals: reusableFiles.map((f) => f.name),
          fileserverPreference:
            usePersistedStore.getState().fileserverPreference,
          onProgress,
        },
      );
      const staged = result.reused
        ? reusableFiles.map((f) => ({
            original: f.name,
            path: f.path,
            size: f.size,
          }))
        : result.staged;
      for (const { original, path, size } of staged) {
        stagedOriginals.set(original, {
          archiveName: archive.name,
          path,
          size,
        });
        combinedSelection.push(original);
        stagedThisApply.push(original);
      }
    }
  }

  const originalsToRemove = new Set(
    deselectedArchives
      .flatMap((archive) => deriveOriginalsForArchive(mod, archive.name))
      .filter((name) => !stagedOriginals.has(name)),
  );
  combinedSelection = [
    ...new Set(
      combinedSelection.filter((name) => !originalsToRemove.has(name)),
    ),
  ];
  const treeFiles = mod.installedFileTree?.files ?? [];
  const treeNames = new Set(treeFiles.map((f) => f.name));
  const stagedFiles: ModFile[] = [...stagedOriginals]
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

  const archives = groupMissingByArchive(
    combinedSelection.filter((n) => !treeNames.has(n)),
    mod,
  );
  if (archives.length > 0) {
    const fetchResult = await invoke<FetchMissingModVariantsResult>(
      "fetch_missing_mod_variants",
      {
        modId: mod.remoteId,
        profileFolder,
        archives,
        fileserverPreference: usePersistedStore.getState().fileserverPreference,
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
      newCount: combinedSelection.length,
      stagedArchives: selectedArchives.length,
    })
    .info("Applying unified file selection");
  setProgress({ phase: "applying" });

  const result = await invokeGuarded<SwapModOptionsResult>("swap_mod_options", {
    modId: mod.remoteId,
    profileFolder,
    currentInstalledVpks: installedVpks,
    currentOriginalNames,
    selectedOriginalNames: combinedSelection,
  });
  return { result, stagedOriginals };
};

/** Records an applied selection on the mod in the library. */
export const saveArchiveSelection = (
  mod: LocalMod,
  { result, stagedOriginals }: AppliedArchiveSelection,
  { selectedArchives, allCheckedArchiveNames }: ApplyUnifiedPayload,
  archiveNames: string[],
) => {
  const { setInstalledVpks, setActiveVariantArchive, setSelectedDownloads } =
    usePersistedStore.getState();

  const mergedTree = mergeFileTreeAfterSwap(
    mod.installedFileTree,
    {
      ...result.file_tree,
      files: result.file_tree.files.map((f) => {
        const staged = stagedOriginals.get(f.name);
        return staged ? { ...f, archive_name: staged.archiveName } : f;
      }),
    },
    archiveNames,
  );

  for (const f of mergedTree.files) {
    const staged = stagedOriginals.get(f.name);
    if (staged) {
      f.path = staged.path;
      f.size = staged.size;
    }
  }

  setInstalledVpks(mod.remoteId, result.installed_vpks, mergedTree);

  setActiveVariantArchive(mod.remoteId, allCheckedArchiveNames.join(","));

  // Existing entries keep their URL: a replaced upload's files weren't
  // written, so reuse stays off and the update check still offers it.
  const existing = mod.selectedDownloads ?? [];
  const existingNames = new Set(existing.map((d) => d.name));
  const newArchives = selectedArchives.filter(
    (a) => !existingNames.has(a.name),
  );
  if (newArchives.length > 0) {
    setSelectedDownloads(mod.remoteId, [...existing, ...newArchives]);
  }
};

export const useModOptions = (mod: LocalMod | null) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
  const setInstalledVpks = usePersistedStore((state) => state.setInstalledVpks);
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

  const archiveNames = downloads.map((d) => d.name);
  const [progress, setProgress] = useState<ModOptionsProgress | null>(null);

  const applyMutation = useMutation<
    AppliedArchiveSelection,
    Error,
    ApplyUnifiedPayload
  >({
    meta: { skipGlobalErrorHandler: true },
    onSettled: () => setProgress(null),
    mutationFn: async (payload) => {
      if (!mod) {
        throw new ValidationError("No mod selected");
      }
      return applyArchiveSelection(mod, payload, {
        profileFolder,
        archiveNames,
        setProgress,
        t,
      });
    },
    onSuccess: (applied, payload) => {
      if (!mod) return;
      saveArchiveSelection(mod, applied, payload, archiveNames);
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
