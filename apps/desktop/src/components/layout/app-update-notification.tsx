import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ArrowSquareOutIcon,
  CloudSlashIcon,
  PackageIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import type { AppUpdateError } from "@/lib/app-updates";
import { GITHUB_REPO } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { cn } from "@/lib/utils";

const logger = createLogger("app-update-notifications");

const messages = {
  "check-failed": {
    title: "update.checkFailed",
    guidance: "update.checkFailedGuidance",
    icon: CloudSlashIcon,
  },
  "missing-target": {
    title: "update.missingTarget",
    guidance: "update.missingTargetGuidance",
    icon: PackageIcon,
  },
  "install-failed": {
    title: "update.installFailed",
    guidance: "update.installFailedGuidance",
    icon: WarningCircleIcon,
  },
};

interface AppUpdateNotificationProps {
  failure: AppUpdateError | null;
  onDismiss: () => void;
}

export const AppUpdateNotification = ({
  failure,
  onDismiss,
}: AppUpdateNotificationProps) => {
  const { t } = useTranslation();
  const phase = failure?.phase ?? "check-failed";
  const { title, guidance, icon: Icon } = messages[phase];
  const missingPackage = phase === "missing-target";
  const context = failure?.context;
  const contextLabels = context
    ? {
        channel: t(
          context.channel === "nightly"
            ? "settings.updateChannelNightly"
            : "settings.updateChannelStable",
        ),
        runtime: context.runtime === "wry" ? "Wry" : "CEF",
        installer:
          context.installer === "unpackaged"
            ? t(
                import.meta.env.DEV
                  ? "update.developmentBuild"
                  : "update.unpackagedBuild",
              )
            : context.installer.toUpperCase(),
      }
    : null;
  const releaseUrl = context
    ? context.channel === "nightly"
      ? `${GITHUB_REPO}/releases/tag/nightly`
      : `${GITHUB_REPO}/releases/latest`
    : `${GITHUB_REPO}/releases`;
  const { mutate: openDownloads, isPending } = useMutation({
    mutationFn: () => openUrl(releaseUrl),
    onSuccess: onDismiss,
    meta: { skipGlobalErrorHandler: true },
    onError: (error) => {
      logger.withError(error).error("Failed to open manual update downloads");
      toast.error(t("update.openDownloadsFailed"));
    },
  });

  return (
    <div
      className={cn(
        "w-[var(--width)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-card text-foreground shadow-[0_12px_32px_hsl(var(--background)/0.5)]",
        missingPackage
          ? "border-[oklch(0.8_0.14_80_/_0.3)]"
          : "border-[oklch(0.73_0.16_25_/_0.3)]",
      )}>
      <div
        className={cn(
          "p-4",
          missingPackage
            ? "bg-[oklch(0.8_0.14_80_/_0.08)]"
            : "bg-[oklch(0.73_0.16_25_/_0.08)]",
        )}>
        <div className='flex items-center gap-2.5'>
          <div
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full",
              missingPackage
                ? "bg-[oklch(0.8_0.14_80_/_0.15)] text-[oklch(0.48_0.12_70)] dark:text-[oklch(0.8_0.14_80)]"
                : "bg-[oklch(0.73_0.16_25_/_0.15)] text-[oklch(0.48_0.16_25)] dark:text-[oklch(0.75_0.16_25)]",
            )}>
            <Icon aria-hidden className='size-4' weight='duotone' />
          </div>
          <p className='min-w-0 flex-1 font-semibold text-sm leading-5'>
            {t(title)}
          </p>
          <Button
            aria-label={t("common.dismiss")}
            className='-mr-1 size-7 shrink-0 text-foreground/60 hover:text-foreground focus-visible:ring-foreground/60 dark:focus-visible:ring-primary'
            onClick={onDismiss}
            size='icon'
            variant='ghost'>
            <XIcon aria-hidden className='size-3.5' />
          </Button>
        </div>
        <p className='mt-2 text-[13px] text-foreground/75 leading-5'>
          {t(guidance)}
        </p>
      </div>
      <div className='flex flex-wrap items-center justify-between gap-3 border-border/60 border-t bg-background/20 px-4 py-3'>
        {contextLabels ? (
          <p
            className='text-muted-foreground text-xs'
            title={t("update.failureContextDescription", contextLabels)}>
            {t("update.failureContext", contextLabels)}
          </p>
        ) : null}
        <Button
          className='ml-auto border-primary/30 bg-primary/10 text-foreground shadow-none hover:border-primary/50 hover:bg-primary/15 focus-visible:ring-foreground/60 dark:text-primary dark:focus-visible:ring-primary'
          isLoading={isPending}
          onClick={() => openDownloads()}
          size='sm'
          variant='outline'>
          {t("update.viewDownloads")}
          <ArrowSquareOutIcon aria-hidden className='size-3.5' />
        </Button>
      </div>
    </div>
  );
};
