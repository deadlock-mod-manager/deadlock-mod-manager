import { useQuery } from "@tanstack/react-query";
import { getApiHealth } from "@/lib/api";

export type ApiStatus = "healthy" | "degraded" | "offline" | "unknown";

export interface ApiHealthData {
  status: string;
  db: { alive: boolean };
  redis: { alive: boolean; configured: boolean };
  version: string;
  spec: string;
}

export const useApiStatus = () => {
  const { data, isLoading, error, isError } = useQuery({
    queryKey: ["api-health"],
    queryFn: getApiHealth,
    refetchInterval: 30000, // Check every 30 seconds
    retry: 2,
    retryDelay: 5000,
  });

  const getApiStatus = (): ApiStatus => {
    if (isLoading && !data) return "unknown";
    if (isError || !data) return "offline";

    const { status, db, redis } = data;

    // If main status is not "ok", consider it offline
    if (status !== "ok") return "offline";

    // If database is down, consider it offline
    if (!db.alive) return "offline";

    // If redis is configured but not alive, consider it degraded
    if (redis.configured && !redis.alive) return "degraded";

    // Everything looks good
    return "healthy";
  };

  return {
    status: getApiStatus(),
    data,
    isLoading: isLoading && !data,
    error,
    isError,
  };
};
