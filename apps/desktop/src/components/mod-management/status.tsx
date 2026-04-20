import { Badge } from "@deadlock-mods/ui/components/badge";
import { Check, Download, Loader2, X } from "@deadlock-mods/ui/icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ModStatus } from "@/types/mods";

const Status = ({ status }: { status: ModStatus }) => {
  const { t } = useTranslation();

  const StatusIcon = useMemo(() => {
    switch (status) {
      case ModStatus.Downloading:
      case ModStatus.Paused:
        return Loader2;
      case ModStatus.Installed:
        return Check;
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
      case ModStatus.Paused:
        return t("modStatus.paused");
      case ModStatus.Installed:
        return t("modStatus.installed");
      case ModStatus.Error:
        return t("modStatus.error");
      default:
        return t("modStatus.unknown");
    }
  }, [status, t]);

  return (
    <Badge className='flex w-fit items-center gap-2' variant='secondary'>
      <StatusIcon
        className={cn("h-4 w-4", {
          "animate-spin": status === ModStatus.Downloading,
        })}
      />
      {StatusText}
    </Badge>
  );
};

export default Status;
