import { CheckIcon, DownloadIcon, Loader2, Plus, XIcon } from 'lucide-react';
import { useMemo } from 'react';
import { MdOutlineFileDownloadDone } from 'react-icons/md';
import { RiErrorWarningLine } from 'react-icons/ri';
import { cn } from '@/lib/utils';
import { ModStatus } from '@/types/mods';

export const ModStatusIcon = ({
  status,
  className,
}: {
  status: ModStatus | undefined;
  className?: string;
}) => {
  const loadingStatuses = [
    ModStatus.Downloading,
    ModStatus.Removing,
    ModStatus.Installing,
  ];
  const Icon = useMemo(() => {
    switch (status) {
      case ModStatus.Added:
        return Plus;
      case ModStatus.Downloading:
      case ModStatus.Removing:
      case ModStatus.Installing:
        return Loader2;
      case ModStatus.Downloaded:
        return MdOutlineFileDownloadDone;
      case ModStatus.Installed:
        return CheckIcon;
      case ModStatus.FailedToDownload:
      case ModStatus.FailedToInstall:
      case ModStatus.FailedToRemove:
        return XIcon;
      case ModStatus.Removed:
      case ModStatus.Error:
        return RiErrorWarningLine;
      default:
        return DownloadIcon;
    }
  }, [status]);

  return (
    <Icon
      className={cn(
        'h-4 w-4',
        {
          'animate-spin': status && loadingStatuses.includes(status),
        },
        className
      )}
    />
  );
};
