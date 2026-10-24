import { Button } from "@deadlock-mods/ui/components/button";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ClockCounterClockwiseIcon,
  CloudArrowUpIcon,
  CloudCheckIcon,
  CloudSlashIcon,
  InfoIcon,
} from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import type { ProfileBackupStatus } from "@/lib/profiles/profile-backup";

interface ProfileBackupStatusRowProps {
  profileName: string;
  status: ProfileBackupStatus;
  localModCount: number;
  isBackingUp: boolean;
  disabled: boolean;
  onBackUp: () => void;
}

export const ProfileBackupStatusRow = ({
  profileName,
  status,
  localModCount,
  isBackingUp,
  disabled,
  onBackUp,
}: ProfileBackupStatusRowProps) => {
  const { t } = useTranslation();
  const when =
    status.kind === "none"
      ? ""
      : `${formatDistanceToNow(new Date(status.backup.updatedAt))} ${t("time.ago")}`;

  const label = {
    none: t("cloudBackup.statusNone"),
    upToDate: t("cloudBackup.statusUpToDate", { when }),
    changed: t("cloudBackup.statusChanged"),
  }[status.kind];

  const Icon = {
    none: CloudSlashIcon,
    upToDate: CloudCheckIcon,
    changed: ClockCounterClockwiseIcon,
  }[status.kind];

  return (
    <div className='flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm'>
      <span
        className={cn(
          "flex items-center gap-1.5",
          status.kind === "changed"
            ? "text-amber-500"
            : "text-muted-foreground",
        )}>
        <Icon
          aria-hidden
          className={cn(
            "size-4",
            status.kind === "upToDate" && "text-emerald-500",
          )}
        />
        {label}
      </span>
      {localModCount > 0 && (
        <span className='flex items-center gap-1.5 text-xs text-amber-500'>
          <InfoIcon aria-hidden className='size-3.5' />
          {t("cloudBackup.localModsNotBackedUp", { count: localModCount })}
        </span>
      )}
      <Button
        className='ml-auto'
        variant='outline'
        size='sm'
        disabled={disabled || isBackingUp}
        isLoading={isBackingUp}
        aria-label={t("cloudBackup.backUpNamed", { profileName })}
        icon={<CloudArrowUpIcon className='size-4' />}
        onClick={onBackUp}>
        {t("cloudBackup.backUp")}
      </Button>
    </div>
  );
};
