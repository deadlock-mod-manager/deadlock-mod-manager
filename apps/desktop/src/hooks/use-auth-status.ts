import { useQuery } from "@tanstack/react-query";
import { getAuthHealth } from "@/lib/auth/health";
import {
  REFETCH_INTERVAL_AUTH_HEALTH,
  STALE_TIME_API,
} from "@/lib/query-constants";

export type AuthStatus = "online" | "offline" | "unknown";

export const useAuthStatus = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["auth-health"],
    queryFn: getAuthHealth,
    staleTime: STALE_TIME_API,
    refetchInterval: REFETCH_INTERVAL_AUTH_HEALTH,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: 5000,
  });

  const getStatus = (): AuthStatus => {
    if (isLoading && !data) return "unknown";
    if (isError || !data) return "offline";

    if (data.status !== "ok") return "offline";
    if (!data.db.alive) return "offline";

    return "online";
  };

  return {
    status: getStatus(),
    isAuthOnline: getStatus() === "online",
    isLoading: isLoading && !data,
  };
};
