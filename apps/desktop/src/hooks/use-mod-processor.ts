import type { ModDto } from "@deadlock-mods/shared";
import {
  type HeroDetectionResult,
  resolveDetectedHeroLabel,
} from "@deadlock-mods/hero-parser";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { BaseDirectory, readDir } from "@tauri-apps/plugin-fs";
import JSZip from "jszip";
import { useTranslation } from "react-i18next";
import { useProgress } from "@/components/downloads/progress-indicator";
import { ModCategory } from "@/lib/constants";
import {
  generateFallbackModSVG,
  IMAGE_PATTERN,
  VPK_PATTERN,
} from "@/lib/file-patterns";
import {
  type ModSource,
  MAX_BROWSER_MOD_FILE_BYTES,
  ensureDirectory,
  exceedsBrowserModFileLimit,
  getFileBaseName,
  getImportSourceFileName,
  fileToBytes,
  fileToDataUrl,
  writeFileBytes,
  writeFileText,
} from "@/lib/file-utils";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { ModStatus, type ModFileTree } from "@/types/mods";

export interface ModMetadata {
  name: string;
  author?: string;
  link?: string;
  description?: string;
  imageFile?: File | null;
}

export const useModProcessor = () => {
  const { t } = useTranslation();
  const { setProcessing } = useProgress();
  const {
    addLocalMod: addMod,
    setModStatus,
    setDetectedHero,
    getActiveProfile,
  } = usePersistedStore();

  const processArchive = async (
    file: File,
    filesDir: string,
    modDir: string,
  ): Promise<void> => {
    const fileBaseName = getFileBaseName(file);
    const fileName = fileBaseName.toLowerCase();
    const fileBytes = await fileToBytes(file);

    if (fileName.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(fileBytes);
      const vpkEntry = Object.values(zip.files).find(
        (f) => !f.dir && VPK_PATTERN.test(f.name),
      );

      if (vpkEntry) {
        const buffer = await vpkEntry.async("uint8array");
        const baseName = vpkEntry.name.split("/").pop() || "mod.vpk";
        await writeFileBytes(await join(filesDir, baseName), buffer);
      } else {
        await writeFileBytes(await join(modDir, fileBaseName), fileBytes);
        toast.error(t("addMods.noVpkFound"));
      }
    } else if (fileName.endsWith(".rar") || fileName.endsWith(".7z")) {
      const format = fileName.split(".").pop()?.toUpperCase();

      setProcessing(true, t("addMods.storingArchive", { format }));
      await writeFileBytes(await join(modDir, fileBaseName), fileBytes);

      // Extract archive using backend
      try {
        setProcessing(true, t("addMods.extractingArchive", { format }));
        const archivePath = await join(modDir, fileBaseName);
        await invoke("extract_archive", {
          archivePath: await archivePath,
          targetPath: await filesDir,
        });
        toast.success(t("addMods.archiveExtractedSuccess", { format }));
      } catch {
        toast.error(t("addMods.failedToExtractArchive"));
      }
    } else {
      await writeFileBytes(await join(modDir, fileBaseName), fileBytes);
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
      const fileName = getImportSourceFileName(
        detectedSource.source,
      ).toLowerCase();
      if (fileName.endsWith(".rar") || fileName.endsWith(".7z")) {
        toast.info(t("addMods.archiveWillBeProcessed"));
        return true;
      }

      toast.warning(t("addMods.noVpkFoundStored"));
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
    const base = await appLocalDataDir();
    const modsRoot = await join(base, "mods");
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
    } else if (detectedSource.source.type === "nativePath") {
      let importedVpkFiles: string[];
      try {
        importedVpkFiles = await invoke<string[]>(
          "import_path_backed_mod_file",
          {
            filePath: detectedSource.source.path,
            modId,
          },
        );
      } catch (error) {
        logger
          .withMetadata({
            fileName: detectedSource.source.fileName,
            modId,
            sourceKind: detectedSource.kind,
          })
          .withError(error)
          .error("Failed to import path-backed mod file");
        toast.error(t("addMods.failedToImportMod"));
        throw error;
      }

      if (detectedSource.kind === "archive") {
        const format = detectedSource.source.fileName
          .split(".")
          .at(-1)
          ?.toUpperCase();
        toast.success(t("addMods.archiveExtractedSuccess", { format }));
      }

      if (importedVpkFiles.length === 0) {
        toast.error(t("addMods.noVpkFoundInContent"));
        setProcessing(false);
        return;
      }
    } else {
      if (exceedsBrowserModFileLimit(detectedSource)) {
        throw new Error(
          t("addMods.browserFileTooLarge", {
            limit: MAX_BROWSER_MOD_FILE_BYTES / 1024 / 1024,
          }),
        );
      }

      const browserFile = detectedSource.source.file;
      try {
        if (detectedSource.kind === "vpk") {
          const fileName = getFileBaseName(browserFile);
          await writeFileBytes(
            await join(filesDir, fileName),
            await fileToBytes(browserFile),
          );
        } else {
          await processArchive(browserFile, filesDir, modDir);
        }
      } catch {
        const fileName = getFileBaseName(browserFile);
        toast.error(t("addMods.failedToProcessArchive"));
        await writeFileBytes(
          await join(modDir, fileName),
          await fileToBytes(browserFile),
        );
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

      await invoke("copy_local_mod_vpks", {
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
    const base = await appLocalDataDir();
    const modsRoot = await join(base, "mods");
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
