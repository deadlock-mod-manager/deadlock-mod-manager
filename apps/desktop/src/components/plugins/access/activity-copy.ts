import type { Icon } from "@phosphor-icons/react";
import {
  ArrowCircleUpIcon,
  BellIcon,
  EraserIcon,
  GlobeIcon,
  KeyIcon,
  LockKeyIcon,
  PackageIcon,
  PencilSimpleIcon,
  ProhibitIcon,
  RocketLaunchIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { formatPluginSize } from "@/components/plugins/plugin-format";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import type { ExternalPluginActivity } from "@/types/generated/ExternalPluginActivity";
import type { ExternalPluginActivityKind } from "@/types/generated/ExternalPluginActivityKind";

/** Kinds that answer a plugin's own hostcall, as opposed to user actions. */
export const REQUEST_KINDS: ExternalPluginActivityKind[] = [
  "staged",
  "deployed",
  "fetched",
  "wrote",
  "notified",
  "blocked",
];

const PRIMARY = "#EFE0BE";
const MUTED = "#A3A3A3";

export const ACTIVITY_ICON = {
  deployed: { icon: RocketLaunchIcon, color: PRIMARY },
  staged: { icon: PackageIcon, color: MUTED },
  fetched: { icon: GlobeIcon, color: MUTED },
  wrote: { icon: PencilSimpleIcon, color: MUTED },
  notified: { icon: BellIcon, color: MUTED },
  blocked: { icon: ProhibitIcon, color: TONE_COLOR.danger },
  granted: { icon: KeyIcon, color: MUTED },
  revoked: { icon: LockKeyIcon, color: MUTED },
  updated: { icon: ArrowCircleUpIcon, color: MUTED },
  dataCleared: { icon: EraserIcon, color: MUTED },
  stopped: { icon: WarningIcon, color: TONE_COLOR.danger },
} satisfies Record<ExternalPluginActivityKind, { icon: Icon; color: string }>;

type Lookup = { findProfileName: (folder: string) => string | null };

const blockedTitle = (
  t: TFunction,
  activity: ExternalPluginActivity,
  { findProfileName }: Lookup,
) => {
  switch (activity.permission) {
    case "files":
      return activity.fileName
        ? t("plugins.activity.blockedFile", { file: activity.fileName })
        : t("plugins.activity.blockedFileAny");
    case "mods":
      return activity.profileFolder
        ? t("plugins.activity.blockedMods", {
            profile:
              findProfileName(activity.profileFolder) ?? activity.profileFolder,
          })
        : t("plugins.activity.blockedModsAny");
    case "network":
      return activity.host
        ? t("plugins.activity.blockedNetwork", { host: activity.host })
        : t("plugins.activity.blockedNetworkAny");
    case "game":
      return t("plugins.activity.blockedGame");
    case "storage":
      return t("plugins.activity.blockedStorage");
    case "notifications":
      return t("plugins.activity.blockedNotifications");
    case null:
      return activity.method
        ? t("plugins.activity.blockedMethod", { method: activity.method })
        : t("plugins.activity.blockedOther");
  }
};

/**
 * One line for an activity entry. `request` phrases hostcalls the way the
 * Access sheet lists them ("Read output.vpk"); `event` is the log wording.
 */
export const describeActivity = (
  t: TFunction,
  activity: ExternalPluginActivity,
  lookup: Lookup,
  style: "event" | "request",
): string => {
  const profile = activity.profileFolder
    ? (lookup.findProfileName(activity.profileFolder) ??
      t("plugins.access.actions.unknownProfile", {
        folder: activity.profileFolder,
      }))
    : t("plugins.activity.aProfile");
  switch (activity.kind) {
    case "deployed":
      if (style === "request" || !activity.hash) {
        return t("plugins.activity.deployedRequest", { profile });
      }
      return t("plugins.activity.deployed", {
        hash: activity.hash.slice(0, 6),
        profile,
      });
    case "staged":
      if (style === "request" && activity.fileName) {
        return t("plugins.activity.stagedRequest", {
          file: activity.fileName,
        });
      }
      return activity.size !== null && activity.resources !== null
        ? t("plugins.activity.staged", {
            size: formatPluginSize(activity.size),
            count: activity.resources,
          })
        : t("plugins.activity.stagedAny");
    case "fetched":
      return activity.host
        ? t("plugins.activity.fetched", { host: activity.host })
        : t("plugins.activity.fetchedAny");
    case "wrote":
      return activity.fileName
        ? t("plugins.activity.wrote", { file: activity.fileName })
        : t("plugins.activity.wroteAny");
    case "notified":
      return t("plugins.activity.notified");
    case "blocked":
      return blockedTitle(t, activity, lookup);
    case "granted":
      return t("plugins.activity.granted");
    case "revoked":
      return t("plugins.activity.revoked");
    case "updated":
      return activity.reason
        ? t("plugins.activity.updated", { version: activity.reason })
        : t("plugins.activity.updatedAny");
    case "dataCleared":
      return t("plugins.activity.dataCleared");
    case "stopped":
      return t("plugins.activity.stopped");
  }
};
