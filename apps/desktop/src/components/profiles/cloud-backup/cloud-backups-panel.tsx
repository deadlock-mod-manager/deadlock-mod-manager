import type { ProfileBackupSummary } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  CheckIcon,
  ClockCounterClockwiseIcon,
  CloudArrowUpIcon,
  CloudCheckIcon,
  CloudIcon,
  DesktopTowerIcon,
  DownloadSimpleIcon,
  InfoIcon,
  LockSimpleIcon,
  MinusIcon,
  PuzzlePieceIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import AuthModal from "@/components/user/auth-modal";
import {
  type CloudBackups,
  useDeleteProfileBackup,
} from "@/hooks/use-profile-backups";

interface CloudBackupsPanelProps {
  cloudBackups: CloudBackups;
  disabled: boolean;
  onRestore: (backup: ProfileBackupSummary) => void;
}

export const CloudBackupsPanel = ({
  cloudBackups: {
    isAuthenticated,
    backups,
    isLoading,
    localByBackupId,
    backupProfile,
  },
  disabled,
  onRestore,
}: CloudBackupsPanelProps) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const deleteBackup = useDeleteProfileBackup();

  if (!isAuthenticated) {
    return <SignedOutPitch />;
  }

  if (isLoading) {
    return (
      <div className='grid gap-2'>
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className='h-[74px] w-full rounded-lg' />
        ))}
      </div>
    );
  }

  if (backups.length === 0) {
    return (
      <div className='flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center'>
        <CloudIcon aria-hidden className='size-7 text-muted-foreground' />
        <p className='font-medium'>{t("cloudBackup.emptyTitle")}</p>
        <p className='max-w-sm text-sm text-muted-foreground'>
          {t("cloudBackup.emptyDescription")}
        </p>
      </div>
    );
  }

  const handleDelete = async (backup: ProfileBackupSummary) => {
    const confirmed = await confirm({
      title: t("cloudBackup.deleteConfirmTitle", { name: backup.name }),
      body: t("cloudBackup.deleteConfirmBody"),
      actionButton: t("cloudBackup.deleteConfirmAction"),
      cancelButton: t("common.cancel"),
    });
    if (confirmed) deleteBackup.mutate(backup);
  };

  return (
    <div className='grid gap-2'>
      <p className='flex items-start gap-2 px-0.5 pb-1 text-xs text-muted-foreground'>
        <InfoIcon aria-hidden className='mt-px size-3.5 shrink-0' />
        {t("cloudBackup.listIntro")}
      </p>
      {backups.map((backup) => {
        const local = localByBackupId.get(backup.id);
        const isStale = local?.status.kind === "changed";
        return (
          <div
            key={backup.id}
            className={cn(
              "flex items-center gap-4 rounded-lg border bg-card px-4 py-3",
              isStale && "border-amber-500/30",
            )}>
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-md",
                local ? "bg-muted" : "bg-primary/10 text-primary",
                isStale && "bg-amber-500/10 text-amber-500",
              )}>
              {isStale ? (
                <ClockCounterClockwiseIcon
                  aria-hidden
                  className='size-[18px]'
                />
              ) : local ? (
                <CloudCheckIcon
                  aria-hidden
                  className='size-[18px] text-muted-foreground'
                />
              ) : (
                <CloudIcon aria-hidden className='size-[18px]' />
              )}
            </div>
            <div className='min-w-0 flex-1 space-y-1'>
              <div className='flex items-center gap-2'>
                <span className='truncate font-semibold'>{backup.name}</span>
                <Badge
                  variant='outline'
                  className={cn("shrink-0", !local && "text-primary")}>
                  {local
                    ? t("cloudBackup.onThisPc")
                    : t("cloudBackup.notOnThisPc")}
                </Badge>
              </div>
              <div className='flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted-foreground'>
                <span className='flex items-center gap-1'>
                  <PuzzlePieceIcon aria-hidden className='size-3.5' />
                  {t("cloudBackup.modCount", { count: backup.modCount })}
                </span>
                {backup.deviceName && (
                  <span className='flex items-center gap-1 font-mono'>
                    <DesktopTowerIcon aria-hidden className='size-3.5' />
                    {backup.deviceName}
                  </span>
                )}
                <span>
                  {t("cloudBackup.backedUpWhen", {
                    when: `${formatDistanceToNow(new Date(backup.updatedAt))} ${t("time.ago")}`,
                  })}
                </span>
              </div>
              {isStale && (
                <p className='text-xs text-amber-500'>
                  {t("cloudBackup.localChangesNotBackedUp")}
                </p>
              )}
            </div>
            <div className='flex shrink-0 items-center gap-1.5'>
              {!local && (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={disabled}
                  icon={<DownloadSimpleIcon className='size-4' />}
                  onClick={() => onRestore(backup)}>
                  {t("cloudBackup.restore")}
                </Button>
              )}
              {local && isStale && (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={disabled || backupProfile.isPending}
                  isLoading={
                    backupProfile.isPending &&
                    backupProfile.variables?.profileId === local.profileId
                  }
                  icon={<CloudArrowUpIcon className='size-4' />}
                  onClick={() =>
                    backupProfile.mutate({ profileId: local.profileId })
                  }>
                  {t("cloudBackup.backUpNow")}
                </Button>
              )}
              {local && !isStale && (
                <span className='px-2 text-xs text-muted-foreground'>
                  {t("cloudBackup.upToDate")}
                </span>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='size-8'
                    disabled={disabled || deleteBackup.isPending}
                    aria-label={t("cloudBackup.deleteNamed", {
                      name: backup.name,
                    })}
                    onClick={() => handleDelete(backup)}>
                    <TrashIcon className='size-4' />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("cloudBackup.deleteTooltip")}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        );
      })}
      <p className='flex items-center gap-1.5 px-0.5 pt-1 text-xs text-muted-foreground'>
        <LockSimpleIcon aria-hidden className='size-3.5' />
        {t("cloudBackup.neverUploaded")}
      </p>
    </div>
  );
};

