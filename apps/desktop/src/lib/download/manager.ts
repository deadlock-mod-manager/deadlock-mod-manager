import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { BaseDirectory, exists, mkdir } from '@tauri-apps/plugin-fs';
import { download } from '@tauri-apps/plugin-upload';
import { toast } from 'sonner';
import type { DownloadableMod } from '@/types/mods';
import { getModDownload } from '../api';
import { createLogger } from '../logger';

const logger = createLogger('download-manager');

const createIfNotExists = async (path: string) => {
  logger.debug(`Creating directory if not exists: ${path}`);
  try {
    const dirExists = await exists(path, {
      baseDir: BaseDirectory.AppLocalData,
    });
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
  private readonly progressUpdateTimers: Record<
    string,
    { lastUpdate: number; timerId: number | null }
  > = {};
  private readonly THROTTLE_MS = 500; // Only update progress every 500ms

  constructor() {
    this.queue = [];
  }

  addToQueue(mod: DownloadableMod) {
    this.queue.push(mod);
  }

  removeFromQueue(mod: DownloadableMod) {
    this.queue = this.queue.filter((m) => m.id !== mod.id);
    // Clean up any timers
    if (this.progressUpdateTimers[mod.remoteId]) {
      if (this.progressUpdateTimers[mod.remoteId].timerId) {
        clearTimeout(
          this.progressUpdateTimers[mod.remoteId].timerId as unknown as number
        );
      }
      delete this.progressUpdateTimers[mod.remoteId];
    }
  }

  async init() {
    await createIfNotExists('mods');
    logger.info('Download manager initialized');
  }

  // Throttled progress update to prevent storage spam
  private throttledProgressUpdate(mod: DownloadableMod, progress: any) {
    const now = Date.now();
    const modId = mod.remoteId;

    // Initialize timer entry if it doesn't exist
    if (!this.progressUpdateTimers[modId]) {
      this.progressUpdateTimers[modId] = {
        lastUpdate: 0,
        timerId: null,
      };
    }

    const timerEntry = this.progressUpdateTimers[modId];

    // Always process 100% complete updates immediately
    const isComplete = progress.progressTotal === progress.total;

    // If enough time has passed since last update or download is complete
    if (isComplete || now - timerEntry.lastUpdate >= this.THROTTLE_MS) {
      // Clear any pending timer
      if (timerEntry.timerId !== null) {
        clearTimeout(timerEntry.timerId as unknown as number);
        timerEntry.timerId = null;
      }

      // Update progress immediately
      mod.onProgress(progress);
      timerEntry.lastUpdate = now;

      // Handle completion
      if (isComplete) {
        logger.info('Download complete', { mod: modId });
      }
    }
    // If there's no pending timer and we're not at the throttle interval yet
    else if (timerEntry.timerId === null) {
      // Schedule an update for when the throttle interval is reached
      const delay = this.THROTTLE_MS - (now - timerEntry.lastUpdate);
      timerEntry.timerId = setTimeout(() => {
        mod.onProgress(progress);
        timerEntry.lastUpdate = Date.now();
        timerEntry.timerId = null;
      }, delay) as unknown as number;
    }
    // Otherwise, we already have a pending update scheduled, so do nothing
  }

  async process() {
    if (this.queue.length === 0) {
      return;
    }
    const mod = this.queue.shift();
    if (!mod) {
      return;
    }

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

      logger.info(`Mod has ${mod.downloads.length} downloadable files`, {
        mod: mod.remoteId,
      });

      const file = mod.downloads[0]; // TODO: handle multiple files

      logger.info('Downloading mod', { mod: mod.remoteId });
      await download(
        file.url,
        await join(modDir, `${file.name}`),
        (progress) => {
          this.throttledProgressUpdate(mod, progress);
          if (progress.progressTotal === progress.total) {
            mod.onComplete(modDir);
            // Clean up timer entry when done
            if (this.progressUpdateTimers[mod.remoteId]) {
              delete this.progressUpdateTimers[mod.remoteId];
            }
          }
        }
      );
    } catch (error) {
      logger.error(error);
      toast.error('Failed to download mod');
      mod.onError(error as Error);
      // Clean up timer entry on error
      if (this.progressUpdateTimers[mod.remoteId]) {
        delete this.progressUpdateTimers[mod.remoteId];
      }
    }
  }
}

export const downloadManager = new DownloadManager();
