import { commands } from "@skipperndt/plugin-machine-uid";
import { useQuery } from "@tanstack/react-query";
import { STALE_TIME_API } from "@/lib/query-constants";

export const useHardwareId = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["hardware-id"],
    queryFn: () => commands.getMachineUid(),
    staleTime: STALE_TIME_API,
  });

  return {
    isLoading,
    hardwareId: data?.status === "ok" ? data.data.id : null,
  };
};
