import type { ModDto } from '@deadlock-mods/utils';
import { invoke } from '@tauri-apps/api/core';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { BaseDirectory, readDir } from '@tauri-apps/plugin-fs';
import JSZip from 'jszip';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProgress } from '@/components/downloads/progress-indicator';
import type { ModCategory } from '@/lib/constants';
import {
  FALLBACK_MOD_SVG,
  IMAGE_PATTERN,
  VPK_PATTERN,
} from '@/lib/file-patterns';
import {
  type DetectedSource,
  ensureDirectory,
  fileToBytes,
  fileToDataUrl,
  writeFileBytes,
  writeFileText,
} from '@/lib/file-utils';
import { usePersistedStore } from '@/lib/store';
import { ModStatus } from '@/types/mods';

export interface ModMetadata {
  name: string;
  author?: string;
  link?: string;
  description?: string;
  imageFile?: File | null;
}

/**
 * Custom hook for processing and installing mods
 */
export const useModProcessor = () => {
  const { t } = useTranslation();
  const { setProcessing } = useProgress();
  const { addLocalMod: addMod, setModPath, setModStatus } = usePersistedStore();

  const processArchive = async (
    file: File,
    filesDir: string,
    modDir: string
  ): Promise<void> => {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const vpkEntry = Object.values(zip.files).find(
        (f) => !f.dir && VPK_PATTERN.test(f.name)
      );

      if (vpkEntry) {
        const buffer = await vpkEntry.async('uint8array');
        const baseName = vpkEntry.name.split('/').pop() || 'mod.vpk';
        await writeFileBytes(await join(filesDir, baseName), buffer);
      } else {
        await writeFileBytes(
          await join(modDir, file.name),
          await fileToBytes(file)
        );
        toast.error(t('addMods.noVpkFound'));
      }
    } else if (fileName.endsWith('.rar') || fileName.endsWith('.7z')) {
      const format = fileName.split('.').pop()?.toUpperCase();

      setProcessing(true, t('addMods.storingArchive', { format }));
      await writeFileBytes(
        await join(modDir, file.name),
        await fileToBytes(file)
      );

      // Extract archive using backend
      try {
        setProcessing(true, t('addMods.extractingArchive', { format }));
        const archivePath = await join(modDir, file.name);
        await invoke('extract_archive', {
          archivePath: await archivePath,
          targetPath: await filesDir,
        });
        toast.success(t('addMods.archiveExtractedSuccess', { format }));
      } catch {
        toast.error(t('addMods.failedToExtractArchive'));
      }
    } else {
      await writeFileBytes(
        await join(modDir, file.name),
        await fileToBytes(file)
      );
    }
  };

  const processPreviewImage = async (
    metadata: ModMetadata,
    modDir: string
  ): Promise<{ previewName: string; imageDataUrl: string }> => {
    let previewName = 'preview.svg';
    let imageDataUrl: string;

    if (metadata.imageFile) {
      const extMatch = metadata.imageFile.name.match(IMAGE_PATTERN);
      previewName = `preview${extMatch ? extMatch[0].toLowerCase() : '.png'}`;

      await writeFileBytes(
        await join(modDir, previewName),
        await fileToBytes(metadata.imageFile)
      );

      imageDataUrl = await fileToDataUrl(metadata.imageFile);
    } else {
      await writeFileText(await join(modDir, previewName), FALLBACK_MOD_SVG);
      imageDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(FALLBACK_MOD_SVG)}`;
    }

    return { previewName, imageDataUrl };
  };

  const validateFiles = async (
    filesDir: string,
    detectedSource: DetectedSource
  ): Promise<boolean> => {
    const filesList = await readDir(filesDir, {
      baseDir: BaseDirectory.AppLocalData,
    });
    const hasVpk = filesList.some((entry) =>
      VPK_PATTERN.test(entry.name || '')
    );

    if (hasVpk) {
      return true;
    }

    if (detectedSource.kind === 'archive') {
      const fileName = detectedSource.file.name.toLowerCase();
      if (fileName.endsWith('.rar') || fileName.endsWith('.7z')) {
        toast.info(t('addMods.archiveWillBeProcessed'));
        return true;
      }

      toast.warning(t('addMods.noVpkFoundStored'));
      return true;
    }

    toast.error(t('addMods.noVpkFoundInContent'));
    return false;
  };

  const processMod = async (
    metadata: ModMetadata,
    category: ModCategory,
    detectedSource: DetectedSource
  ): Promise<void> => {
    setProcessing(true, t('addMods.validatingMetadata'));

    const modId = `local-${crypto.randomUUID()}`;
    const base = await appLocalDataDir();
    const modsRoot = await join(base, 'mods');
    const modDir = await join(modsRoot, modId);
    const filesDir = await join(modDir, 'files');

    // Create directories
    setProcessing(true, t('addMods.creatingDirectories'));
    await ensureDirectory(modsRoot);
    await ensureDirectory(modDir);
    await ensureDirectory(filesDir);

    // Process preview image
    setProcessing(true, t('addMods.processingPreview'));
    const { previewName, imageDataUrl } = await processPreviewImage(
      metadata,
      modDir
    );

    // Process files
    setProcessing(true, t('addMods.processingFiles'));
    try {
      if (detectedSource.kind === 'vpk') {
        await writeFileBytes(
          await join(filesDir, detectedSource.file.name),
          await fileToBytes(detectedSource.file)
        );
      } else {
        await processArchive(detectedSource.file, filesDir, modDir);
      }
    } catch {
      toast.error(t('addMods.failedToProcessArchive'));
      await writeFileBytes(
        await join(modDir, detectedSource.file.name),
        await fileToBytes(detectedSource.file)
      );
    }

    // Validate files
    setProcessing(true, t('addMods.validatingFiles'));
    const isValid = await validateFiles(filesDir, detectedSource);
    if (!isValid) {
      setProcessing(false);
      return;
    }

    // Save metadata
    setProcessing(true, t('addMods.savingMetadata'));
    const modMetadata = {
      id: modId,
      kind: 'local',
      name: metadata.name,
      author: metadata.author || 'Unknown',
      link: metadata.link || null,
      description: metadata.description || null,
      category,
      createdAt: new Date().toISOString(),
      preview: previewName,
      _schema: 1,
    };

    await writeFileText(
      await join(modDir, 'metadata.json'),
      JSON.stringify(modMetadata, null, 2)
    );

    // Add to library
    setProcessing(true, t('addMods.addingToLibrary'));
    const modDto: ModDto = {
      id: modId,
      remoteId: modId,
      name: modMetadata.name,
      description: modMetadata.description ?? '',
      remoteUrl: modMetadata.link ?? 'local://manual',
      author: modMetadata.author,
      downloadable: false,
      remoteAddedAt: new Date(modMetadata.createdAt),
      remoteUpdatedAt: new Date(modMetadata.createdAt),
      tags: [],
      images: [imageDataUrl],
      hero: null,
      isAudio: false,
      audioUrl: null,
      isNSFW: false,
      createdAt: new Date(modMetadata.createdAt),
      updatedAt: new Date(modMetadata.createdAt),
      downloadCount: 0,
      likes: 0,
      category,
    };

    addMod(modDto, { path: modDir, status: ModStatus.Downloaded });
    setModPath(modId, modDir);
    setModStatus(modId, ModStatus.Downloaded);

    setProcessing(true, t('addMods.modAddedSuccess'));
    toast.success(t('addMods.addedSuccess', { name: metadata.name }));
    setProcessing(false);
  };

  return { processMod };
};
