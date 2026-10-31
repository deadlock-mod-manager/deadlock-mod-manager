import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { load } from "@tauri-apps/plugin-store";
import { downloadManager } from "./download/manager";
import { applySegmentedDownloadsSetting } from "./download/segmented-downloads";
import { setPluginRuntimeEnabled } from "./external-plugins";
import logger from "./logger";
import {
  initializeRuntimeBootstrap,
  type RuntimeBootstrap,
  getRuntimeServiceOrigin,
} from "./runtime-bootstrap";
import { applyGameGuardSetting } from "./game-guard";
import { applyTrayBehavior, hideToTrayOnClose } from "./tray";
import { syncProxyConfigToBackend } from "./proxy";
import { usePersistedStore } from "./store";
import {
  flushPendingWrites,
  lockWriteGate,
  setStateStorePath,
  storageReady,
  type StorageReadyStatus,
} from "./store/storage";
import { initializeApiUrl } from "./tauri-commands";

export type ApplicationBootstrap = {
  runtime: RuntimeBootstrap;
  storage: StorageReadyStatus;
};

let applicationBootstrapPromise: Promise<ApplicationBootstrap> | null = null;

const bootstrapApplication = async (): Promise<ApplicationBootstrap> => {
  const runtime = await initializeRuntimeBootstrap();

  setStateStorePath(runtime.stateStorePath);
  const recovery = runtime.stateFileRecovery;
  if (recovery && recovery.backupPath === null) {
    lockWriteGate(recovery.reason);
  }
  await load(runtime.stateStorePath, { autoSave: true, defaults: {} });
  await usePersistedStore.persist.rehydrate();
  const storage = await storageReady();
  await setPluginRuntimeEnabled(
    storage.ok && usePersistedStore.getState().experimentalFeatures.plugins,
  );

  logger
    .withMetadata({
      hasCompletedOnboarding:
        usePersistedStore.getState().hasCompletedOnboarding,
      runtimeMode: runtime.mode,
      storageReady: storage.ok,
    })
    .info("Persisted store hydration completed");

  await initializeApiUrl(getRuntimeServiceOrigin(runtime, "dmmApi"));
  await syncProxyConfigToBackend();
  // The backend starts enforced, so a failed sync leaves the guard on.
  await applyGameGuardSetting(
    usePersistedStore.getState().blockActionsWhileGameRunning,
  ).catch((error) => {
    logger.withError(error).warn("Failed to sync the game guard setting");
  });
  // The backend starts with segmented downloads off, so a failed sync leaves
  // them off.
  await applySegmentedDownloadsSetting(
    usePersistedStore.getState().segmentedDownloads,
  ).catch((error) => {
    logger
      .withError(error)
      .warn("Failed to sync the segmented downloads setting");
  });
  const { minimizeToTray, closeToTray } = usePersistedStore.getState();
  await applyTrayBehavior({ minimizeToTray, closeToTray }).catch((error) => {
    logger.withError(error).warn("Failed to sync the tray settings");
  });
  void invoke("refresh_policy_manifest").catch((error) => {
    logger
      .withError(error)
      .warn("Policy refresh failed; keeping the last cached policy");
  });
  await downloadManager.init();
  // Tauri saves the store on exit with whatever writes have reached it.
  void getCurrentWindow().onCloseRequested(async (event) => {
    await flushPendingWrites();
    if (await hideToTrayOnClose().catch(() => false)) {
      event.preventDefault();
    }
  });

  logger.debug(
    "Store rehydrated, API URL initialized, and download manager ready",
  );

  return { runtime, storage };
};

export const initializeApplication = (): Promise<ApplicationBootstrap> => {
  applicationBootstrapPromise ??= bootstrapApplication();
  return applicationBootstrapPromise;
};
