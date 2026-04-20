import { Button } from "@deadlock-mods/ui/components/button";
import {
  ArrowRightIcon,
  DownloadIcon,
  PackageIcon,
  StackIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ProfileManagerDialog } from "@/components/profiles/profile-manager-dialog";
import { useCheckUpdates } from "@/hooks/use-check-updates";
import { useFeatureFlag } from "@/hooks/use-feature-flags";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ModStatus } from "@/types/mods";

export const QuickStatsStrip = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const localMods = usePersistedStore((state) => state.localMods);
  const { updatableCount } = useCheckUpdates();
  const { isEnabled: isProfileManagementEnabled } = useFeatureFlag(
    "profile-management",
    false,
  );
  const [showProfileManager, setShowProfileManager] = useState(false);

  const installedCount = localMods.filter(
    (m) => m.status === ModStatus.Installed,
  ).length;
  const downloadingCount = localMods.filter(
    (m) =>
      m.status === ModStatus.Downloading ||
      m.status === ModStatus.Paused ||
      m.status === ModStatus.Downloaded,
  ).length;

  return (
    <>
      <div className='flex flex-wrap items-stretch gap-0'>
        <StatChip
          icon={<PackageIcon className='size-5' weight='duotone' />}
          isFirst
          label={t("dashboard.installedMods")}
          value={installedCount}
        />
        <StatChip
          accent={updatableCount > 0}
          icon={<DownloadIcon className='size-5' weight='duotone' />}
          label={t("dashboard.pendingUpdates")}
          value={updatableCount}
        />
        <StatChip
          icon={<StackIcon className='size-5' weight='duotone' />}
          label={t("dashboard.queued")}
          value={downloadingCount}
        />
        <div className='flex flex-1 flex-wrap items-center justify-end gap-2'>
          {isProfileManagementEnabled && (
            <Button
              className='gap-2'
              onClick={() => setShowProfileManager(true)}
              size='sm'
              variant='outline'>
              <UsersThreeIcon className='size-4' weight='duotone' />
              {t("profiles.manage")}
            </Button>
          )}
          <Button className='gap-2' onClick={() => navigate("/mods")} size='sm'>
            {t("dashboard.browseStore")}
            <ArrowRightIcon className='size-4' weight='bold' />
          </Button>
        </div>
      </div>

      {isProfileManagementEnabled && (
        <ProfileManagerDialog
          onOpenChange={setShowProfileManager}
          open={showProfileManager}
        />
      )}
    </>
  );
};

const StatChip = ({
  icon,
  label,
  value,
  accent,
  isFirst,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: boolean;
  isFirst?: boolean;
}) => (
  <div
    className={cn(
      "flex min-w-[140px] items-center gap-3 px-4 py-2.5",
      !isFirst && "border-l border-border/40",
      accent && "border-l-primary/70",
    )}>
    <span
      className={cn(
        "shrink-0 text-muted-foreground",
        accent && "text-primary",
      )}>
      {icon}
    </span>
    <div className='min-w-0 flex-1'>
      <p
        className={cn(
          "truncate text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground",
          accent && "text-primary/80",
        )}>
        {label}
      </p>
      <p
        className={cn(
          "truncate text-xl font-bold tabular-nums text-foreground",
          accent && "text-primary",
        )}>
        {value}
      </p>
    </div>
  </div>
);
