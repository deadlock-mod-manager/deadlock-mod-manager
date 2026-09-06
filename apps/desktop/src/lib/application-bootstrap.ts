import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { downloadManager } from "./download/manager";
import logger from "./logger";
import {
  initializeRuntimeBootstrap,
  type RuntimeBootstrap,
  getRuntimeServiceOrigin,
} from "./runtime-bootstrap";
import { syncProxyConfigToBackend } from "./proxy";
import { usePersistedStore } from "./store";
import {
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
  await load(runtime.stateStorePath, { autoSave: true, defaults: {} });
  await usePersistedStore.persist.rehydrate();
  const storage = await storageReady();

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
  void invoke("refresh_policy_manifest").catch((error) => {
    logger
      .withError(error)
      .warn("Policy refresh failed; keeping the last cached policy");
  });
  await downloadManager.init();

  logger.debug(
    "Store rehydrated, API URL initialized, and download manager ready",
  );

  return { runtime, storage };
};

export const initializeApplication = (): Promise<ApplicationBootstrap> => {
  applicationBootstrapPromise ??= bootstrapApplication();
  return applicationBootstrapPromise;
};
