import type { ModDto, SharedProfile } from "@deadlock-mods/shared";
import type { ImportFailure, ImportFailureStep } from "@/lib/profiles/types";

export const IMPORT_FAILURE_REASON_KEYS = {
  lookup: "profiles.importFailures.lookup",
  downloads: "profiles.importFailures.downloads",
  install: "profiles.importFailures.install",
} satisfies Record<ImportFailureStep, string>;

/** The mods of an import that weren't installed, in the profile's order. */
export const collectImportFailures = (
  importedMods: SharedProfile["payload"]["mods"],
  modsDataByRemoteId: Map<string, ModDto>,
  preparationFailed: [string, string][],
  batchFailed: [string, string][],
): ImportFailure[] => {
  const preparationErrors = new Map(preparationFailed);
  const batchErrors = new Map(batchFailed);
  return importedMods.flatMap(({ remoteId }): ImportFailure[] => {
    const modData = modsDataByRemoteId.get(remoteId);
    const name = modData?.name.trim() || null;
    if (!modData) return [{ remoteId, name, step: "lookup", error: null }];
    const preparationError = preparationErrors.get(remoteId);
    if (preparationError !== undefined)
      return [{ remoteId, name, step: "downloads", error: preparationError }];
    const batchError = batchErrors.get(remoteId);
    if (batchError !== undefined)
      return [{ remoteId, name, step: "install", error: batchError }];
    return [];
  });
};

/** The failures as one line for the log: the saved log file keeps a line's
 *  message but drops its metadata. */
export const summarizeImportFailures = (failures: ImportFailure[]): string =>
  failures
    .map(({ remoteId, step, error }) =>
      error ? `${remoteId} (${step}: ${error})` : `${remoteId} (${step})`,
    )
    .join(", ");
