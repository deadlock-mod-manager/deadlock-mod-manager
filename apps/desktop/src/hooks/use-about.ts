import { useQuery } from "@tanstack/react-query";
import { app } from "@tauri-apps/api";
import logger from "@/lib/logger";
import { STALE_TIME_API } from "@/lib/query-constants";
import { getRuntimeKind, getUpdateChannel } from "@/lib/tauri-commands";

export const fetchAboutData = async () => {
  try {
    const [version, name, tauriVersion, runtimeKind, releaseChannel] =
      await Promise.all([
        app.getVersion(),
        app.getName(),
        app.getTauriVersion(),
        getRuntimeKind(),
        getUpdateChannel().catch(() => "unknown"),
      ]);
    return { version, name, tauriVersion, runtimeKind, releaseChannel };
  } catch (error) {
    logger.withError(error).error("Failed to fetch app information");
    throw error;
  }
};

const useAbout = () => {
  const result = useQuery({
    queryKey: ["about"],
    queryFn: fetchAboutData,
    staleTime: STALE_TIME_API,
    refetchOnWindowFocus: false,
  });
  return {
    ...result,
    version: result.data?.version,
  };
};

export default useAbout;
