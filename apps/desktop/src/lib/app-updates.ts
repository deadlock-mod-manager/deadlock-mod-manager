import { ProviderError } from "@deadlock-mods/common/client-errors";
import { invoke } from "@tauri-apps/api/core";
import { Update, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { getErrorMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("app-updates");

export interface UpdateContext {
  channel: "stable" | "nightly";
  runtime: "wry" | "cef";
  installer: string;
  target: string;
}

export type AppUpdate = Update & {
  context: UpdateContext;
  downloadUrl: string;
};
type UpdateMetadata = ConstructorParameters<typeof Update>[0] & {
  downloadUrl: string;
};

export type UpdateCheckResponse = { context: UpdateContext } & (
  | { status: "no-update" }
  | { status: "available"; metadata: UpdateMetadata }
  | { status: "check-failed" | "missing-target"; message: string }
);

export class AppUpdateError extends ProviderError {
  constructor(
    readonly phase: "check-failed" | "missing-target" | "install-failed",
    readonly context: UpdateContext | null,
    readonly reason: string,
  ) {
    super(reason);
  }
}

const logFailure = (error: AppUpdateError) => {
  logger
    .withMetadata({ ...error.context, phase: error.phase })
    .withError(error)
    .warn("App update failed");
};

export const checkForAppUpdates = async (
  request: () => Promise<UpdateCheckResponse> = () =>
    invoke("check_app_update"),
): Promise<AppUpdate | null> => {
  try {
    const response = await request();
    switch (response.status) {
      case "no-update":
        return null;
      case "available":
        return Object.assign(new Update(response.metadata), {
          context: response.context,
          downloadUrl: response.metadata.downloadUrl,
        });
      case "check-failed":
      case "missing-target":
        throw new AppUpdateError(
          response.status,
          response.context,
          response.message,
        );
    }
  } catch (error) {
    const failure =
      error instanceof AppUpdateError
        ? error
        : new AppUpdateError("check-failed", null, getErrorMessage(error));
    logFailure(failure);
    throw failure;
  }
};

export const installAppUpdate = async (
  update: AppUpdate,
  onProgress?: (event: DownloadEvent) => void,
  install = () => update.downloadAndInstall(onProgress),
): Promise<void> => {
  try {
    await install();
  } catch (error) {
    const failure = new AppUpdateError(
      "install-failed",
      update.context,
      getErrorMessage(error),
    );
    logFailure(failure);
    throw failure;
  }
};
