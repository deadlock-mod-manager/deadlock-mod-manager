import type {
  AnalyticsProperties,
  AnalyticsOutcome,
  AnalyticsOperation,
  AnalyticsOperations,
  AnalyticsEvents,
  AnalyticsAttempt,
  EventArguments,
  ModEntryPoint,
} from "./schema";

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
  // Every dependency belongs inside this boundary: telemetry must never stop an action.
  const emit = (
    event: string,
    properties: AnalyticsProperties = {},
  ): boolean => {
    try {
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
  const track = <K extends keyof AnalyticsEvents>(
    event: K,
    ...args: EventArguments<K>
  ): boolean => emit(event, args[0]);
  const start = <K extends AnalyticsOperation>(
    operation: K,
    properties: AnalyticsOperations[K]["start"],
  ): AnalyticsAttempt<K> => {
    const inactive: AnalyticsAttempt<K> = { finish: () => false };
    try {
      const context = getContext();
      if (!context.enabled || !context.version) return inactive;
      const startProperties = { ...properties };
      const consentEpoch = context.consentEpoch;
      const startedAt = now();
      const operationId = createId();
      if (
        !emit(`${operation}_started`, {
          ...startProperties,
          operation_id: operationId,
        })
      )
        return inactive;
      let finished = false;
      return {
        finish: (outcome, result) => {
          if (finished) return false;
          finished = true;
          try {
            if (consentEpoch !== getContext().consentEpoch) return false;
            return emit(`${operation}_result`, {
              ...startProperties,
              ...result,
              operation_id: operationId,
              outcome,
              duration_seconds: Math.max(0, now() - startedAt) / 1000,
            });
          } catch {
            return false;
          }
        },
      };
    } catch {
      return inactive;
    }
  };
  return { track, start };
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
): ModEntryPoint => {
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

export type AnalyticsClient = ReturnType<typeof createAnalyticsClient>;
