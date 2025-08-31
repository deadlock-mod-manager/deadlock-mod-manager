import { Check, Download, Loader2, X } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ModStatus } from '@/types/mods';
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
    <Badge className="flex w-fit items-center gap-2" variant="secondary">
      <StatusIcon
        className={cn('h-4 w-4', {
          'animate-spin': status === ModStatus.DOWNLOADING,
        })}
      />
      {StatusText}
    </Badge>
  );
};

export default Status;
