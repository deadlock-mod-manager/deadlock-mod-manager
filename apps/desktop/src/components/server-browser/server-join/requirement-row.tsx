import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  CheckCircleIcon,
  DownloadIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { ResolvedRequirementStatus } from "@/hooks/use-server-join";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";

interface RequirementRowProps {
  requirement: ResolvedRequirementStatus;
  installing: boolean;
  enabling: boolean;
  onInstall: (req: ResolvedRequirementStatus) => void;
  onEnable: (req: ResolvedRequirementStatus) => void;
}

const RequirementRow = ({
  requirement,
  installing,
  enabling,
  onInstall,
  onEnable,
}: RequirementRowProps) => {
  const { t } = useTranslation();
  const progress = usePersistedStore((s) =>
    requirement.remoteId ? s.modProgress[requirement.remoteId] : undefined,
  );

  const statusBadge = (() => {
    if (!requirement.resolved) {
      const label =
        requirement.reason === "custom_provider"
          ? "Custom"
          : requirement.reason === "unknown_scheme"
            ? "Unknown"
            : "Not in DMM";
      return (
        <Badge className='gap-1' variant='destructive'>
          <WarningCircleIcon className='h-3 w-3' weight='fill' />
          {label}
        </Badge>
      );
    }
    if (requirement.isReady) {
      return (
        <Badge className='gap-1' variant='secondary'>
          <CheckCircleIcon className='h-3 w-3' weight='fill' />
          Ready
        </Badge>
      );
    }
    const isInstalledOrDownloaded =
      requirement.status === ModStatus.Installed ||
      requirement.status === ModStatus.Downloaded;
    if (
      requirement.inLibrary &&
      isInstalledOrDownloaded &&
      !requirement.isEnabled
    ) {
      return (
        <Badge className='gap-1' variant='outline'>
          <WarningCircleIcon className='h-3 w-3' weight='fill' />
          Disabled
        </Badge>
      );
    }
    if (requirement.inLibrary) {
      return (
        <Badge className='gap-1' variant='outline'>
          <DownloadIcon className='h-3 w-3 animate-pulse' />
          {requirement.isDownloading && progress
            ? `Downloading ${Math.round(progress.percentage)}%`
            : "Queued…"}
        </Badge>
      );
    }
    return (
      <Badge className='gap-1' variant='outline'>
        <DownloadIcon className='h-3 w-3' />
        Missing
      </Badge>
    );
  })();

  return (
    <div className='flex items-center justify-between gap-2 rounded-md bg-card/40 px-3 py-2 text-xs'>
      <div className='min-w-0 flex-1'>
        <div className='truncate font-mono'>
          {requirement.mod?.name ?? requirement.name}
        </div>
        {requirement.mod?.author && (
          <div className='truncate text-[10px] text-muted-foreground'>
            {t("mods.by")} {requirement.mod.author}
          </div>
        )}
      </div>
      {statusBadge}
      {requirement.resolved &&
        !requirement.isReady &&
        (() => {
          const isInstalledOrDownloaded =
            requirement.status === ModStatus.Installed ||
            requirement.status === ModStatus.Downloaded;
          if (
            requirement.inLibrary &&
            isInstalledOrDownloaded &&
            !requirement.isEnabled
          ) {
            return (
              <Button
                disabled={enabling}
                onClick={() => onEnable(requirement)}
                size='sm'
                variant='outline'>
                {enabling ? "…" : t("servers.detail.enableAll")}
              </Button>
            );
          }
          if (!requirement.inLibrary) {
            return (
              <Button
                disabled={installing}
                onClick={() => onInstall(requirement)}
                size='sm'
                variant='outline'>
                {installing ? "…" : t("servers.detail.installAll")}
              </Button>
            );
          }
          return null;
        })()}
    </div>
  );
};

export default RequirementRow;
