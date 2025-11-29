import { useQuery } from "@tanstack/react-query";
import { usePersistedStore } from "@/lib/store";

export const useSyncProfiles = (enabled = true) => {
  const { syncProfilesWithFilesystem } = usePersistedStore();

  return useQuery({
    queryKey: ["sync-profiles"],
    queryFn: async () => {
      await syncProfilesWithFilesystem();
      return null;
    },
    enabled,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};
