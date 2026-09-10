import { invoke } from "@tauri-apps/api/core";

export type RuntimeServiceName =
  | "gamebanana"
  | "downloads"
  | "dmmApi"
  | "auth"
  | "deadlockApi"
  | "assets";

export type RuntimeServiceEndpoint = {
  service: RuntimeServiceName;
  origin: string;
};

export type RuntimeBootstrap = {
  mode: "production" | "e2e";
  stateStorePath: string;
  appDataPath: string | null;
  endpoints: RuntimeServiceEndpoint[];
  integrations: {
    updater: "disabled" | "fixture";
    steamDiscovery: "fixture";
    gameLaunch: "record";
    presence: "disabled";
    ingestion: "disabled";
    matchSync: "disabled";
  } | null;
};

let runtimeBootstrapPromise: Promise<RuntimeBootstrap> | null = null;
let runtimeBootstrap: RuntimeBootstrap | null = null;

export const getRuntimeBootstrap = (): Promise<RuntimeBootstrap> => {
  runtimeBootstrapPromise ??= invoke<RuntimeBootstrap>(
    "get_runtime_bootstrap",
  ).then((bootstrap) => {
    runtimeBootstrap = bootstrap;
    return bootstrap;
  });
  return runtimeBootstrapPromise;
};

export const initializeRuntimeBootstrap = async (): Promise<RuntimeBootstrap> =>
  await getRuntimeBootstrap();

export const runtimeServiceOrigin = (
  service: RuntimeServiceName,
  fallback: string,
): string =>
  runtimeBootstrap?.endpoints.find((endpoint) => endpoint.service === service)
    ?.origin ?? fallback;

export const getRuntimeServiceOrigin = (
  bootstrap: RuntimeBootstrap,
  service: RuntimeServiceName,
): string | undefined =>
  bootstrap.endpoints.find((endpoint) => endpoint.service === service)?.origin;

export const resolveStorePath = async (fileName: string): Promise<string> => {
  const bootstrap = await getRuntimeBootstrap();
  if (bootstrap.mode === "production" || bootstrap.appDataPath === null) {
    return fileName;
  }
  const separator = bootstrap.appDataPath.includes("\\") ? "\\" : "/";
  return bootstrap.appDataPath + separator + fileName;
};
