import type { ModDto } from "@deadlock-mods/shared";
import {
  type HeroDetectionResult,
  resolveDetectedHeroLabel,
} from "@deadlock-mods/hero-parser";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { BaseDirectory, readDir } from "@tauri-apps/plugin-fs";
import { useTranslation } from "react-i18next";
import { useProgress } from "@/components/downloads/progress-indicator";
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
import { ModStatus, type ModFileTree } from "@/types/mods";
import { invokeGuarded } from "@/lib/game-guard";

export interface ModMetadata {
  name: string;
  author?: string;
  link?: string;
  description?: string;
  imageFile?: File | null;
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

export const useModProcessor = () => {
  const { t } = useTranslation();
  const { setProcessing } = useProgress();
  const addMod = usePersistedStore((state) => state.addLocalMod);
  const setModStatus = usePersistedStore((state) => state.setModStatus);
  const setDetectedHero = usePersistedStore((state) => state.setDetectedHero);
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);

  const processArchive = async (
    file: File,
    filesDir: string,
    modDir: string,
  ): Promise<void> => {
    const format = getFileBaseName(file).split(".").pop()?.toUpperCase();

    setProcessing(true, t("addMods.storingArchive", { format }));
    const archivePath = await storeSourceFile(file, modDir);

    try {
      setProcessing(true, t("addMods.extractingArchive", { format }));
      await invoke("extract_archive", { archivePath, targetPath: filesDir });
      toast.success(t("addMods.archiveExtractedSuccess", { format }));
    } catch {
      toast.error(t("addMods.failedToExtractArchive"));
    }
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

  const validateFiles = async (
    filesDir: string,
    detectedSource: ModSource,
  ): Promise<boolean> => {
    const filesList = await readDir(filesDir, {
      baseDir: BaseDirectory.AppLocalData,
    });
    const hasVpk = filesList.some((entry) =>
      VPK_PATTERN.test(entry.name || ""),
    );

    if (hasVpk) {
      return true;
    }

    if (detectedSource.kind === "archive") {
      toast.info(t("addMods.archiveWillBeProcessed"));
      return true;
    }

    toast.error(t("addMods.noVpkFoundInContent"));
    return false;
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
    if (detectedSource.kind === "vpkPath") {
      await invoke("place_forge_payload", {
        path: detectedSource.path,
        destination: await join(filesDir, detectedSource.fileName),
      });
    } else if (detectedSource.kind === "liveBridge") {
      await invoke("build_live_bridge", { modId });
    } else {
      try {
        if (detectedSource.kind === "vpk") {
          await storeSourceFile(detectedSource.file, filesDir);
        } else {
          await processArchive(detectedSource.file, filesDir, modDir);
        }
      } catch {
        toast.error(t("addMods.failedToProcessArchive"));
        await storeSourceFile(detectedSource.file, modDir);
      }
    }

    setProcessing(true, t("addMods.validatingFiles"));
    const isValid = await validateFiles(filesDir, detectedSource);
    if (!isValid) {
      setProcessing(false);
      return;
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
    existingPath: string,
  ): Promise<void> => {
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

    const vpkFileName = existingPath.split(/[\\/]/).pop() || existingPath;
    addMod(modDto, {
      status: ModStatus.Installed,
      installedVpks: [vpkFileName],
      installedFileTree: {
        files: [
          {
            name: vpkFileName,
            path: vpkFileName,
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
