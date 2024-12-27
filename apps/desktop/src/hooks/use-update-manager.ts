import { createLogger } from '@/lib/logger';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, Update } from '@tauri-apps/plugin-updater';
import { useState } from 'react';

const logger = createLogger('updater');

const useUpdateManager = () => {
  const [update, setUpdate] = useState<Update | null>(null);
  const [downloaded, setDownloaded] = useState(0);
  const [size, setSize] = useState(0);

  const checkForUpdates = async () => {
    const update = await check();
    setUpdate(update);
    return !!update;
  };

  const updateAndRelaunch = async () => {
    if (!update) return;

    // alternatively we could also call update.download() and update.install() separately
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          setSize(event.data.contentLength ?? 0);
          logger.info(`started downloading ${event.data.contentLength} bytes`);
          break;
        case 'Progress':
          setDownloaded((prev) => prev + event.data.chunkLength);
          logger.info(`downloaded ${downloaded} from ${size}`);
          break;
        case 'Finished':
          logger.info('download finished');
          break;
      }
    });
    await relaunch();
  };

  return { update, checkForUpdates, updateAndRelaunch };
};

export default useUpdateManager;
