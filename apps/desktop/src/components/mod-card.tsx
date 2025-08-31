import { Skeleton } from '@/components/ui/skeleton';
import { useDownload } from '@/hooks/use-download';
import { isModOutdated } from '@/lib/utils';
import { ModStatus } from '@/types/mods';
import { ModDto } from '@deadlock-mods/utils';
import { CheckIcon, DownloadIcon, Loader2, XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FiZoomIn } from 'react-icons/fi';
import { useNavigate } from 'react-router';
import { OutdatedModWarning } from './outdated-mod-warning';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';

const ModCard = ({ mod }: { mod?: ModDto }) => {
  const { download, localMod } = useDownload(mod);
  const status = localMod?.status;
  const navigate = useNavigate();
  const [showLargeImage, setShowLargeImage] = useState(false);

  const Icon = useMemo(() => {
    switch (status) {
      case ModStatus.DOWNLOADING:
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case ModStatus.DOWNLOADED:
        return <CheckIcon className="h-4 w-4" />;
      case ModStatus.INSTALLED:
        return <CheckIcon className="h-4 w-4" />;
      default:
        return <DownloadIcon className="h-4 w-4" />;
    }
  }, [status]);

  if (!mod) {
    return (
      <Card className="shadow cursor-pointer">
        <Skeleton className="h-48 w-full object-cover rounded-t-xl bg-muted" />
        <CardHeader className="px-2 py-3">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-2">
              <CardTitle>
                <Skeleton className="h-4 w-32" />
              </CardTitle>
              <CardDescription>
                <Skeleton className="h-4 w-32" />
              </CardDescription>
            </div>
            <div className="flex flex-col">
              <Button size="icon" variant="outline" disabled>
                <DownloadIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      {showLargeImage && mod.images.length > 0 && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-8"
          onClick={() => setShowLargeImage(false)}
        >
          <div className="relative bg-background rounded-xl shadow-2xl max-w-5xl max-h-[90vh] overflow-hidden">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowLargeImage(false)}
              className="absolute top-2 right-2 z-10"
            >
              <XIcon className="h-5 w-5" />
            </Button>
            <img
              src={mod.images[0]}
              alt={`${mod.name} (enlarged)`}
              className="max-w-full max-h-[90vh] object-contain p-2"
            />
          </div>
        </div>
      )}
      <Card className="shadow cursor-pointer" onClick={() => navigate(`/mods/${mod.remoteId}`)}>
        <div className="relative">
          <img src={mod.images[0]} alt={mod.name} className="h-48 w-full object-cover rounded-t-xl" />
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {status === ModStatus.INSTALLED && <Badge>Installed</Badge>}
            {isModOutdated(mod) && <OutdatedModWarning variant="indicator" />}
          </div>
          <Button
            size="icon"
            variant="secondary"
            className="absolute bottom-2 right-2 opacity-80 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              setShowLargeImage(true);
            }}
          >
            <FiZoomIn className="h-4 w-4" />
          </Button>
        </div>
        <CardHeader className="px-2 py-3">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <CardTitle className="text-ellipsis w-36 overflow-clip text-nowrap" title={mod.name}>
                {mod.name}
              </CardTitle>
              <CardDescription className="text-ellipsis w-36 overflow-clip text-nowrap" title={mod.author}>
                By {mod.author}
              </CardDescription>
            </div>
            <div className="flex flex-col">
              <Button
                size="icon"
                variant="outline"
                title="Download Mod"
                onClick={(e) => {
                  e.stopPropagation();
                  download();
                }}
                disabled={status && [ModStatus.DOWNLOADING, ModStatus.DOWNLOADED, ModStatus.INSTALLED].includes(status)}
              >
                {Icon}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>
    </>
  );
};

export default ModCard;
