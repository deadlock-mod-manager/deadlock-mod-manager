import {
  ExtractionError,
  ValidationError,
} from "@deadlock-mods/common/client-errors";
import type { ModDto } from "@deadlock-mods/shared";
import {
  type HeroDetectionResult,
  resolveDetectedHeroLabel,
} from "@deadlock-mods/hero-parser";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { useTranslation } from "react-i18next";
import { useProgress } from "@/components/downloads/progress-indicator";
import { PROFILE_VPKS_QUERY_KEY } from "@/hooks/use-vpk-scan";
import { ModCategory } from "@/lib/constants";
import { getModsStorePath } from "@/lib/download-cache";
import {
  generateFallbackModSVG,
  IMAGE_PATTERN,
  VPK_PATTERN,
} from "@/lib/file-patterns";
import {
  type ModSource,
  ensureDirectory,
  getFileBaseName,
  getSourceFilePath,
  fileToBytes,
  fileToDataUrl,
  writeFileBytes,
  writeFileText,
} from "@/lib/file-utils";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { getProfileVpkSnapshot } from "@/lib/tauri-commands";
import { isVpkOwned } from "@/lib/vpk-scan";
import { type LocalAddonInfo, ModStatus, type ModFileTree } from "@/types/mods";
import { invokeGuarded } from "@/lib/game-guard";

export interface ModMetadata {
  name: string;
  author?: string;
  link?: string;
  description?: string;
  imageFile?: File | null;
  // A cover hosted by the mod's source, shown instead of the local preview.
  imageUrl?: string | null;
  installSource?: string;
}

// Every source is on disk by now: picked, dropped as a path, or staged when it
// was dropped. Rust copies it, so its bytes never pass through the renderer.
const storeSourceFile = async (
  file: File,
  directory: string,
): Promise<string> => {
  const filePath = getSourceFilePath(file);
  if (!filePath) {
    throw new Error(`Mod source ${file.name} was not staged on disk`);
  }

  return invoke<string>("copy_dropped_mod_file", {
    filePath,
    targetDir: directory,
  });
};

// Sources backed by a file; the live bridge is built by the backend instead.
type FileSource = Exclude<ModSource, { kind: "liveBridge" }>;

const sourceFileName = (source: FileSource): string =>
  source.kind === "staged" ? source.fileName : getFileBaseName(source.file);

// Puts the source's file in `directory` and returns where it landed.
const placeSource = async (
  source: FileSource,
  directory: string,
): Promise<string> => {
  if (source.kind !== "staged") {
    return storeSourceFile(source.file, directory);
  }

  const destination = await join(directory, source.fileName);
  await invoke("place_staged_file", { path: source.path, destination });
  return destination;
};

