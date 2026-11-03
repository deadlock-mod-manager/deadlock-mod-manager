import type { ModDto, SharedProfile } from "@deadlock-mods/shared";
import type { TFunction } from "i18next";

/** Where an imported mod dropped out: its catalog lookup, fetching its
 *  download list, or the batch download and install. The batch reports all of
 *  its errors as one string, so it stays a single step. */
type ImportFailureStep = "lookup" | "downloads" | "install";

interface ImportFailure {
  remoteId: string;
  name: string | null;
  step: ImportFailureStep;
  error: string | null;
}

const LISTED_FAILURES = 5;

const REASON_KEYS: Record<ImportFailureStep, string> = {
  lookup: "profiles.importFailures.lookup",
  downloads: "profiles.importFailures.downloads",
  install: "profiles.importFailures.install",
};

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

/** One line per failed mod for the import's completion toast. */
export const describeImportFailures = (
  t: TFunction,
  failures: ImportFailure[],
): string => {
  const lines = failures
    .slice(0, LISTED_FAILURES)
    .map(({ remoteId, name, step }) =>
      t("profiles.importFailures.line", {
        name: name ?? t("profiles.importFailures.unnamed", { remoteId }),
        reason: t(REASON_KEYS[step]),
      }),
    );
  const unlisted = failures.length - LISTED_FAILURES;
  if (unlisted > 0)
    lines.push(t("profiles.importFailures.more", { count: unlisted }));
  return lines.join("\n");
};
