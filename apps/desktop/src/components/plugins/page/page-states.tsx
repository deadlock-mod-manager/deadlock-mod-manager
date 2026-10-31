import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ArrowClockwiseIcon,
  ArrowCircleUpIcon,
  CircleNotchIcon,
  CopyIcon,
  type Icon,
  PowerIcon,
  PuzzlePieceIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { formatDateTime } from "@/components/plugins/plugin-format";
import { tint } from "@/components/plugins/plugin-identity";
import { HOST_NEUTRAL, TONE_COLOR } from "@/components/plugins/plugin-status";
import { getErrorMessage } from "@/lib/errors";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";
import { PageButton } from "./page-button";
import { MANAGE_PLUGINS_PATH, usePluginActions } from "./use-plugin-actions";

type StateAreaProps = {
  icon: Icon;
  color: string;
  title: string;
  body: string;
  details?: ReactNode;
  children: ReactNode;
};

/** A centred notice that stands in for the plugin's own page. */
const StateArea = ({
  icon: StateIcon,
  color,
  title,
  body,
  details,
  children,
}: StateAreaProps) => (
  <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-6'>
    <span
      className='flex size-12 shrink-0 items-center justify-center rounded-full'
      style={{ backgroundColor: tint(color, "1A") }}>
      <StateIcon color={color} size={22} />
    </span>
    <div className='flex w-[420px] max-w-full flex-col items-center gap-1.5 text-center'>
      <h2 className='font-semibold text-[16px] text-foreground leading-[normal]'>
        {title}
      </h2>
      <p className='text-[13px] text-muted-foreground leading-[19px]'>{body}</p>
    </div>
    {details}
    <div className='flex items-start gap-2.5 pt-1.5'>{children}</div>
  </div>
);

const ManagePluginsButton = ({ path }: { path: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <PageButton onClick={() => navigate(path)} variant='ghost'>
      <PuzzlePieceIcon />
      {t("plugins.page.managePlugins")}
    </PageButton>
  );
};

const SkeletonBar = ({ className }: { className: string }) => (
  <span className={`block rounded-[6px] bg-[#1E1A18] ${className}`} />
);

const SKELETON_CARD =
  "flex w-full flex-col gap-3 rounded-[12px] bg-card p-5 ring-1 ring-border ring-inset";

/** Shown over the frame until the plugin's page says it is ready. */
export const StartingArea = () => {
  const { t } = useTranslation();
  return (
    <div
      aria-busy
      className='flex min-h-0 flex-1 flex-col gap-[14px] overflow-hidden p-6'>
      <div className={`${SKELETON_CARD} animate-pulse`}>
        <SkeletonBar className='h-3.5 w-[140px]' />
        <SkeletonBar className='h-2.5 w-full' />
        <div className='flex gap-6'>
          <SkeletonBar className='h-7 w-[90px]' />
          <SkeletonBar className='h-7 w-[70px]' />
          <SkeletonBar className='h-7 w-[90px]' />
        </div>
        <SkeletonBar className='h-[34px] w-[180px]' />
      </div>
      <div className={`${SKELETON_CARD} animate-pulse`}>
        <SkeletonBar className='h-3.5 w-[120px]' />
        <SkeletonBar className='h-2.5 w-full' />
        <SkeletonBar className='h-2.5 w-full' />
      </div>
      <p className='flex items-center gap-2 text-[12px] text-muted-foreground leading-[normal]'>
        <CircleNotchIcon className='animate-spin' size={13} />
        {t("plugins.page.starting.hint")}
      </p>
    </div>
  );
};

export const NoAnswerState = ({
  plugin,
  onReload,
}: {
  plugin: ExternalPluginSummary;
  onReload: () => void;
}) => {
  const { t } = useTranslation();
  const { managePath } = usePluginActions(plugin);
  return (
    <StateArea
      body={t("plugins.page.noAnswer.body")}
      color={TONE_COLOR.danger}
      icon={WarningIcon}
      title={t("plugins.page.noAnswer.title", { name: plugin.name })}>
      <PageButton onClick={onReload} variant='primary'>
        <ArrowClockwiseIcon />
        {t("plugins.page.noAnswer.reload")}
      </PageButton>
      <ManagePluginsButton path={managePath} />
    </StateArea>
  );
};

export const TurnedOffState = ({
  plugin,
}: {
  plugin: ExternalPluginSummary;
}) => {
  const { t } = useTranslation();
  const { setEnabled, busy, managePath } = usePluginActions(plugin);
  return (
    <StateArea
      body={t("plugins.page.off.body")}
      color={HOST_NEUTRAL}
      icon={PowerIcon}
      title={t("plugins.page.off.title", { name: plugin.name })}>
      <PageButton
        disabled={busy}
        onClick={() => setEnabled.mutate(true)}
        variant='primary'>
        <PowerIcon />
        {t("plugins.page.off.turnOn")}
      </PageButton>
      <ManagePluginsButton path={managePath} />
    </StateArea>
  );
};

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
        <div className='flex w-[420px] max-w-full flex-col gap-1 rounded-[8px] bg-[#1E1A18] px-3 py-2.5 leading-[normal]'>
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

export const NoPageState = ({ plugin }: { plugin: ExternalPluginSummary }) => {
  const { t } = useTranslation();
  const { managePath } = usePluginActions(plugin);
  return (
    <StateArea
      body={t("plugins.page.noPage.body")}
      color={HOST_NEUTRAL}
      icon={PuzzlePieceIcon}
      title={t("plugins.page.noPage.title", { name: plugin.name })}>
      <ManagePluginsButton path={managePath} />
    </StateArea>
  );
};

export const WaitsForUpdateState = ({
  plugin,
  version,
  onReview,
}: {
  plugin: ExternalPluginSummary;
  version: string;
  onReview: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <StateArea
      body={t("plugins.page.update.waits.body", { version })}
      color={TONE_COLOR.info}
      icon={ArrowCircleUpIcon}
      title={t("plugins.page.update.waits.title", { name: plugin.name })}>
      <PageButton onClick={onReview} variant='primary'>
        <ArrowCircleUpIcon />
        {t("plugins.page.update.review")}
      </PageButton>
    </StateArea>
  );
};

export const NotInstalledState = () => {
  const { t } = useTranslation();
  return (
    <StateArea
      body={t("plugins.page.notInstalled.body")}
      color={HOST_NEUTRAL}
      icon={PuzzlePieceIcon}
      title={t("plugins.page.notInstalled.title")}>
      <ManagePluginsButton path={MANAGE_PLUGINS_PATH} />
    </StateArea>
  );
};
