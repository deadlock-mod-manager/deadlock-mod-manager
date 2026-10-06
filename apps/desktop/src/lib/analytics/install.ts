import type { LocalMod, InstallableMod } from "@/types/mods";
import type { ErrorKind } from "@/types/tauri";
import {
  failureOutcome,
  type AnalyticsEntryPoint,
  type AnalyticsMilestone,
  type AnalyticsProperties,
  type createAnalyticsClient,
} from "./client";

export interface InstallAnalyticsOptions {
  analyticsEntryPoint?: AnalyticsEntryPoint;
  analyticsOperationKind?: "install" | "enable" | "reinstall" | "randomize";
  onStart: (mod: LocalMod) => void;
  onComplete: (mod: LocalMod, result: InstallableMod) => void;
  onError: (mod: LocalMod, error: ErrorKind) => void;
  onCancel?: (mod: LocalMod) => void;
}

interface InstallAnalyticsDependencies {
  start: ReturnType<typeof createAnalyticsClient>["start"];
  getModEntryPoint: (
    modId: string,
    fallback: AnalyticsEntryPoint,
  ) => AnalyticsEntryPoint;
  captureMilestone: (
    milestone: AnalyticsMilestone,
    properties?: AnalyticsProperties,
  ) => void;
}

export const createInstallTracker =
  ({
    start,
    getModEntryPoint,
    captureMilestone,
  }: InstallAnalyticsDependencies) =>
  <T extends InstallAnalyticsOptions>(mod: LocalMod, options: T) => {
    const operationKind =
      options.analyticsOperationKind ??
      (mod.installedVpks?.length ? "enable" : "install");
    const attempt = start("mod_install", {
      mod_id: mod.remoteId,
      entry_point:
        options.analyticsEntryPoint ??
        getModEntryPoint(mod.remoteId, "library"),
      operation_kind: operationKind,
      content_type: mod.isMap ? "map" : mod.isAudio ? "sound" : "mod",
    });
    return {
      ...options,
      onComplete: (installedMod: LocalMod, result: InstallableMod) => {
        if (
          attempt.finish("completed", {
            vpk_count: result.installed_vpks.length,
          }) &&
          operationKind === "install"
        ) {
          captureMilestone("first_install_completed");
        }
        options.onComplete(installedMod, result);
      },
      onError: (failedMod: LocalMod, error: ErrorKind) => {
        attempt.finish(failureOutcome(error.kind));
        options.onError(failedMod, error);
      },
      onCancel: (cancelledMod: LocalMod) => {
        attempt.finish("cancelled");
        options.onCancel?.(cancelledMod);
      },
    };
  };
