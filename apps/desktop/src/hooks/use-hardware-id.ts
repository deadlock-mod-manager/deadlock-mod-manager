import { commands } from "@skipperndt/plugin-machine-uid";
import { useQuery } from "@tanstack/react-query";

export const useHardwareId = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["hardware-id"],
    queryFn: () => commands.getMachineUid(),
  });

  return {
    isLoading,
    hardwareId: data?.status === "ok" ? data.data.id : null,
  };
};
