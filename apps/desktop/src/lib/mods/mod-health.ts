import type { ModHealth } from "@/types/generated/ModHealth";
import type { ModHealthReport } from "@/types/generated/ModHealthReport";
import type { ModHealthStatus } from "@/types/generated/ModHealthStatus";

export type ModHealthBadgeKind =
  | "fixable"
  | "partlyFixable"
  | "fixed"
  | "partlyFixed"
  | "originalFiles"
  | "needsUpdate";

export const healthBadgeKind = (
  health: ModHealth | undefined,
  isOutdated: boolean,
): ModHealthBadgeKind | null => {
  switch (health?.status) {
    case "fixed":
      return health.remainingSymptoms.length > 0 ? "partlyFixed" : "fixed";
    case "needsUpdate":
      return isOutdated ? "needsUpdate" : null;
    case "fixable":
    case "partlyFixable":
    case "originalFiles":
      return health.status;
    default:
      return null;
  }
};

export const healthAction = (
  kind: ModHealthBadgeKind,
): "fix" | "useOriginalFiles" | null => {
  switch (kind) {
    case "fixable":
    case "partlyFixable":
    case "originalFiles":
      return "fix";
    case "fixed":
    case "partlyFixed":
      return "useOriginalFiles";
    case "needsUpdate":
      return null;
  }
};

export const fixAppliesWhenEnabled = (
  kind: ModHealthBadgeKind,
  isEnabled: boolean,
): boolean => !isEnabled && (kind === "fixed" || kind === "partlyFixed");

export const isFixableStatus = (status: ModHealthStatus): boolean =>
  status === "fixable" || status === "partlyFixable";

export const canFixInBulk = (health: ModHealth): boolean =>
  isFixableStatus(health.status) &&
  !health.remainingSymptoms.includes("crashRisk");

export const showsDateOutdatedWarning = (
  isOutdated: boolean,
  health: ModHealth | undefined,
): boolean => isOutdated && (!health || health.status === "notCovered");

export const healthByModId = (
  report: ModHealthReport | undefined,
): ReadonlyMap<string, ModHealth> =>
  new Map(report?.mods.map((health) => [health.modId, health]) ?? []);

export const fixableModIds = (
  report: ModHealthReport | undefined,
  includes: (modId: string) => boolean = () => true,
): string[] =>
  report?.mods
    .filter((health) => canFixInBulk(health) && includes(health.modId))
    .map((health) => health.modId) ?? [];

export const gameUpdatedSinceLastCheck = (
  report: ModHealthReport | undefined,
): boolean =>
  !!report &&
  report.gameBuild !== null &&
  report.previousGameBuild !== null &&
  report.gameBuild !== report.previousGameBuild;

export const isHeldBack = (health: ModHealth): boolean =>
  isFixableStatus(health.status) && !canFixInBulk(health);

export const heldBackPromptKey = (health: ModHealth): string =>
  [
    health.modId,
    health.gameBuild,
    health.fixSymptoms.join(","),
    health.remainingSymptoms.join(","),
  ].join("|");

export const heldBackToAsk = ({
  report,
  isEnabled,
  asked,
}: {
  report: ModHealthReport | undefined;
  isEnabled: (modId: string) => boolean;
  asked: ReadonlySet<string>;
}): ModHealth[] =>
  report?.mods.filter(
    (health) =>
      isHeldBack(health) &&
      isEnabled(health.modId) &&
      !asked.has(heldBackPromptKey(health)),
  ) ?? [];

type LaunchFixDecision =
  | { action: "launch" }
  | { action: "fix" | "ask"; modIds: string[] };

export const launchFixDecision = ({
  report,
  isEnabled,
  autoFixMods,
}: {
  report: ModHealthReport | undefined;
  isEnabled: (modId: string) => boolean;
  autoFixMods: boolean;
}): LaunchFixDecision => {
  const modIds = fixableModIds(report, isEnabled);
  if (modIds.length === 0) return { action: "launch" };
  return { action: autoFixMods ? "fix" : "ask", modIds };
};

export type ModHealthCheckRequest = {
  profileFolder: string | null;
  modIds: string[] | null;
  force: boolean;
};

export const mergeHealthChecks = (
  queued: ModHealthCheckRequest | null,
  next: ModHealthCheckRequest,
): ModHealthCheckRequest => {
  if (!queued || queued.profileFolder !== next.profileFolder) return next;
  return {
    profileFolder: next.profileFolder,
    modIds:
      queued.modIds && next.modIds
        ? [...new Set([...queued.modIds, ...next.modIds])]
        : null,
    force: queued.force || next.force,
  };
};
