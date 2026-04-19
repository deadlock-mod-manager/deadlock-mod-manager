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

interface RequirementRowProps {
  requirement: ResolvedRequirementStatus;
  installing?: boolean;
  onInstall?: (req: ResolvedRequirementStatus) => void;
}

const RequirementRow = ({
  requirement,
  installing = false,
  onInstall,
}: RequirementRowProps) => {
  const { t } = useTranslation();
  const progress = usePersistedStore((s) =>
    requirement.remoteId ? s.modProgress[requirement.remoteId] : undefined,
  );

  const statusBadge = (() => {
    if (!requirement.resolved) {
      const label =
        requirement.reason === "custom_provider"
          ? t("servers.requirementRow.customProvider")
          : requirement.reason === "unknown_scheme"
            ? t("servers.detail.unknown")
            : t("servers.requirementRow.notInDmm");
      return (
        <Badge className='gap-1' variant='destructive'>
          <WarningCircleIcon className='h-3 w-3' weight='fill' />
          {label}
        </Badge>
      );
    }
    if (requirement.isEnabled) {
      return (
        <Badge className='gap-1' variant='secondary'>
          <CheckCircleIcon className='h-3 w-3' weight='fill' />
          {t("servers.requirementRow.ready")}
        </Badge>
      );
    }
    if (requirement.inLibrary) {
      return (
        <Badge className='gap-1' variant='outline'>
          <DownloadIcon className='h-3 w-3 animate-pulse' />
          {t("servers.requirementRow.downloading", {
            percent: Math.round(progress?.percentage ?? 0),
          })}
        </Badge>
      );
    }

    return (
      <Badge className='gap-1' variant='outline'>
        <DownloadIcon className='h-3 w-3' />
        {t("servers.requirementRow.missing")}
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

      {onInstall &&
        requirement.resolved &&
        !requirement.isEnabled &&
        !requirement.isDownloading && (
          <Button
            disabled={installing}
            onClick={() => onInstall(requirement)}
            size='sm'
            isLoading={installing}
            variant='outline'>
            {requirement.inLibrary
              ? t("servers.detail.enableMod")
              : t("servers.detail.installMod")}
          </Button>
        )}
    </div>
  );
};

export default RequirementRow;
