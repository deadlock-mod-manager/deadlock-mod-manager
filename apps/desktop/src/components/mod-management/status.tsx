import { Badge } from "@deadlock-mods/ui/components/badge";
import { Check, Download, Loader2, X } from "@deadlock-mods/ui/icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ModStatus } from "@/types/mods";
import { NeedsRepairBadge } from "./needs-repair-badge";

const Status = ({ status }: { status: ModStatus }) => {
  const { t } = useTranslation();

  const StatusIcon = useMemo(() => {
    switch (status) {
      case ModStatus.Downloading:
      case ModStatus.Extracting:
      case ModStatus.Paused:
        return Loader2;
      case ModStatus.Installed:
        return Check;
      case ModStatus.NeedsRepair:
      case ModStatus.Error:
        return X;
      default:
        return Download;
    }
  }, [status]);

  const StatusText = useMemo(() => {
    switch (status) {
      case ModStatus.Downloaded:
        return t("modStatus.downloaded");
      case ModStatus.Downloading:
        return t("modStatus.downloading");
      case ModStatus.Extracting:
        return t("modStatus.extracting");
      case ModStatus.Paused:
        return t("modStatus.paused");
      case ModStatus.Installed:
        return t("modStatus.installed");
      case ModStatus.NeedsRepair:
        return t("modStatus.needsRepair");
      case ModStatus.Error:
        return t("modStatus.error");
      default:
        return t("modStatus.unknown");
    }
  }, [status, t]);

  if (status === ModStatus.NeedsRepair) {
    return <NeedsRepairBadge />;
  }

  return (
    <Badge className='flex w-fit items-center gap-2' variant='secondary'>
      <StatusIcon
        className={cn("h-4 w-4", {
          "animate-spin":
            status === ModStatus.Downloading || status === ModStatus.Extracting,
        })}
      />
      {StatusText}
    </Badge>
  );
};

export default Status;
