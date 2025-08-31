import type { ModDto } from '@deadlock-mods/utils';
import { CheckIcon, DownloadIcon, Loader2, XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FiZoomIn } from 'react-icons/fi';
import { useNavigate } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { useDownload } from '@/hooks/use-download';
import { isModOutdated } from '@/lib/utils';
import { ModStatus } from '@/types/mods';
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
      <Card className="cursor-pointer shadow">
        <Skeleton className="h-48 w-full rounded-t-xl bg-muted object-cover" />
        <CardHeader className="px-2 py-3">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-2">
              <CardTitle>
                <Skeleton className="h-4 w-32" />
              </CardTitle>
              <CardDescription>
                <Skeleton className="h-4 w-32" />
              </CardDescription>
            </div>
            <div className="flex flex-col">
              <Button disabled size="icon" variant="outline">
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8"
          onClick={() => setShowLargeImage(false)}
        >
          <div className="relative max-h-[90vh] max-w-5xl overflow-hidden rounded-xl bg-background shadow-2xl">
            <Button
              className="absolute top-2 right-2 z-10"
              onClick={() => setShowLargeImage(false)}
              size="icon"
              variant="ghost"
            >
              <XIcon className="h-5 w-5" />
            </Button>
            <img
              alt={`${mod.name} (enlarged)`}
              className="max-h-[90vh] max-w-full object-contain p-2"
              src={mod.images[0]}
            />
          </div>
        </div>
      )}
      <Card
        className="cursor-pointer shadow"
        onClick={() => navigate(`/mods/${mod.remoteId}`)}
      >
        <div className="relative">
          <img
            alt={mod.name}
            className="h-48 w-full rounded-t-xl object-cover"
            src={mod.images[0]}
          />
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {status === ModStatus.INSTALLED && <Badge>Installed</Badge>}
            {isModOutdated(mod) && <OutdatedModWarning variant="indicator" />}
          </div>
          <Button
            className="absolute right-2 bottom-2 opacity-80 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              setShowLargeImage(true);
            }}
            size="icon"
            variant="secondary"
          >
            <FiZoomIn className="h-4 w-4" />
          </Button>
        </div>
        <CardHeader className="px-2 py-3">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <CardTitle
                className="w-36 overflow-clip text-ellipsis text-nowrap"
                title={mod.name}
              >
                {mod.name}
              </CardTitle>
              <CardDescription
                className="w-36 overflow-clip text-ellipsis text-nowrap"
                title={mod.author}
              >
                By {mod.author}
              </CardDescription>
            </div>
            <div className="flex flex-col">
              <Button
                disabled={
                  status &&
                  [
                    ModStatus.DOWNLOADING,
                    ModStatus.DOWNLOADED,
                    ModStatus.INSTALLED,
                  ].includes(status)
                }
                onClick={(e) => {
                  e.stopPropagation();
                  download();
                }}
                size="icon"
                title="Download Mod"
                variant="outline"
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
