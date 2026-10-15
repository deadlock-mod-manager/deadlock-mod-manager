import { Button } from "@deadlock-mods/ui/components/button";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useTranslation } from "react-i18next";
import type { AppUpdateError } from "@/lib/app-updates";
import { createLogger } from "@/lib/logger";

const logger = createLogger("app-update-notifications");

export const AppUpdateTechnicalDetails = ({
  failure,
}: {
  failure: AppUpdateError;
}) => {
  const { t } = useTranslation();
  const context = failure.context;
  const copy = useMutation({
    mutationFn: () =>
      writeText(
        JSON.stringify(
          { phase: failure.phase, ...context, message: failure.reason },
          null,
          2,
        ),
      ),
    meta: { skipGlobalErrorHandler: true },
    onError: (error) => {
      logger.withError(error).warn("Failed to copy app update diagnostics");
    },
  });

  return (
    <div className='space-y-3 border-border/60 border-t px-4 py-3'>
      {context ? (
        <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs'>
          <dt className='text-muted-foreground'>{t("update.detailChannel")}</dt>
          <dd>
            {t(
              context.channel === "nightly"
                ? "settings.updateChannelNightly"
                : "settings.updateChannelStable",
            )}
          </dd>
          <dt className='text-muted-foreground'>{t("update.detailRuntime")}</dt>
          <dd>{context.runtime === "wry" ? "Wry" : "CEF"}</dd>
          <dt className='text-muted-foreground'>{t("update.detailPackage")}</dt>
          <dd>
            {context.installer === "unpackaged"
              ? t(
                  import.meta.env.DEV
                    ? "update.developmentBuild"
                    : "update.unpackagedBuild",
                )
              : context.installer.toUpperCase()}
          </dd>
          <dt className='text-muted-foreground'>{t("update.detailTarget")}</dt>
          <dd className='break-all font-mono'>{context.target}</dd>
        </dl>
      ) : null}
      <p className='max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-muted-foreground text-xs leading-5'>
        {failure.reason}
      </p>
      <div className='flex items-center justify-between gap-3'>
        {copy.isError ? (
          <p className='text-xs' role='alert'>
            {t("update.copyDetailsFailed")}
          </p>
        ) : null}
        <Button
          className='ml-auto gap-1.5 focus-visible:ring-foreground/60 dark:focus-visible:ring-primary'
          isLoading={copy.isPending}
          onClick={() => copy.mutate()}
          size='sm'
          variant='ghost'>
          {copy.isSuccess ? (
            <CheckIcon aria-hidden />
          ) : (
            <CopyIcon aria-hidden />
          )}
          {t(copy.isSuccess ? "update.detailsCopied" : "update.copyDetails")}
        </Button>
      </div>
    </div>
  );
};
