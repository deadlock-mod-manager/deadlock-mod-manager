import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@deadlock-mods/ui/components/dialog";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { ArrowsClockwiseIcon, LinkBreakIcon } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { GameBananaMemberIdentity } from "@/components/shared/gamebanana-member";
import {
  useRemoteInstallPairing,
  useRemoteInstallQueueState,
  useRemoteInstallStatus,
} from "@/hooks/use-remote-install";
import { getErrorMessage } from "@/lib/errors";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const GUIDE_IMAGE = "/brand/gamebanana-remote-install.webp";
const STEP_KEYS = [
  "remoteInstall.stepOpen",
  "remoteInstall.stepPair",
  "remoteInstall.stepQueue",
] as const;

const GuideDialog = ({ children }: { children: React.ReactElement }) => {
  const { t } = useTranslation();

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className='gap-3 sm:max-w-5xl'>
        <DialogHeader>
          <DialogTitle>{t("remoteInstall.guideTitle")}</DialogTitle>
          <DialogDescription>
            {t("remoteInstall.guideDescription")}
          </DialogDescription>
        </DialogHeader>
        <img
          alt={t("remoteInstall.guideAlt")}
          className='w-full rounded-md border'
          height={1326}
          src={GUIDE_IMAGE}
          width={1936}
        />
      </DialogContent>
    </Dialog>
  );
};

const Steps = () => {
  const { t } = useTranslation();

  return (
    <ol className='space-y-2.5'>
      {STEP_KEYS.map((key, index) => (
        <li className='flex gap-3 text-sm' key={key}>
          <span className='flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-medium text-[11px] text-primary tabular-nums'>
            {index + 1}
          </span>
          <span className='pt-px text-muted-foreground leading-relaxed'>
            {t(key)}
          </span>
        </li>
      ))}
    </ol>
  );
};

const UnpairedState = () => {
  const { t } = useTranslation();

  return (
    <div className='grid gap-5 md:grid-cols-[minmax(0,1fr)_16rem]'>
      <Steps />
      <GuideDialog>
        <button
          className='group relative self-start overflow-hidden rounded-md border text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          type='button'>
          <img
            alt=''
            className='aspect-[1936/1326] w-full object-cover opacity-80 transition-opacity group-hover:opacity-100'
            height={1326}
            src={GUIDE_IMAGE}
            width={1936}
          />
          <span className='absolute inset-x-0 bottom-0 bg-background/85 px-3 py-1.5 font-medium text-xs'>
            {t("remoteInstall.viewGuide")}
          </span>
        </button>
      </GuideDialog>
    </div>
  );
};

export const RemoteInstallSettings = () => {
  const { t } = useTranslation();
  const { data: status, isLoading } = useRemoteInstallStatus();
  const queue = useRemoteInstallQueueState();
  const { unpair } = useRemoteInstallPairing();

  // Reaching this section is what the Integrations tab hint points to.
  useEffect(() => {
    usePersistedStore.getState().markFeatureUsed("remote-install");
  }, []);

  if (isLoading || !status) {
    return <Skeleton className='h-24 w-full' />;
  }

  const memberId = status.memberId;
  const failed = queue.isError;

  const handleUnpair = async () => {
    try {
      await unpair.mutateAsync();
      toast.success(t("remoteInstall.unpaired"));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const lastChecked = queue.isFetching
    ? t("remoteInstall.indicatorChecking")
    : queue.dataUpdatedAt
      ? t("remoteInstall.lastChecked", {
          time: formatDistanceToNow(new Date(queue.dataUpdatedAt), {
            addSuffix: true,
          }),
        })
      : t("remoteInstall.notCheckedYet");

  return (
    <div className='space-y-4'>
      <div className='flex items-start justify-between gap-4'>
        <div className='min-w-0 space-y-1'>
          <h4 className='font-bold text-sm'>{t("settings.remoteInstall")}</h4>
          <p className='max-w-prose text-muted-foreground text-sm'>
            {t("settings.remoteInstallDescription")}
          </p>
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium text-xs",
            memberId == null
              ? "text-muted-foreground"
              : failed
                ? "border-destructive/40 text-destructive"
                : "border-status-ok/40 text-status-ok",
          )}>
          <span className='size-1.5 rounded-full bg-current' />
          {t(
            memberId == null
              ? "remoteInstall.notPaired"
              : failed
                ? "remoteInstall.statusError"
                : "remoteInstall.statusLinked",
          )}
        </span>
      </div>

      {memberId == null ? (
        <UnpairedState />
      ) : (
        <div className='space-y-3'>
          <div className='flex flex-col gap-3 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between'>
            <GameBananaMemberIdentity
              detail={failed ? getErrorMessage(queue.error) : lastChecked}
              detailClassName={cn(failed && "text-destructive")}
              memberId={memberId}
            />
            <div className='flex shrink-0 gap-2'>
              <Button
                disabled={queue.isFetching}
                onClick={() => queue.refetch()}
                size='sm'
                variant='outline'>
                <ArrowsClockwiseIcon
                  aria-hidden
                  className={cn(queue.isFetching && "animate-spin")}
                />
                {t("remoteInstall.checkNow")}
              </Button>
              <Button
                disabled={unpair.isPending}
                onClick={handleUnpair}
                size='sm'
                variant='ghost'>
                <LinkBreakIcon aria-hidden />
                {t("remoteInstall.unpair")}
              </Button>
            </div>
          </div>
          <p className='text-muted-foreground text-xs'>
            {t("remoteInstall.pairedHint")}{" "}
            <GuideDialog>
              <button
                className='font-medium text-foreground underline-offset-2 hover:underline'
                type='button'>
                {t("remoteInstall.viewGuide")}
              </button>
            </GuideDialog>
          </p>
        </div>
      )}
    </div>
  );
};