const SignedOutPitch = () => {
  const { t } = useTranslation();
  const included = [
    { ok: true, label: t("cloudBackup.includesGameBanana") },
    { ok: true, label: t("cloudBackup.includesSelections") },
    { ok: true, label: t("cloudBackup.includesGroups") },
    { ok: false, label: t("cloudBackup.excludesLocal") },
    { ok: false, label: t("cloudBackup.excludesGameFiles") },
  ];

  return (
    <div className='flex flex-col gap-6 rounded-lg border bg-card p-6 sm:flex-row sm:items-center'>
      <div className='flex-1 space-y-3'>
        <div className='flex size-11 items-center justify-center rounded-lg bg-primary/10'>
          <CloudArrowUpIcon aria-hidden className='size-6 text-primary' />
        </div>
        <h3 className='text-lg font-semibold'>
          {t("cloudBackup.signedOutTitle")}
        </h3>
        <p className='max-w-prose text-sm text-muted-foreground'>
          {t("cloudBackup.signedOutDescription")}
        </p>
        <div className='flex items-center gap-3 pt-1'>
          <AuthModal prominent />
          <span className='text-xs text-muted-foreground'>
            {t("cloudBackup.signInProviders")}
          </span>
        </div>
      </div>
      <ul className='space-y-2 rounded-lg border bg-background p-4 text-sm sm:w-64'>
        <li className='pb-1 text-xs font-semibold text-muted-foreground'>
          {t("cloudBackup.whatGetsBackedUp")}
        </li>
        {included.map(({ ok, label }) => (
          <li
            key={label}
            className={cn(
              "flex items-center gap-2",
              !ok && "text-muted-foreground",
            )}>
            {ok ? (
              <CheckIcon aria-hidden className='size-3.5 text-emerald-500' />
            ) : (
              <MinusIcon aria-hidden className='size-3.5' />
            )}
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
};
