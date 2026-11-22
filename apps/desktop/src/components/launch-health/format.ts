import { formatDistanceToNow } from "date-fns";
import type { TFunction } from "i18next";
import type {
  ClientModRef,
  PerfConfigFingerprint,
  SessionChange,
} from "@/lib/launch-health/types";

const MAX_LISTED_NAMES = 3;

export const formatUptime = (t: TFunction, seconds: number): string =>
  seconds < 60
    ? t("launchHealth.duration.seconds", { count: seconds })
    : t("launchHealth.duration.minutes", { count: Math.round(seconds / 60) });

export const formatRelative = (iso: string | null): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNow(date, { addSuffix: true });
};

export const latestTimestamp = (values: (string | null)[]): string | null => {
  const sorted = values
    .filter((value): value is string => value !== null)
    .sort();
  return sorted[sorted.length - 1] ?? null;
};

export const formatModNames = (
  t: TFunction,
  language: string,
  mods: ClientModRef[],
): string => {
  const listed = mods.slice(0, MAX_LISTED_NAMES).map((mod) => mod.name);
  const hidden = mods.length - listed.length;
  const items =
    hidden > 0
      ? [...listed, t("launchHealth.changes.andMore", { count: hidden })]
      : listed;
  return new Intl.ListFormat(language, {
    style: "long",
    type: "conjunction",
  }).format(items);
};

/** The game file only carries the id; the name comes from what was applied. */
export const configName = (
  config: PerfConfigFingerprint,
  userConfigName: string | undefined,
): string =>
  config.name ??
  userConfigName ??
  config.configId.replace(/^(preset|user):/, "");

/** One line for the toast: the first (most likely) change. */
export const summarizeChange = (
  t: TFunction,
  change: SessionChange,
): string => {
  switch (change.kind) {
    case "perfConfig":
      return t("launchHealth.toast.perfConfig");
    case "modsAdded":
      return t("launchHealth.toast.modsAdded", { count: change.mods.length });
    case "modsUpdated":
      return t("launchHealth.toast.modsUpdated", {
        count: change.mods.length,
      });
    case "autoexec":
      return t("launchHealth.toast.autoexec");
    case "launchOptions":
      return t("launchHealth.toast.launchOptions");
    case "addonFiles":
      return t("launchHealth.toast.addonFiles");
  }
};
