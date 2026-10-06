export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

export type AnalyticsOutcome =
  | "completed"
  | "cancelled"
  | "blocked"
  | "failed"
  | "partial";
export type AnalyticsMilestone =
  | "first_eligible_use"
  | "first_install_completed"
  | "first_modded_launch";
export type AnalyticsOperation =
  | "mod_download"
  | "mod_install"
  | "game_launch"
  | "library_mod_state"
  | "profile_import"
  | "mod_update"
  | "crosshair_apply"
  | "foundry_export"
  | "app_update";
export type AnalyticsEntryPoint =
  | "catalog"
  | "search"
  | "featured"
  | "author"
  | "album"
  | "mod_details"
  | "library"
  | "skins"
  | "deep_link"
  | "reinstall"
  | "retry"
  | "other";

export interface AnalyticsContext {
  enabled: boolean;
  version?: string;
  os: string;
  releaseChannel: string;
  consentEpoch: number;
}

interface AnalyticsClientDependencies {
  getContext: () => AnalyticsContext;
  send: (event: string, properties: AnalyticsProperties) => void;
  now: () => number;
  createId: () => string;
}

export const createAnalyticsClient = ({
  getContext,
  send,
  now,
  createId,
}: AnalyticsClientDependencies) => {
  const capture = (
    event: string,
    properties: AnalyticsProperties = {},
  ): boolean => {
    const context = getContext();
    if (!context.enabled || !context.version) return false;
    const clean: AnalyticsProperties = {};
    for (const [key, value] of Object.entries(properties)) {
      if (
        value !== undefined &&
        value !== Infinity &&
        value !== -Infinity &&
        !Object.is(value, NaN)
      )
        clean[key] = value;
    }
    try {
      send(event, {
        ...clean,
        app_version: context.version,
        os: context.os,
        release_channel: context.releaseChannel,
      });
      return true;
    } catch {
      return false;
    }
  };

  const start = (
    operation: AnalyticsOperation,
    properties: AnalyticsProperties = {},
  ) => {
    const context = getContext();
    const startedAt = now();
    const operationId = createId();
    const recorded = capture(`${operation}_started`, {
      ...properties,
      operation_id: operationId,
    });
    let finished = false;
    return {
      finish: (outcome: AnalyticsOutcome, result: AnalyticsProperties = {}) => {
        if (finished) return false;
        finished = true;
        if (!recorded || context.consentEpoch !== getContext().consentEpoch)
          return false;
        return capture(`${operation}_result`, {
          ...properties,
          ...result,
          operation_id: operationId,
          outcome,
          duration_seconds: Math.max(0, now() - startedAt) / 1000,
        });
      },
    };
  };
  return { capture, start };
};

export const failureOutcome = (kind?: string): AnalyticsOutcome => {
  if (kind === "downloadCancelled") return "cancelled";
  if (
    kind === "gameRunning" ||
    kind === "vpkInUse" ||
    kind === "gamePathNotSet" ||
    kind === "steamNotFound" ||
    kind === "gameNotFound"
  )
    return "blocked";
  return "failed";
};

export const modEntryPoint = (
  pathname: string,
  hasSearch: boolean,
): AnalyticsEntryPoint => {
  if (pathname === "/") return "featured";
  if (pathname === "/mods" || pathname === "/maps")
    return hasSearch ? "search" : "catalog";
  if (pathname.startsWith("/authors/")) return "author";
  if (pathname.startsWith("/albums/")) return "album";
  if (pathname.startsWith("/mods/")) return "mod_details";
  if (pathname === "/my-mods" || pathname === "/downloads") return "library";
  if (pathname === "/skins") return "skins";
  return "other";
};

export const screenName = (pathname: string): string => {
  if (pathname === "/") return "dashboard";
  if (pathname === "/mods") return "browse-mods";
  if (pathname.startsWith("/mods/")) return "mod-details";
  if (pathname.startsWith("/authors/")) return "author";
  if (pathname.startsWith("/albums/")) return "album";
  if (pathname.startsWith("/plugins/")) return "plugin";
  if (pathname.startsWith("/settings")) return "settings";
  const screens = new Map([
    ["/my-mods", "my-mods"],
    ["/maps", "maps"],
    ["/add-mods", "add-mods"],
    ["/downloads", "downloads"],
    ["/servers", "server-browser"],
    ["/crosshairs", "crosshairs"],
    ["/skins", "skins"],
    ["/stats", "stats"],
    ["/foundry", "foundry"],
    ["/developer", "developer"],
    ["/debug", "debug"],
  ]);
  return screens.get(pathname) ?? "other";
};