export const useModProcessor = () => {
  const { t } = useTranslation();
  const { setProcessing } = useProgress();
  const queryClient = useQueryClient();
  const addMod = usePersistedStore((state) => state.addLocalMod);
  const setModStatus = usePersistedStore((state) => state.setModStatus);
  const setDetectedHero = usePersistedStore((state) => state.setDetectedHero);
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);

  // Kept beside the files folder, which receives the extracted VPKs.
  const extractArchive = async (
    source: FileSource,
    filesDir: string,
    modDir: string,
  ): Promise<string[]> => {
    const format = sourceFileName(source).split(".").pop()?.toUpperCase();

    setProcessing(true, t("addMods.storingArchive", { format }));
    const archivePath = await placeSource(source, modDir);

    setProcessing(true, t("addMods.extractingArchive", { format }));
    return invoke<string[]>("extract_archive", {
      archivePath,
      targetPath: filesDir,
    });
  };

  const processPreviewImage = async (
    metadata: ModMetadata,
    modDir: string,
  ): Promise<{ previewName: string; imageDataUrl: string }> => {
    let previewName = "preview.svg";
    let imageDataUrl: string;

    if (metadata.imageFile) {
      const extMatch = metadata.imageFile.name.match(IMAGE_PATTERN);
      previewName = `preview${extMatch ? extMatch[0].toLowerCase() : ".png"}`;

      await writeFileBytes(
        await join(modDir, previewName),
        await fileToBytes(metadata.imageFile),
      );

      imageDataUrl = await fileToDataUrl(metadata.imageFile);
    } else {
      const fallbackSVG = generateFallbackModSVG();
      await writeFileText(await join(modDir, previewName), fallbackSVG);
      imageDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(fallbackSVG)}`;
    }

    return { previewName, imageDataUrl };
  };

  const processMod = async (
    metadata: ModMetadata,
    category: ModCategory,
    detectedSource: ModSource,
  ): Promise<void> => {
    setProcessing(true, t("addMods.validatingMetadata"));

    const modId = `local-${crypto.randomUUID()}`;
    const modsRoot = await getModsStorePath();
    const modDir = await join(modsRoot, modId);
    const filesDir = await join(modDir, "files");

    setProcessing(true, t("addMods.creatingDirectories"));
    await ensureDirectory(modsRoot);
    await ensureDirectory(modDir);
    await ensureDirectory(filesDir);

    setProcessing(true, t("addMods.processingPreview"));
    const { previewName, imageDataUrl } = await processPreviewImage(
      metadata,
      modDir,
    );

    setProcessing(true, t("addMods.processingFiles"));
    try {
      if (detectedSource.kind === "liveBridge") {
        await invoke("build_live_bridge", { modId });
      } else {
        const vpks = VPK_PATTERN.test(sourceFileName(detectedSource))
          ? [await placeSource(detectedSource, filesDir)]
          : await extractArchive(detectedSource, filesDir, modDir);
        if (vpks.length === 0) {
          throw new ExtractionError(t("addMods.noVpkFoundInContent"));
        }
      }
    } catch (error) {
      // Nothing reached the library, so leave no folder behind.
      await invoke("remove_mod_folder", { modPath: modDir }).catch(
        (cleanupError) =>
          logger
            .withError(cleanupError)
            .warn("Failed to remove an incomplete mod folder"),
      );
      setProcessing(false);
      throw error;
    }

    setProcessing(true, t("addMods.processingFiles"));
    let fileTree: ModFileTree | null = null;
    try {
      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      await invokeGuarded("copy_local_mod_vpks", {
        modId: modId,
        profileFolder,
        isMap: category === ModCategory.MAPS,
      });

      // Scan the extracted files dir for fonts and emit the same event as the
      // download pipeline so the FontInstallDialog appears if any are found.
      await invoke("scan_and_stash_local_mod_fonts", {
        modId,
        filesDir,
      }).catch((error) => {
        logger
          .withMetadata({ filesDir, modId })
          .withError(error)
          .warn("Failed to scan local mod for bundled fonts");
      });

      try {
        fileTree = (await invoke("get_mod_file_tree", {
          modPath: modDir,
        })) as ModFileTree;
      } catch {}
    } catch (error) {
      setProcessing(false);
      toast.error((error as Error)?.message || "Unknown error");
      return;
    }

    setProcessing(true, t("addMods.savingMetadata"));
    const modMetadata = {
      id: modId,
      kind: "local",
      name: metadata.name,
      author: metadata.author || "Unknown",
      link: metadata.link || null,
      description: metadata.description || null,
      category,
      createdAt: new Date().toISOString(),
      preview: previewName,
      imageUrl: metadata.imageUrl ?? null,
      installSource: metadata.installSource ?? null,
      _schema: 1,
    };

    await writeFileText(
      await join(modDir, "metadata.json"),
      JSON.stringify(modMetadata, null, 2),
    );

    setProcessing(true, t("addMods.addingToLibrary"));
    const modDto: ModDto = {
      id: modId,
      remoteId: modId,
      name: modMetadata.name,
      description: modMetadata.description ?? "",
      remoteUrl: modMetadata.link ?? "local://manual",
      author: modMetadata.author,
      modAuthorId: null,
      downloadable: false,
      remoteAddedAt: new Date(modMetadata.createdAt),
      remoteUpdatedAt: new Date(modMetadata.createdAt),
      tags: [],
      images: [modMetadata.imageUrl ?? imageDataUrl],
      hero: null,
      isAudio: false,
      isMap: category === ModCategory.MAPS,
      audioUrl: null,
      isNSFW: false,
      createdAt: new Date(modMetadata.createdAt),
      updatedAt: new Date(modMetadata.createdAt),
      downloadCount: 0,
      likes: 0,
      isBlacklisted: false,
      blacklistReason: null,
      blacklistedAt: null,
      blacklistedBy: null,
      isObsolete: false,
      category,
      filesUpdatedAt: null,
      metadata: null,
      overrides: null,
      dependencies: null,
    };

    addMod(modDto, {
      status: ModStatus.Downloaded,
      installedFileTree: fileTree ?? undefined,
      installSource: metadata.installSource,
    });
    setModStatus(modId, ModStatus.Downloaded);

    invoke<HeroDetectionResult>("detect_mod_hero", { modId })
      .then((result) =>
        setDetectedHero(
          modId,
          resolveDetectedHeroLabel(result),
          result.usesCriticalPaths,
        ),
      )
      .catch(() => setDetectedHero(modId, null));

    setProcessing(true, t("addMods.modAddedSuccess"));
    toast.success(t("addMods.addedSuccess", { name: metadata.name }));
    setProcessing(false);
  };

  const processLocalAddon = async (
    metadata: ModMetadata,
    category: ModCategory,
    addon: Pick<LocalAddonInfo, "fileName" | "filePath" | "locator">,
  ): Promise<void> => {
    // The analysis list can be stale, so check the files on disk again. Two
    // library mods must never own one file: disabling either moves it away
    // from the other.
    const profileFolder = getActiveProfile()?.folderName ?? null;
    const snapshot = await getProfileVpkSnapshot(profileFolder);
    if (
      isVpkOwned(
        addon.locator,
        snapshot.manifest,
        usePersistedStore.getState().localMods,
      )
    ) {
      throw new ValidationError(
        t("addons.alreadyInLibrary", { fileName: addon.fileName }),
      );
    }

    setProcessing(true, t("addMods.validatingMetadata"));

    const modId = `local-${crypto.randomUUID()}`;
    const modsRoot = await getModsStorePath();
    const modDir = await join(modsRoot, modId);

    setProcessing(true, t("addMods.creatingDirectories"));
    await ensureDirectory(modsRoot);
    await ensureDirectory(modDir);

    setProcessing(true, t("addMods.processingPreview"));
    const { previewName, imageDataUrl } = await processPreviewImage(
      metadata,
      modDir,
    );

    setProcessing(true, t("addMods.savingMetadata"));
    const modMetadata = {
      id: modId,
      kind: "local",
      name: metadata.name,
      author: metadata.author || "Unknown",
      link: metadata.link || null,
      description: metadata.description || null,
      category,
      createdAt: new Date().toISOString(),
      preview: previewName,
      _schema: 1,
    };

    await writeFileText(
      await join(modDir, "metadata.json"),
      JSON.stringify(modMetadata, null, 2),
    );

    setProcessing(true, t("addMods.addingToLibrary"));
    try {
      // Record the file in the profile's manifest with the shard it sits in;
      // its name alone could match a file in another shard. The backend
      // refuses if a mod took the file since the check above.
      await invoke("register_analyzed_mod", {
        modId,
        modName: modMetadata.name,
        installedVpks: [addon.fileName],
        installedPaths: [addon.filePath],
        profileFolder,
        refuseExistingOwner: true,
      });
    } catch (error) {
      await invoke("remove_mod_folder", { modPath: modDir }).catch(
        (cleanupError) =>
          logger
            .withError(cleanupError)
            .warn("Failed to remove an incomplete mod folder"),
      );
      setProcessing(false);
      throw error;
    }

    const modDto: ModDto = {
      id: modId,
      remoteId: modId,
      name: modMetadata.name,
      description: modMetadata.description ?? "",
      remoteUrl: modMetadata.link ?? "local://manual",
      author: modMetadata.author,
      modAuthorId: null,
      downloadable: false,
      remoteAddedAt: new Date(modMetadata.createdAt),
      remoteUpdatedAt: new Date(modMetadata.createdAt),
      tags: [],
      images: [imageDataUrl],
      hero: null,
      isAudio: false,
      isMap: category === ModCategory.MAPS,
      audioUrl: null,
      isNSFW: false,
      createdAt: new Date(modMetadata.createdAt),
      updatedAt: new Date(modMetadata.createdAt),
      downloadCount: 0,
      likes: 0,
      isBlacklisted: false,
      blacklistReason: null,
      isObsolete: false,
      blacklistedAt: null,
      blacklistedBy: null,
      category,
      filesUpdatedAt: null,
      metadata: null,
      overrides: null,
      dependencies: null,
    };

    addMod(modDto, {
      status: ModStatus.Installed,
      installedVpks: [addon.fileName],
      installedFileTree: {
        files: [
          {
            name: addon.fileName,
            path: addon.fileName,
            size: 0,
            is_selected: true,
            archive_name: "",
          },
        ],
        total_files: 1,
        has_multiple_files: false,
      },
    });
    setModStatus(modId, ModStatus.Installed);
    queryClient.invalidateQueries({ queryKey: PROFILE_VPKS_QUERY_KEY });

    invoke<HeroDetectionResult>("detect_mod_hero", { modId })
      .then((result) =>
        setDetectedHero(
          modId,
          resolveDetectedHeroLabel(result),
          result.usesCriticalPaths,
        ),
      )
      .catch(() => setDetectedHero(modId, null));

    setProcessing(true, t("addMods.modAddedSuccess"));
    toast.success(t("addMods.addedSuccess", { name: metadata.name }));
    setProcessing(false);
  };

  return { processMod, processLocalAddon };
};
