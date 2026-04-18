import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  CheckCircleIcon,
  DownloadIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { ResolvedRequirementStatus } from "@/hooks/use-server-join";

interface RequirementRowProps {
  requirement: ResolvedRequirementStatus;
  installing: boolean;
  onInstall: (req: ResolvedRequirementStatus) => void;
}

const RequirementRow = ({
  requirement,
  installing,
  onInstall,
}: RequirementRowProps) => {
  const { t } = useTranslation();

  const statusBadge = (() => {
    if (!requirement.resolved) {
      return (
        <Badge className='gap-1' variant='destructive'>
          <WarningCircleIcon className='h-3 w-3' weight='fill' />
          {requirement.reason === "unknown_scheme" ? "Unknown" : "Not in DMM"}
        </Badge>
      );
    }
    if (requirement.isReady) {
      return (
        <Badge className='gap-1' variant='secondary'>
          <CheckCircleIcon className='h-3 w-3 text-emerald-400' weight='fill' />
          Ready
        </Badge>
      );
    }
    if (requirement.inLibrary) {
      return <Badge variant='outline'>Downloading…</Badge>;
    }
    return (
      <Badge className='gap-1' variant='outline'>
        <DownloadIcon className='h-3 w-3' />
        Missing
      </Badge>
    );
  })();

  return (
    <div className='flex items-center justify-between gap-2 rounded-md border bg-card/40 px-3 py-2 text-xs'>
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
      {requirement.resolved && !requirement.isReady && (
        <Button
          disabled={installing || requirement.inLibrary}
          onClick={() => onInstall(requirement)}
          size='sm'
          variant='outline'>
          {installing ? "…" : t("servers.detail.installAll")}
        </Button>
      )}
    </div>
  );
};

export default RequirementRow;
