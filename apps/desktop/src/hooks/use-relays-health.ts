import { useQuery } from "@tanstack/react-query";
import { getRelaysHealth } from "@/lib/api";

const RELAYS_REFETCH_INTERVAL_MS = 30_000;

export const useRelaysHealth = () => {
  const query = useQuery({
    queryKey: ["servers", "relays", "health"],
    queryFn: getRelaysHealth,
    refetchInterval: RELAYS_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    meta: { skipGlobalErrorHandler: true },
  });

  const relays = query.data?.relays ?? [];
  const total = relays.length;
  const healthy = relays.filter((r) => r.healthy).length;

  return { relays, total, healthy, query };
};
