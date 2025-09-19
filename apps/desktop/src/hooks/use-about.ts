import { app } from "@tauri-apps/api";
import { useQuery } from "react-query";
import logger from "@/lib/logger";

export const fetchAboutData = async () => {
  try {
    const [version, name, tauriVersion] = await Promise.all([
      app.getVersion(),
      app.getName(),
      app.getTauriVersion(),
    ]);
    return { version, name, tauriVersion };
  } catch (error) {
    logger.error("Failed to fetch app information:", error);
    throw error;
  }
};

const useAbout = () => {
  const result = useQuery("about", fetchAboutData);
  return {
    ...result,
    version: result.data?.version,
  };
};

export default useAbout;
