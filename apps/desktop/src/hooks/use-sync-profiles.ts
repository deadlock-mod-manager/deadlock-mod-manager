import { useQuery } from "react-query";
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
    cacheTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};
