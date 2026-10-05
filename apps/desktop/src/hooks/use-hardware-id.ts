import { useQuery } from "@tanstack/react-query";
import { STALE_TIME_API } from "@/lib/query-constants";
import { getMachineUid } from "@/lib/tauri-commands";

export const useHardwareId = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["hardware-id"],
    queryFn: getMachineUid,
    staleTime: STALE_TIME_API,
  });

  return {
    isLoading,
    hardwareId: data ?? null,
  };
};
