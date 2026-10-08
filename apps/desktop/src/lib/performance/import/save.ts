import type { AnalyticsOperations } from "@/lib/analytics/schema";
import { pathKey } from "@/lib/performance/request";
import type {
  UserPerfConfig,
  UserPerfConfigOrigin,
} from "@/lib/store/slices/performance";
import type { EntryOverride } from "@/types/generated/EntryOverride";
import type { ImportReport } from "@/types/generated/ImportReport";
import type { ImportSource } from "@/types/generated/ImportSource";

const SHARE_CODE_PREFIX = "dmm-perf:";

export const looksLikeShareCode = (text: string) =>
  text.trim().toLowerCase().startsWith(SHARE_CODE_PREFIX);

/** The mod download an archive came from, carried alongside a staged source. */
export type ImportModContext = { modId: string; modName: string };

/** Router state that opens the import dialog on the Performance page. */
export type PerfImportNavigationState = {
  importSource: ImportSource;
  importContext: ImportModContext | null;
};

export const fileNameFromPath = (path: string) =>
  path.match(/[^\\/]+$/)?.[0] ?? null;

type ImportSourceKind =
  AnalyticsOperations["performance_config_import"]["start"]["source_kind"];

export const importAnalyticsSourceKind = (
  source: ImportSource,
  context: ImportModContext | null,
): ImportSourceKind => {
  switch (source.kind) {
    case "text":
      return "paste";
    case "file":
      return "file";
    case "gameBanana":
      return "gamebanana";
    case "currentGameinfo":
      return "current_gameinfo";
    case "staged":
      return context ? "mod_download" : "file";
  }
};

/**
 * Where a saved config came from. `source` is the one the user started from;
 * picking another variant of an archive re-analyzes a staged copy of it.
 */
export const importOrigin = (
  source: ImportSource,
  report: ImportReport,
  context: ImportModContext | null,
): UserPerfConfigOrigin => {
  switch (source.kind) {
    case "text":
      return report.format === "shareCode"
        ? { kind: "shareCode", presetId: report.presetId }
        : { kind: "paste", format: report.format };
    case "file":
      return {
        kind: "file",
        fileName: fileNameFromPath(source.path),
        format: report.format,
      };
    case "gameBanana":
      return {
        kind: "gamebanana",
        gamebananaId: source.mod_id,
        fileId: source.file_id,
        variant: report.selectedVariant,
      };
    case "currentGameinfo":
      return { kind: "currentGameinfo" };
    case "staged":
      return context
        ? {
            kind: "modDownload",
            modId: context.modId,
            modName: context.modName,
            variant: report.selectedVariant ?? source.variant_path,
          }
        : { kind: "file", fileName: null, format: report.format };
  }
};

export const buildUserPerfConfig = ({
  id,
  name,
  createdAt,
  origin,
  report,
}: {
  id: string;
  name: string;
  createdAt: string;
  origin: UserPerfConfigOrigin;
  report: ImportReport;
}): UserPerfConfig => ({
  id,
  name,
  createdAt,
  origin,
  entries: report.entries,
  videoSettings: report.videoSettings,
  baseBuild: report.base?.build ?? null,
});

/**
 * Overrides to store with an imported config: the share code's own tweaks,
 * plus an omit for every camera and visibility setting when the user turned
 * the author's ones off.
 */
export const importOverrides = (
  shared: EntryOverride[],
  cameraPaths: string[][],
  cameraIncluded: boolean,
): EntryOverride[] => {
  if (cameraIncluded) return shared;
  const omitted = new Set(cameraPaths.map(pathKey));
  return [
    ...shared.filter((override) => !omitted.has(pathKey(override.path))),
    ...cameraPaths.map(
      (path): EntryOverride => ({ path, action: { kind: "omit" } }),
    ),
  ];
};
