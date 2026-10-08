import { invoke } from "@tauri-apps/api/core";
import { invokeGuarded } from "@/lib/game-guard";
import type { CatalogSummary } from "@/types/generated/CatalogSummary";
import type { ConvarMeta } from "@/types/generated/ConvarMeta";
import type { ImportReport } from "@/types/generated/ImportReport";
import type { ImportSource } from "@/types/generated/ImportSource";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { PerfApplyResult } from "@/types/generated/PerfApplyResult";
import type { PerfExport } from "@/types/generated/PerfExport";
import type { PerfStatus } from "@/types/generated/PerfStatus";
import type { ResolvedConfig } from "@/types/generated/ResolvedConfig";

export const getPerfCatalog = () => invoke<CatalogSummary>("perf_get_catalog");

/** Adopts a newer catalog from the API when there is one; never fails on network errors. */
export const refreshPerfCatalog = () =>
  invoke<CatalogSummary>("perf_refresh_catalog");

export const getPerfStatus = () => invoke<PerfStatus>("perf_get_status");

/** What applying the request would write, without writing it. */
export const resolvePerfConfig = (request: PerfApplyRequest) =>
  invoke<ResolvedConfig>("perf_resolve", { request });

export const applyPerfConfig = (
  request: PerfApplyRequest,
  removeForeign = false,
) => invokeGuarded<PerfApplyResult>("perf_apply", { request, removeForeign });

export const removePerfConfig = () => invokeGuarded<PerfStatus>("perf_remove");

export const reapplyPerfConfig = () =>
  invokeGuarded<PerfStatus>("perf_reapply");

/** Writes the chosen config back if gameinfo.gi lost it; skipped while the game runs. */
export const syncPerfConfig = () => invoke<boolean>("perf_sync");

export const analyzePerfImport = (source: ImportSource) =>
  invoke<ImportReport>("perf_analyze_import", { source });

export const exportPerfConfig = (request: PerfApplyRequest) =>
  invoke<PerfExport>("perf_export", { request });

export const searchConvars = (query: string, limit = 50) =>
  invoke<ConvarMeta[]>("perf_search_convars", { query, limit });

export const discardPerfStaging = (stagingId: string) =>
  invoke<void>("perf_discard_staging", { stagingId });
