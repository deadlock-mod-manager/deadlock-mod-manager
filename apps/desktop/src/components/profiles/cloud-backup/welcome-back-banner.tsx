import type { ProfileBackupSummary } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  CloudArrowDownIcon,
  CloudIcon,
  DownloadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";

interface WelcomeBackBannerProps {
  latest: ProfileBackupSummary;
  backupCount: number;
  onRestore: (backup: ProfileBackupSummary) => void;
  onSeeAll: () => void;
  onDismiss: () => void;
}

export const WelcomeBackBanner = ({
  latest,
  backupCount,
  onRestore,
  onSeeAll,
  onDismiss,
}: WelcomeBackBannerProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className='relative flex flex-col gap-4 rounded-lg border border-primary/20 bg-primary/5 p-4 pr-10 sm:flex-row sm:items-center'>
      <div className='flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10'>
        <CloudArrowDownIcon aria-hidden className='size-6 text-primary' />
      </div>
      <div className='min-w-0 flex-1 space-y-1'>
        <p className='font-semibold'>
          {user?.name
            ? t("cloudBackup.welcomeBackNamed", { name: user.name })
            : t("cloudBackup.welcomeBack")}
        </p>
        <p className='text-sm text-muted-foreground'>
          {t("cloudBackup.welcomeBackLatest", {
            name: latest.name,
            device: latest.deviceName || t("cloudBackup.unknownDevice"),
            count: latest.modCount,
            when: `${formatDistanceToNow(new Date(latest.updatedAt))} ${t("time.ago")}`,
          })}
        </p>
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        {backupCount > 1 && (
          <Button
            variant='ghost'
            size='sm'
            icon={<CloudIcon className='size-4' />}
            onClick={onSeeAll}>
            {t("cloudBackup.seeAll", { count: backupCount })}
          </Button>
        )}
        <Button
          size='sm'
          icon={<DownloadSimpleIcon className='size-4' />}
          onClick={() => onRestore(latest)}>
          {t("cloudBackup.restoreNamed", { name: latest.name })}
        </Button>
      </div>
      <Button
        variant='ghost'
        size='icon'
        className='absolute top-2 right-2 size-7'
        aria-label={t("cloudBackup.dismiss")}
        onClick={onDismiss}>
        <XIcon className='size-3.5' />
      </Button>
    </div>
  );
};
