import type { ReportCountsDto } from "@deadlock-mods/shared";
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "react-query";

export const useReportCounts = (modId: string) => {
  return useQuery(
    ["reportCounts", modId],
    async (): Promise<ReportCountsDto> => {
      return await invoke("get_report_counts", { modId });
    },
    {
      enabled: !!modId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
  );
};
