import { listen } from '@tauri-apps/api/event';
import { fetch } from '@tauri-apps/plugin-http';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { getMod } from '@/lib/api';
import { downloadManager } from '@/lib/download/manager';
import logger from '@/lib/logger';
import { usePersistedStore } from '@/lib/store';
import { ModStatus } from '@/types/mods';
import useInstall from './use-install';

type DeepLinkData = {
  download_url: string;
  mod_type: string;
  mod_id: string;
};

type FileInfo = {
  name: string;
  size: number;
};

// Regex for GameBanana download IDs
const GAMEBANANA_MMDL_REGEX = /\/mmdl\/(\d+)/;

const getFileInfoFromHeaders = async (url: string): Promise<FileInfo> => {
  logger.info('Fetching file info from headers for URL:', url);

  try {
    // Make a HEAD request to get headers without downloading the file
    const response = await fetch(url, {
      method: 'HEAD',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Get file size from Content-Length header
    const contentLength =
      response.headers.get('content-length') ||
      response.headers.get('Content-Length');
    const size = contentLength ? Number.parseInt(contentLength, 10) : 0;

    // Determine file extension from Content-Type header
    const contentType =
      response.headers.get('content-type') ||
      response.headers.get('Content-Type') ||
      '';
    let extension = '.zip'; // Default fallback

    if (
      contentType.includes('application/x-rar-compressed') ||
      contentType.includes('application/x-rar')
    ) {
      extension = '.rar';
    } else if (
      contentType.includes('application/x-7z-compressed') ||
      contentType.includes('application/x-7z')
    ) {
      extension = '.7z';
    } else if (contentType.includes('application/zip')) {
      extension = '.zip';
    }

    // Generate filename from GameBanana download ID
    let name = `download${extension}`;
    if (url.includes('gamebanana.com/mmdl/')) {
      const match = url.match(GAMEBANANA_MMDL_REGEX);
      if (match?.[1]) {
        name = `gamebanana-${match[1]}${extension}`;
      }
    }

    logger.info('File info extracted from headers:', {
      name,
      size,
      contentType,
    });
    return { name, size };
  } catch (error) {
    logger.error('Failed to get file info from headers:', error);

    // Fallback to URL-based extraction if header request fails
    let name = 'download.zip';
    if (url.includes('gamebanana.com/mmdl/')) {
      const match = url.match(GAMEBANANA_MMDL_REGEX);
      if (match?.[1]) {
        name = `gamebanana-${match[1]}.zip`;
      }
    }

    return { name, size: 0 };
  }
};

export const useDeepLink = () => {
  const navigate = useNavigate();
  const {
    addLocalMod: addMod,
    setModStatus,
    setModProgress,
    setModPath,
    setInstalledVpks,
  } = usePersistedStore();
  const { install } = useInstall();
  const processingRef = useRef<Set<string>>(new Set());

  // biome-ignore lint/correctness/useExhaustiveDependencies: Store functions and navigate are stable, listener should only be set up once
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupDeepLinkListener = async () => {
      try {
        logger.debug('Setting up deep link listener...');

        unlisten = await listen<DeepLinkData>(
          'deep-link-received',
          async (event) => {
            const { download_url, mod_id } = event.payload;

            // Prevent duplicate processing of the same mod
            if (processingRef.current.has(mod_id)) {
              logger.warn('Already processing deep link for mod:', mod_id);
              return;
            }

            processingRef.current.add(mod_id);
            logger.info('Deep link received:', event.payload);

            try {
              // Navigate to the mod page first
              navigate(`/mods/${mod_id}`);

              // Fetch mod details from the API
              const modData = await getMod(mod_id);

              // Check if mod is already installed BEFORE downloading
              const currentMods = usePersistedStore.getState().localMods;
              const existingMod = currentMods.find(
                (m) => m.remoteId === modData.remoteId
              );
              if (existingMod?.status === ModStatus.Installed) {
                logger.info(
                  'Mod already installed, skipping download and installation:',
                  modData.remoteId
                );
                toast.success(`${modData.name} is already installed!`);
                // Just navigate to the mod page to show it's installed
                navigate(`/mods/${mod_id}`);
                // Remove from processing set since we're done
                processingRef.current.delete(mod_id);
                return;
              }

              // Add mod to local store
              addMod(modData);

              // Get file info from HTTP headers
              toast.success('Preparing 1-click mod download...');
              const fileInfo = await getFileInfoFromHeaders(download_url);

              // Start direct download and installation using the provided URL
              toast.success('Starting 1-click mod install...');

              downloadManager.addToQueue({
                ...modData,
                downloads: [
                  {
                    url: download_url,
                    name: fileInfo.name,
                    size: fileInfo.size,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ],
                onStart: () => {
                  setModStatus(modData.remoteId, ModStatus.Downloading);
                  logger.info(
                    'Started direct download for mod:',
                    modData.remoteId
                  );
                },
                onProgress: (progress) => {
                  setModProgress(modData.remoteId, progress);
                },
                onComplete: async (path) => {
                  // Set mod as downloaded
                  setModStatus(modData.remoteId, ModStatus.Downloaded);
                  setModPath(modData.remoteId, path);

                  logger.info(
                    'Download completed, starting auto-installation for mod:',
                    modData.remoteId
                  );
                  toast.success(
                    `${modData.name} downloaded! Installing automatically...`
                  );

                  // Create a local mod object for installation
                  const localMod = {
                    ...modData,
                    path,
                    status: ModStatus.Downloaded,
                  };

                  // Automatically start installation
                  try {
                    await install(localMod, {
                      onStart: (mod) => {
                        setModStatus(mod.remoteId, ModStatus.Installing);
                        logger.info(
                          'Started auto-installation for mod:',
                          mod.remoteId
                        );
                      },
                      onComplete: (mod, result) => {
                        setInstalledVpks(mod.remoteId, result.installed_vpks);
                        setModStatus(mod.remoteId, ModStatus.Installed);
                        toast.success(
                          `${mod.name} installed successfully via 1-click!`
                        );
                        logger.info(
                          'Auto-installation completed for mod:',
                          mod.remoteId
                        );
                        // Remove from processing set when fully complete
                        processingRef.current.delete(mod_id);
                      },
                      onError: (mod, error) => {
                        setModStatus(mod.remoteId, ModStatus.Error);
                        toast.error(
                          `Failed to install ${mod.name}: ${error.message}`
                        );
                        logger.error(
                          'Auto-installation failed for mod:',
                          mod.remoteId,
                          error
                        );
                        // Remove from processing set on error
                        processingRef.current.delete(mod_id);
                      },
                    });
                  } catch (error) {
                    logger.error('Failed to start auto-installation:', error);
                    toast.error(
                      `Downloaded but failed to install ${modData.name}. You can install it manually.`
                    );
                    // Remove from processing set on error
                    processingRef.current.delete(mod_id);
                  }
                },
                onError: (error) => {
                  setModStatus(modData.remoteId, ModStatus.Error);
                  toast.error(
                    `Failed to download ${modData.name}: ${error.message}`
                  );
                  logger.error(
                    'Direct download failed for mod:',
                    modData.remoteId,
                    error
                  );
                  // Remove from processing set on error
                  processingRef.current.delete(mod_id);
                },
              });
            } catch (error) {
              logger.error('Failed to process deep link:', error);
              toast.error(
                'Failed to process 1-click download. The mod may not exist or be unavailable.'
              );
              // Remove from processing set on error
              processingRef.current.delete(mod_id);
            }
          }
        );
      } catch (error) {
        logger.error('Failed to setup deep link listener:', error);
      }
    };

    setupDeepLinkListener();

    // Cleanup function
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);
};
