import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";

const all = ["performance"] as const;

export const perfQueryKeys = {
  all,
  catalog: () => [...all, "catalog"] as const,
  status: () => [...all, "status"] as const,
  resolve: (request: PerfApplyRequest | null) =>
    [...all, "resolve", request] as const,
  convarSearch: (query: string) => [...all, "convar-search", query] as const,
  shareExport: (request: PerfApplyRequest) =>
    [...all, "share-export", request] as const,
  gameBananaFiles: (modId: number) =>
    [...all, "gamebanana-files", modId] as const,
};
