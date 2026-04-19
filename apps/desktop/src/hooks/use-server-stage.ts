import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";
import { getModDownloads } from "@/lib/api";
import { downloadManager } from "@/lib/download/manager";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { StagedServer } from "@/lib/store/slices/server-profiles";
import {
  type InstallableMod,
  type LocalMod,
  type ModDownloadItem,
  ModStatus,
} from "@/types/mods";
import type { ResolvedRequirementStatus } from "./use-server-join";

export type ServerStagingPhase =
  | "idle"
  | "creating-folder"
  | "downloading-mods"
  | "awaiting-file-selection"
  | "awaiting-custom-confirm"
  | "downloading-custom"
  | "patching-gameinfo"
  | "ready"
  | "error";

export type CustomDownloadPreview = {
  requirementName: string;
  url: string;
  host: string;
  fileName: string;
};

export type PendingFileSelection = {
  requirementName: string;
  files: ModDownloadItem[];
};

export type ServerStagingState = {
  phase: ServerStagingPhase;
  error: string | null;
  staged: StagedServer | null;
  currentRequirement: string | null;
  pendingCustomDownloads: CustomDownloadPreview[] | null;
  pendingFileSelection: PendingFileSelection | null;
};

export type StageServerOptions = {
  layered: boolean;
  requirements: ResolvedRequirementStatus[];
};

const ALLOWED_EXTENSION_RE = /\.(vpk|zip|7z|rar)$/i;

// Synthesize a name when the URL doesn't end in a recognized archive
// extension so we never write something like `index.html` into addons.
const fileNameFromUrl = (url: string, requirementId: string): string => {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    if (last && ALLOWED_EXTENSION_RE.test(last)) {
      return last;
    }
  } catch {}
  return `${requirementId}.vpk`;
};

const hostFromUrl = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const downloadModToServerFolder = (
  mod: LocalMod,
  serverFolder: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    downloadManager.addToQueue({
      ...mod,
      profileFolder: serverFolder,
      onStart: () => {},
      onProgress: () => {},
      onComplete: () => resolve(),
      onError: (err) => reject(err),
    });
  });

const installModIntoServerFolder = (
  mod: LocalMod,
  serverFolder: string,
): Promise<InstallableMod> =>
  invoke<InstallableMod>("install_mod", {
    deadlockMod: {
      id: mod.remoteId,
      name: mod.name,
      is_map: mod.isMap,
      file_tree: mod.installedFileTree,
    },
    profileFolder: serverFolder,
  });

const initialState: ServerStagingState = {
  phase: "idle",
  error: null,
  staged: null,
  currentRequirement: null,
  pendingCustomDownloads: null,
  pendingFileSelection: null,
};

