import { useQuery } from "@tanstack/react-query";
import { getMachineUid } from "@/lib/tauri-commands";

export const useHardwareId = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["hardware-id"],
    queryFn: getMachineUid,
    staleTime: Infinity,
  });

  return {
    isLoading,
    hardwareId: data ?? null,
  };
};
