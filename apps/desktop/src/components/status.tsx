import { cn } from '@/lib/utils';
import { ModStatus } from '@/types/mods';
import { Check, Download, Loader2, X } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from './ui/badge';

const Status = ({ status }: { status: ModStatus }) => {
  const StatusIcon = useMemo(() => {
    switch (status) {
      case ModStatus.DOWNLOADING:
        return Loader2;
      case ModStatus.INSTALLED:
        return Check;
      case ModStatus.ERROR:
        return X;
      default:
        return Download;
    }
  }, [status]);

  const StatusText = useMemo(() => {
    switch (status) {
      case ModStatus.DOWNLOADED:
        return 'Downloaded';
      case ModStatus.DOWNLOADING:
        return 'Downloading';
      case ModStatus.INSTALLED:
        return 'Installed';
      case ModStatus.ERROR:
        return 'Error';
    }
  }, [status]);

  return (
    <Badge className="flex items-center gap-2 w-fit" variant="secondary">
      <StatusIcon
        className={cn('w-4 h-4', {
          'animate-spin': status === ModStatus.DOWNLOADING
        })}
      />
      {StatusText}
    </Badge>
  );
};

export default Status;
