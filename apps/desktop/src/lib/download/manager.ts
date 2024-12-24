import { DownloadableMod } from '@/types/mods';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { BaseDirectory, exists, mkdir } from '@tauri-apps/plugin-fs';
import { download } from '@tauri-apps/plugin-upload';
import { toast } from 'sonner';
import { getModDownload } from '../api';
import { createLogger } from '../logger';

const logger = createLogger('download-manager');

const createIfNotExists = async (path: string) => {
  logger.debug('Creating directory if not exists: ' + path);
  try {
    const dirExists = await exists(path, { baseDir: BaseDirectory.AppLocalData });
    if (!dirExists) {
      logger.info(`Creating ${path} directory`);
      await mkdir(path, { baseDir: BaseDirectory.AppLocalData });
    }
  } catch (error) {
    logger.error(error);
    toast.error(`Failed to create ${path} directory`);
  }
};

class DownloadManager {
  private queue: DownloadableMod[] = [];

  constructor() {
    this.queue = [];
  }

  addToQueue(mod: DownloadableMod) {
    this.queue.push(mod);
  }

  removeFromQueue(mod: DownloadableMod) {
    this.queue = this.queue.filter((m) => m.id !== mod.id);
  }

  async init() {
    await createIfNotExists('mods');
    logger.info('Download manager initialized');
  }

  async process() {
    if (this.queue.length === 0) return;
    const mod = this.queue.shift();
    if (!mod) return;

    try {
      mod.onStart();
      logger.info('Starting download', { mod: mod.remoteId });

      const modsDir = await appLocalDataDir();
      const modDir = await join(modsDir, 'mods', mod.remoteId);

      await createIfNotExists(modDir);

      if (!mod.downloads) {
        logger.info('Getting mod download links', { mod: mod.remoteId });
        const downloads = await getModDownload(mod.remoteId);
        mod.downloads = downloads;
      }

      logger.info(`Mod has ${mod.downloads.length} downloadable files`, { mod: mod.remoteId });

      const file = mod.downloads[0]; // TODO: handle multiple files

      logger.info('Downloading mod', { mod: mod.remoteId });
      await download(file.url, await join(modDir, `${file.name}`), (progress) => {
        mod.onProgress(progress);
        if (progress.progressTotal === progress.total) {
          logger.info('Download complete', { mod: mod.remoteId });
          mod.onComplete(modDir);
        }
      });
    } catch (error) {
      logger.error(error);
      toast.error('Failed to download mod');
      mod.onError(error as Error);
    }
  }
}

export const downloadManager = new DownloadManager();
