import type { TFunction } from "i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { AppUpdateError } from "@/lib/app-updates";
import { GITHUB_REPO } from "@/lib/constants";
import { createLogger } from "@/lib/logger";

const logger = createLogger("app-update-notifications");

export const showAppUpdateError = (error: Error | null, t: TFunction) => {
  const failure = error instanceof AppUpdateError ? error : null;
  const title =
    failure?.phase === "install-failed"
      ? t("update.installFailed")
      : failure?.phase === "missing-target"
        ? t("update.missingTarget")
        : t("about.updateFailed");
  const context = failure?.context;
  const description = context
    ? t("update.failureContext", { ...context })
    : undefined;
  const releaseUrl = context
    ? context.channel === "nightly"
      ? `${GITHUB_REPO}/releases/tag/nightly`
      : `${GITHUB_REPO}/releases/latest`
    : `${GITHUB_REPO}/releases`;
  toast.error(title, {
    description,
    action: {
      label: t("update.downloadManually"),
      onClick: () => {
        void openUrl(releaseUrl).catch((error) => {
          logger
            .withError(error)
            .error("Failed to open manual update downloads");
          toast.error(t("update.openDownloadsFailed"));
        });
      },
    },
  });
};
