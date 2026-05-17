import type { ModDto } from "@deadlock-mods/shared";
import type { HeroDetectionResult } from "@deadlock-mods/hero-parser";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { BaseDirectory, readDir } from "@tauri-apps/plugin-fs";
import JSZip from "jszip";
import { useTranslation } from "react-i18next";
import { useProgress } from "@/components/downloads/progress-indicator";
import { ModCategory } from "@/lib/constants";
import {
  CONFIG_PATTERN,
  generateFallbackModSVG,
  IMAGE_PATTERN,
  VPK_PATTERN,
} from "@/lib/file-patterns";
import {
  type DetectedSource,
  ensureDirectory,
  getFileBaseName,
  getFileName,
  fileToBytes,
  fileToDataUrl,
  writeFileBytes,
  writeFileText,
} from "@/lib/file-utils";
import logger from "@/lib/logger";
import {
  type ConfigDirectoryEntry,
  entriesContainConfigFile,
  entriesContainFileMatching,
} from "@/lib/mods/config-state";
import { usePersistedStore } from "@/lib/store";
import { ModStatus, type ModFileTree } from "@/types/mods";

interface PathBackedFile extends File {
  path?: string;
}

export interface ModMetadata {
  name: string;
  author?: string;
  link?: string;
  description?: string;
  imageFile?: File | null;
}

const getSourceFilePath = (file: File): string | null => {
  const filePath = (file as PathBackedFile).path;
  return typeof filePath === "string" && filePath.length > 0 ? filePath : null;
};

const readSourceFileBytes = async (file: File): Promise<Uint8Array> => {
  const filePath = getSourceFilePath(file);
  if (!filePath) {
    return fileToBytes(file);
  }

  const bytes = await invoke<number[]>("read_dropped_mod_file", { filePath });
  return new Uint8Array(bytes);
};

const normalizeConfigRelativeName = (name: string): string | null => {
  const parts = name.replace(/\\/g, "/").split("/").filter(Boolean);
  if (
    parts.length === 0 ||
    parts.some((part) => part === "." || part === "..")
  ) {
    return null;
  }

  const cfgIndex = parts.findIndex((part) => part.toLowerCase() === "cfg");
  const relativeParts = cfgIndex >= 0 ? parts.slice(cfgIndex + 1) : parts;
  const fileName = relativeParts.at(-1);

  if (!fileName || !CONFIG_PATTERN.test(fileName)) {
    return null;
  }

  return relativeParts.join("/");
};

const writeConfigFile = async (
  filesDir: string,
  relativeName: string,
  bytes: Uint8Array,
) => {
  const parts = relativeName.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) {
    return;
  }

  let targetDir = filesDir;
  for (const part of parts) {
    targetDir = await join(targetDir, part);
    await ensureDirectory(targetDir);
  }

  await writeFileBytes(await join(targetDir, fileName), bytes);
};

const readDirectoryEntriesRecursive = async (
  dir: string,
): Promise<ConfigDirectoryEntry[]> => {
  const entries = await readDir(dir, {
    baseDir: BaseDirectory.AppLocalData,
  });

  return await Promise.all(
    entries.map(async (entry): Promise<ConfigDirectoryEntry> => {
      if (!entry.isDirectory) {
        return { name: entry.name, isDirectory: entry.isDirectory };
      }

      const childDir = await join(dir, entry.name);
      return {
        name: entry.name,
        isDirectory: entry.isDirectory,
        children: await readDirectoryEntriesRecursive(childDir),
      };
    }),
  );
};

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
    const fileBytes = await readSourceFileBytes(file);

    if (fileName.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(fileBytes);
      const entries = Object.values(zip.files).filter((f) => !f.dir);
      const supportedEntries = entries.filter(
        (f) => VPK_PATTERN.test(f.name) || CONFIG_PATTERN.test(f.name),
      );

      if (supportedEntries.length > 0) {
        for (const entry of supportedEntries) {
          const buffer = await entry.async("uint8array");
          if (VPK_PATTERN.test(entry.name)) {
            const baseName = entry.name.split("/").pop() || "mod.vpk";
            await writeFileBytes(await join(filesDir, baseName), buffer);
            continue;
          }

          const relativeName = normalizeConfigRelativeName(entry.name);
          if (relativeName) {
            await writeConfigFile(filesDir, relativeName, buffer);
          }
        }
      } else {
        await writeFileBytes(await join(modDir, fileBaseName), fileBytes);
        toast.error(t("addMods.noSupportedFilesFound"));
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
    detectedSource: DetectedSource,
  ): Promise<boolean> => {
    const filesList = await readDirectoryEntriesRecursive(filesDir);
    const hasVpk = entriesContainFileMatching(filesList, VPK_PATTERN);
    const hasConfig = entriesContainConfigFile(filesList);

    if (hasVpk || hasConfig || detectedSource.kind === "config") {
      return true;
    }

    if (detectedSource.kind === "archive") {
      const fileName = getFileBaseName(detectedSource.file).toLowerCase();
      if (fileName.endsWith(".rar") || fileName.endsWith(".7z")) {
        toast.info(t("addMods.archiveWillBeProcessed"));
        return true;
      }

      toast.warning(t("addMods.noSupportedFilesStored"));
      return true;
    }

    toast.error(t("addMods.noSupportedFilesInContent"));
    return false;
  };

  const processMod = async (
    metadata: ModMetadata,
    category: ModCategory,
    detectedSource: DetectedSource,
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
    try {
      if (detectedSource.kind === "vpk") {
        const fileName = getFileBaseName(detectedSource.file);
        await writeFileBytes(
          await join(filesDir, fileName),
          await readSourceFileBytes(detectedSource.file),
        );
      } else if (detectedSource.kind === "config") {
        for (const file of detectedSource.files) {
          const relativeName =
            normalizeConfigRelativeName(getFileName(file)) ??
            getFileBaseName(file);
          await writeConfigFile(
            filesDir,
            relativeName,
            await readSourceFileBytes(file),
          );
        }
      } else {
        await processArchive(detectedSource.file, filesDir, modDir);
      }
    } catch {
      if (detectedSource.kind === "config") {
        setProcessing(false);
        toast.error(t("addMods.failedToProcessArchive"));
        return;
      }

      const fileName = getFileBaseName(detectedSource.file);
      toast.error(t("addMods.failedToProcessArchive"));
      await writeFileBytes(
        await join(modDir, fileName),
        await readSourceFileBytes(detectedSource.file),
      );
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
    };

    addMod(modDto, {
      status: ModStatus.Downloaded,
      installedFileTree: fileTree ?? undefined,
      isConfig:
        fileTree?.files.some((file) => file.kind === "config") ??
        detectedSource.kind === "config",
    });
    setModStatus(modId, ModStatus.Downloaded);

    invoke<HeroDetectionResult>("detect_mod_hero", { modId })
      .then((result) =>
        setDetectedHero(modId, result.hero ?? null, result.usesCriticalPaths),
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
        setDetectedHero(modId, result.hero ?? null, result.usesCriticalPaths),
      )
      .catch(() => setDetectedHero(modId, null));

    setProcessing(true, t("addMods.modAddedSuccess"));
    toast.success(t("addMods.addedSuccess", { name: metadata.name }));
    setProcessing(false);
  };

  return { processMod, processLocalAddon };
};
