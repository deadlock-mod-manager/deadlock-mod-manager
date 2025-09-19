import { Check, Download, Loader2, X } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ModStatus } from "@/types/mods";

const Status = ({ status }: { status: ModStatus }) => {
  const StatusIcon = useMemo(() => {
    switch (status) {
      case ModStatus.Downloading:
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
        return "Downloaded";
      case ModStatus.Downloading:
        return "Downloading";
      case ModStatus.Installed:
        return "Installed";
      case ModStatus.Error:
        return "Error";
      default:
        return "Unknown";
    }
  }, [status]);

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
