import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { usePersistedStore } from "@/lib/store";

export type FilesystemStatus = "writable" | "readonly" | "unknown";

interface FilesystemWritableStatus {
  addons_writable: boolean;
  gameinfo_writable: boolean;
}

export const useFilesystemStatus = () => {
  const { gamePath } = usePersistedStore();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["filesystem-writable"],
    queryFn: () =>
      invoke<FilesystemWritableStatus>("check_filesystem_writable"),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
    enabled: !!gamePath,
    meta: { skipGlobalErrorHandler: true },
  });

  const getStatus = (): FilesystemStatus => {
    if (!gamePath) return "unknown";
    if (isLoading && !data) return "unknown";
    if (isError || !data) return "unknown";
    if (data.addons_writable && data.gameinfo_writable) return "writable";
    return "readonly";
  };

  return {
    status: getStatus(),
    data,
    isLoading: isLoading && !data,
  };
};
