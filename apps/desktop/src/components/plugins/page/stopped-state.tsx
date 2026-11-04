import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ArrowClockwiseIcon,
  CopyIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { StateArea } from "@/components/plugins/page/state-area";
import { formatDateTime } from "@/components/plugins/plugin-format";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import { getErrorMessage } from "@/lib/errors";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";
import { PageButton } from "./page-button";
import { usePluginActions } from "./use-plugin-actions";

/** "10:41" today, a full date and time before that. */
const formatErrorTime = (language: string, iso: string) => {
  const at = new Date(iso);
  if (at.toDateString() !== new Date().toDateString()) {
    return formatDateTime(language, iso);
  }
  return new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
};

export const StoppedState = ({ plugin }: { plugin: ExternalPluginSummary }) => {
  const { t, i18n } = useTranslation();
  const { setEnabled, busy } = usePluginActions(plugin);
  const errorTime = plugin.lastErrorAt
    ? formatErrorTime(i18n.language, plugin.lastErrorAt)
    : null;
  const errorLabel = errorTime
    ? t("plugins.page.stopped.lastError", { time: errorTime })
    : t("plugins.page.stopped.lastErrorUnknownTime");

  const copyDetails = useMutation({
    mutationFn: () =>
      navigator.clipboard.writeText(
        [
          `${plugin.name} ${plugin.version} (${plugin.id})`,
          `${errorLabel}: ${plugin.lastError ?? t("plugins.page.stopped.noError")}`,
          plugin.lastErrorAt ?? "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: () => toast.success(t("plugins.page.stopped.copied")),
    onError: (error) =>
      toast.error(t("plugins.page.stopped.copyFailed"), {
        description: getErrorMessage(error),
      }),
  });

  return (
    <StateArea
      body={t("plugins.page.stopped.crashed")}
      color={TONE_COLOR.danger}
      details={
        <div className='flex w-[420px] max-w-full flex-col gap-1 rounded-[8px] bg-foreground/[0.06] px-3 py-2.5 leading-[normal]'>
          <span className='text-[11px] text-muted-foreground'>
            {errorLabel}
          </span>
          <span className='break-words font-mono text-[12px] text-foreground'>
            {plugin.lastError ?? t("plugins.page.stopped.noError")}
          </span>
        </div>
      }
      icon={WarningIcon}
      title={t("plugins.page.stopped.title", { name: plugin.name })}>
      <PageButton
        disabled={busy}
        onClick={() => setEnabled.mutate(true)}
        variant='primary'>
        <ArrowClockwiseIcon />
        {t("plugins.page.stopped.restart")}
      </PageButton>
      <PageButton onClick={() => copyDetails.mutate()} variant='outline'>
        <CopyIcon />
        {t("plugins.page.stopped.copyDetails")}
      </PageButton>
    </StateArea>
  );
};
