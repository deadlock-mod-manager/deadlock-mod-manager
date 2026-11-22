import type { ReportCountsDto } from "@deadlock-mods/shared";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export const useReportCounts = (modId: string) => {
  return useQuery({
    queryKey: ["reportCounts", modId],
    queryFn: async (): Promise<ReportCountsDto> => {
      return await invoke("get_report_counts", { modId });
    },
    enabled: !!modId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};
