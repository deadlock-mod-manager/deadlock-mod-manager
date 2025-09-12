import type { ModDto } from '@deadlock-mods/utils';
import { format } from 'date-fns';
import {
  CalendarIcon,
  CheckIcon,
  DownloadIcon,
  HeartIcon,
  Loader2,
  Music,
  Pause,
  Play,
  XIcon,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router';
import { MultiFileDownloadDialog } from '@/components/multi-file-download-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useMultiFileDownload } from '@/hooks/use-multi-file-download';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { getModDownloads } from '@/lib/api';
import { usePersistedStore } from '@/lib/store';
import { isModOutdated } from '@/lib/utils';
import { ModStatus } from '@/types/mods';
import NSFWBlur from './nsfw-blur';
import { OutdatedModWarning } from './outdated-mod-warning';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';

const ModCard = ({ mod }: { mod?: ModDto }) => {
  const { data: downloadData, isLoading: isLoadingFiles } = useQuery({
    queryKey: ['mod-downloads', mod?.remoteId],
    queryFn: () => {
      if (!mod?.remoteId) {
        throw new Error('Mod ID is required');
      }
      return getModDownloads(mod.remoteId);
    },
    enabled: !!mod?.remoteId && !!mod?.downloadable,
  });

  const availableFiles = downloadData?.downloads ?? [];

  const {
    download,
    downloadSelectedFiles,
    closeDialog,
    localMod,
    isDialogOpen,
  } = useMultiFileDownload(mod, availableFiles);

  const status = localMod?.status;
  const navigate = useNavigate();
  const [showLargeImage, setShowLargeImage] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const { saveScrollPosition } = useScrollPosition('/mods');
  const { setScrollPosition } = usePersistedStore();

  // NSFW settings and visibility
  const { nsfwSettings, setPerItemNSFWOverride, getPerItemNSFWOverride } =
    usePersistedStore();

  const shouldBlur = useMemo(() => {
    if (!mod?.isNSFW) {
      return false; // Not NSFW, no need to blur
    }

    // Check for per-item override first
    const override = getPerItemNSFWOverride(mod.remoteId);
    if (override !== undefined) {
      return !override; // If override says show (true), don't blur (false)
    }

    // Use global setting if no per-item override
    return !nsfwSettings.hideNSFW; // If hiding NSFW globally, blur when visible
  }, [mod, nsfwSettings.hideNSFW, getPerItemNSFWOverride]);

  const handleNSFWToggle = (visible: boolean) => {
    if (mod && nsfwSettings.rememberPerItemOverrides) {
      setPerItemNSFWOverride(mod.remoteId, visible);
    }
  };

  const toggleAudioPlayback = () => {
    if (!audioRef.current) {
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  const Icon = useMemo(() => {
    switch (status) {
      case ModStatus.Downloading:
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case ModStatus.Downloaded:
        return <CheckIcon className="h-4 w-4" />;
      case ModStatus.Installed:
        return <CheckIcon className="h-4 w-4" />;
      default:
        return <DownloadIcon className="h-4 w-4" />;
    }
  }, [status]);

  if (!mod) {
    return (
      <Card className="cursor-pointer shadow">
        <Skeleton className="h-48 w-full rounded-t-xl bg-muted" />
        <CardHeader className="px-3 py-4">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-3">
              <div className="space-y-1">
                <CardTitle>
                  <Skeleton className="h-4 w-32" />
                </CardTitle>
                <CardDescription>
                  <Skeleton className="h-4 w-32" />
                </CardDescription>
              </div>
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
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
        <button
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8"
          onClick={() => setShowLargeImage(false)}
          type="button"
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
              height="720"
              src={mod.images[0]}
              width="1280"
            />
          </div>
        </button>
      )}
      <Card
        className="cursor-pointer shadow"
        onClick={(e) => {
          const scrollContainer = (e.currentTarget as HTMLElement).closest(
            '.overflow-auto'
          );
          if (scrollContainer) {
            const scrollTop = scrollContainer.scrollTop;
            setScrollPosition('/mods', scrollTop);
          } else {
            saveScrollPosition();
          }

          navigate(`/mods/${mod.remoteId}`);
        }}
      >
        <div className="relative">
          {mod.isAudio ? (
            // Audio-only mod display
            <div className="relative flex h-48 w-full flex-col items-center justify-center overflow-hidden rounded-t-xl bg-gradient-to-br from-muted via-secondary to-accent">
              <div className="relative z-10 flex flex-col items-center gap-2">
                <Music className="h-8 w-8 text-primary" />
                <Button
                  className="border-primary/30 bg-primary/20 text-primary hover:bg-primary/30"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAudioPlayback();
                  }}
                  size="sm"
                  variant="outline"
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {isPlaying ? 'Pause' : 'Preview'}
                </Button>
              </div>
              {mod.audioUrl && (
                <audio
                  onEnded={handleAudioEnded}
                  preload="metadata"
                  ref={audioRef}
                  src={mod.audioUrl}
                />
              )}
            </div>
          ) : mod.images.length > 0 ? (
            // Regular mod with images
            <NSFWBlur
              blurStrength={nsfwSettings.blurStrength}
              className="h-48 w-full overflow-hidden rounded-t-xl"
              disableBlur={nsfwSettings.disableBlur}
              isNSFW={shouldBlur}
              onToggleVisibility={handleNSFWToggle}
            >
              <img
                alt={mod.name}
                className="h-48 w-full object-cover"
                height="192"
                src={mod.images[0]}
                width="320"
              />
            </NSFWBlur>
          ) : (
            // Fallback for mods without images or audio
            <div className="flex h-48 w-full items-center justify-center rounded-t-xl bg-muted">
              <div className="text-center text-muted-foreground">
                <DownloadIcon className="mx-auto mb-2 h-12 w-12" />
                <p className="text-sm">No preview available</p>
              </div>
            </div>
          )}
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {mod.isAudio && <Badge variant="secondary">Audio</Badge>}
            {status === ModStatus.Installed && <Badge>Installed</Badge>}
            {isModOutdated(mod) && <OutdatedModWarning variant="indicator" />}
          </div>
        </div>
        <CardHeader className="px-3 py-4">
          <div className="flex items-start justify-between">
            <div className="flex w-full flex-col gap-3">
              <div className="space-y-1">
                <CardTitle
                  className="overflow-clip text-ellipsis text-nowrap leading-tight"
                  title={mod.name}
                >
                  {mod.name}
                </CardTitle>
                <CardDescription
                  className="overflow-clip text-ellipsis text-nowrap"
                  title={mod.author}
                >
                  By {mod.author}
                </CardDescription>
              </div>

              <div className="flex flex-row justify-between">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <div className="flex items-center gap-1.5">
                      <DownloadIcon className="h-3 w-3 flex-shrink-0" />
                      <span>{mod.downloadCount.toLocaleString()}</span>
                    </div>
                    {mod.likes > 0 && (
                      <div className="flex items-center gap-1.5">
                        <HeartIcon className="ml-2 h-3 w-3 flex-shrink-0" />
                        <span>{mod.likes.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <CalendarIcon className="h-3 w-3 flex-shrink-0" />
                    <span title={format(new Date(mod.remoteUpdatedAt), 'PPP')}>
                      {format(new Date(mod.remoteUpdatedAt), 'MMM d, yyyy')}
                    </span>
                  </div>
                </div>

                <Button
                  disabled={
                    status &&
                    [
                      ModStatus.Downloading,
                      ModStatus.Downloaded,
                      ModStatus.Installed,
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
          </div>
        </CardHeader>
      </Card>

      <MultiFileDownloadDialog
        files={availableFiles}
        isDownloading={isLoadingFiles}
        isOpen={isDialogOpen}
        modName={mod?.name || 'Unknown Mod'}
        onClose={closeDialog}
        onDownload={downloadSelectedFiles}
      />
    </>
  );
};

export default ModCard;
