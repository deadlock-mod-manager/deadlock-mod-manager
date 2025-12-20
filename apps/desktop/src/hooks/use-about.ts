import { useQuery } from "@tanstack/react-query";
import { app } from "@tauri-apps/api";
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
    logger
      .withError(error instanceof Error ? error : new Error(String(error)))
      .error("Failed to fetch app information");
    throw error;
  }
};

const useAbout = () => {
  const result = useQuery({
    queryKey: ["about"],
    queryFn: fetchAboutData,
  });
  return {
    ...result,
    version: result.data?.version,
  };
};

export default useAbout;
