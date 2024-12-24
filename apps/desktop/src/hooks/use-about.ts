import logger from '@/lib/logger';
import { app } from '@tauri-apps/api';
import { useQuery } from 'react-query';

export const fetchAboutData = async () => {
  try {
    const [version, name, tauriVersion] = await Promise.all([app.getVersion(), app.getName(), app.getTauriVersion()]);
    return { version, name, tauriVersion };
  } catch (error) {
    logger.error('Failed to fetch app information:', error);
    throw error;
  }
};

const useAbout = () => useQuery('about', fetchAboutData);

export default useAbout;