export const useServerStage = () => {
  const [state, setState] = useState<ServerStagingState>(initialState);
  const recordStagedServer = usePersistedStore((s) => s.recordStagedServer);
  const recordJoin = usePersistedStore((s) => s.recordJoin);
  const evictStagedServersIfNeeded = usePersistedStore(
    (s) => s.evictStagedServersIfNeeded,
  );
  const getActiveProfile = usePersistedStore((s) => s.getActiveProfile);

  const customConfirmResolverRef = useRef<((proceed: boolean) => void) | null>(
    null,
  );
  const fileSelectionResolverRef = useRef<
    ((selection: ModDownloadItem[] | null) => void) | null
  >(null);

  const awaitCustomConfirmation = useCallback(
    (items: CustomDownloadPreview[]): Promise<boolean> => {
      setState((s) => ({
        ...s,
        phase: "awaiting-custom-confirm",
        currentRequirement: null,
        pendingCustomDownloads: items,
      }));
      return new Promise<boolean>((resolve) => {
        customConfirmResolverRef.current = resolve;
      }).finally(() => {
        customConfirmResolverRef.current = null;
        setState((s) => ({ ...s, pendingCustomDownloads: null }));
      });
    },
    [],
  );

  const awaitFileSelection = useCallback(
    (
      requirementName: string,
      files: ModDownloadItem[],
    ): Promise<ModDownloadItem[] | null> => {
      setState((s) => ({
        ...s,
        phase: "awaiting-file-selection",
        currentRequirement: requirementName,
        pendingFileSelection: { requirementName, files },
      }));
      return new Promise<ModDownloadItem[] | null>((resolve) => {
        fileSelectionResolverRef.current = resolve;
      }).finally(() => {
        fileSelectionResolverRef.current = null;
        setState((s) => ({ ...s, pendingFileSelection: null }));
      });
    },
    [],
  );

  const stageSingleRequirement = useCallback(
    async (
      requirement: ResolvedRequirementStatus,
      serverFolder: string,
    ): Promise<void> => {
      if (!requirement.mod || !requirement.remoteId) return;
      const remoteId = requirement.remoteId;
      const existing = usePersistedStore
        .getState()
        .localMods.find((m) => m.remoteId === remoteId);

      if (
        existing &&
        (existing.status === ModStatus.Installed ||
          existing.status === ModStatus.Downloaded)
      ) {
        await installModIntoServerFolder(existing, serverFolder);
        return;
      }

      const downloads = await getModDownloads(remoteId);
      if (!downloads || downloads.downloads.length === 0) {
        throw new Error(`No downloadable files for ${requirement.mod.name}`);
      }
      let files = downloads.downloads;

      // Multi-download mods need a user pick — installing every variant
      // would duplicate VPKs and can conflict.
      if (files.length > 1) {
        const selection = await awaitFileSelection(requirement.mod.name, files);
        if (!selection || selection.length === 0) {
          throw new Error(
            `Required mod "${requirement.mod.name}" was not selected by the user`,
          );
        }
        files = selection;
      }

      setState((s) =>
        s.phase === "awaiting-file-selection"
          ? { ...s, phase: "downloading-mods", pendingFileSelection: null }
          : s,
      );

      const synthesized: LocalMod = {
        ...requirement.mod,
        status: ModStatus.Downloading,
        downloads: files,
        selectedDownloads: files,
      };

      await downloadModToServerFolder(synthesized, serverFolder);
      await installModIntoServerFolder(
        { ...synthesized, status: ModStatus.Downloaded },
        serverFolder,
      );
    },
    [awaitFileSelection],
  );

  const stage = useCallback(
    async (
      server: ServerBrowserEntry,
      options: StageServerOptions,
    ): Promise<StagedServer> => {
      setState({
        ...initialState,
        phase: "creating-folder",
      });
      let folderName: string | null = null;
      try {
        folderName = await invoke<string>("create_server_addons_folder", {
          serverId: server.id,
        });

        const resolvedGB = options.requirements.filter(
          (r) => r.resolved && r.provider === "gamebanana" && r.mod,
        );
        const customProviders = options.requirements.filter(
          (r) => r.provider === "custom" && !!r.url,
        );

        if (resolvedGB.length > 0) {
          setState((s) => ({ ...s, phase: "downloading-mods" }));
          // Sequential: the download manager serializes per-mod progress
          // callbacks and GameBanana rate-limits parallel pulls.
          for (const req of resolvedGB) {
            setState((s) => ({
              ...s,
              currentRequirement: req.mod?.name ?? req.name,
            }));
            await stageSingleRequirement(req, folderName);
          }
        }

        if (customProviders.length > 0) {
          const previews: CustomDownloadPreview[] = customProviders.map(
            (req) => {
              const url = req.url ?? "";
              return {
                requirementName: req.name || req.url || "custom mod",
                url,
                host: hostFromUrl(url),
                fileName: fileNameFromUrl(url, req.name || "mod"),
              };
            },
          );
          const proceed = await awaitCustomConfirmation(previews);
          if (proceed) {
            setState((s) => ({
              ...s,
              phase: "downloading-custom",
              currentRequirement: null,
            }));
            const results = await Promise.allSettled(
              previews.map((preview) =>
                invoke("download_custom_provider_mod", {
                  serverFolder: folderName,
                  url: preview.url,
                  fileName: preview.fileName,
                }),
              ),
            );
            const failures = results
              .map((result, i) => ({ result, preview: previews[i] }))
              .filter(
                (
                  x,
                ): x is {
                  result: PromiseRejectedResult;
                  preview: CustomDownloadPreview;
                } => x.result.status === "rejected",
              );
            if (failures.length > 0) {
              for (const { result, preview } of failures) {
                logger
                  .withMetadata({
                    requirementId: preview.requirementName,
                    url: preview.url,
                  })
                  .withError(result.reason)
                  .warn("Custom provider download failed");
              }
              const summary = failures
                .map(({ result, preview }) => {
                  const message =
                    result.reason instanceof Error
                      ? result.reason.message
                      : String(result.reason);
                  return `${preview.requirementName}: ${message}`;
                })
                .join("; ");
              throw new Error(
                `Failed to download ${failures.length} custom provider mod(s): ${summary}`,
              );
            }
          } else {
            logger.info(
              "User declined custom-provider downloads; skipping them",
            );
          }
        }

        setState((s) => ({
          ...s,
          phase: "patching-gameinfo",
          currentRequirement: null,
        }));
        const activeProfileFolder = options.layered
          ? (getActiveProfile()?.folderName ?? null)
          : null;
        await invoke("apply_server_gameinfo", {
          serverFolder: folderName,
          alsoIncludeProfile: activeProfileFolder,
        });

        const staged: StagedServer = {
          serverId: server.id,
          folderName,
          requiredModIds: options.requirements
            .map((r) => r.remoteId)
            .filter((id): id is string => !!id),
          lastUsed: new Date().toISOString(),
          layered: options.layered,
        };

        recordStagedServer(staged);
        recordJoin({ serverId: server.id, folderName });
        await evictStagedServersIfNeeded();

        setState({
          ...initialState,
          phase: "ready",
          staged,
        });
        return staged;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error ?? "");
        logger
          .withMetadata({ serverId: server.id })
          .withError(error)
          .error("Failed to stage server");

        // Eviction won't pick up folders that were never recorded in
        // stagedServers, so clean up the orphan ourselves.
        if (folderName) {
          try {
            await invoke("delete_server_addons_folder", {
              serverId: server.id,
            });
          } catch (cleanupError) {
            logger
              .withMetadata({ serverId: server.id, folderName })
              .withError(cleanupError)
              .warn(
                "Failed to clean up orphan server folder after stage error",
              );
          }
        }

        setState({
          ...initialState,
          phase: "error",
          error: message,
        });
        throw error;
      } finally {
        if (customConfirmResolverRef.current) {
          customConfirmResolverRef.current(false);
          customConfirmResolverRef.current = null;
        }
        if (fileSelectionResolverRef.current) {
          fileSelectionResolverRef.current(null);
          fileSelectionResolverRef.current = null;
        }
      }
    },
    [
      recordStagedServer,
      recordJoin,
      evictStagedServersIfNeeded,
      getActiveProfile,
      awaitCustomConfirmation,
      stageSingleRequirement,
    ],
  );

  const confirmCustomDownloads = useCallback(() => {
    customConfirmResolverRef.current?.(true);
  }, []);

  const skipCustomDownloads = useCallback(() => {
    customConfirmResolverRef.current?.(false);
  }, []);

  const confirmFileSelection = useCallback((selection: ModDownloadItem[]) => {
    fileSelectionResolverRef.current?.(selection);
  }, []);

  const cancelFileSelection = useCallback(() => {
    fileSelectionResolverRef.current?.(null);
  }, []);

  const reset = useCallback(() => {
    if (customConfirmResolverRef.current) {
      customConfirmResolverRef.current(false);
    }
    if (fileSelectionResolverRef.current) {
      fileSelectionResolverRef.current(null);
    }
    setState(initialState);
  }, []);

  return {
    state,
    stage,
    reset,
    confirmCustomDownloads,
    skipCustomDownloads,
    confirmFileSelection,
    cancelFileSelection,
  };
};

export const isStagingActive = (phase: ServerStagingPhase): boolean =>
  phase !== "idle" && phase !== "ready" && phase !== "error";
