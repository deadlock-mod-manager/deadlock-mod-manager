import { open } from '@tauri-apps/plugin-shell';
import { format } from 'date-fns';
import { Markup } from 'interweave';
import {
  ArrowLeft,
  Calendar,
  Download,
  Hash,
  Music,
  Tag,
  Trash,
  Upload,
  User,
  Volume2,
} from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from 'react-query';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import InstallWithCollection from '@/components/install-with-collection';
import { InstalledFilesDisplay } from '@/components/installed-files-display';
import { MultiFileDownloadDialog } from '@/components/multi-file-download-dialog';
import NSFWBlur from '@/components/nsfw-blur';
import { OutdatedModWarning } from '@/components/outdated-mod-warning';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import type {
  InstallWithCollectionFunction,
  InstallWithCollectionOptions,
} from '@/hooks/use-install-with-collection';
import { useMultiFileDownload } from '@/hooks/use-multi-file-download';
import useUninstall from '@/hooks/use-uninstall';
import { getMod, getModDownloads } from '@/lib/api';
import { usePersistedStore } from '@/lib/store';
import { cn, formatSize, isModOutdated } from '@/lib/utils';
import { type ModDownloadItem, ModStatus } from '@/types/mods';

const Mod = () => {
  const params = useParams();
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement>(null);
  const { data, error } = useQuery({
    queryKey: ['mod', params.id],
    queryFn: () => {
      if (!params.id) {
        throw new Error('Mod ID is required');
      }
      return getMod(params.id);
    },
    enabled: !!params.id,
    suspense: true,
  });

  // Fetch downloadable files separately
  const { data: downloadData, isLoading: isLoadingFiles } = useQuery({
    queryKey: ['mod-downloads', params.id],
    queryFn: () => {
      if (!params.id) {
        throw new Error('Mod ID is required');
      }
      return getModDownloads(params.id);
    },
    enabled: !!params.id && !!data?.downloadable,
  });

  const availableFiles = (downloadData?.downloads ||
    []) as unknown as ModDownloadItem[];

  const {
    download,
    downloadSelectedFiles,
    closeDialog,
    localMod,
    isDialogOpen,
  } = useMultiFileDownload(data, availableFiles);

  const { uninstall } = useUninstall();
  const {
    setModStatus,
    setInstalledVpks,
    getModProgress,
    nsfwSettings,
    setPerItemNSFWOverride,
    getPerItemNSFWOverride,
  } = usePersistedStore();
  const modProgress = localMod ? getModProgress(localMod.remoteId) : undefined;

  const shouldBlur = useMemo(() => {
    if (!data?.isNSFW) {
      return false; // Not NSFW, no need to blur
    }
    // Check for per-item override first
    const override = getPerItemNSFWOverride(data.remoteId);
    if (override !== undefined) {
      return !override; // If override says show (true), don't blur (false)
    }
    // Use global setting if no per-item override
    return !nsfwSettings.hideNSFW; // If hiding NSFW globally, blur when visible
  }, [data, nsfwSettings.hideNSFW, getPerItemNSFWOverride]);

  const handleNSFWToggle = (visible: boolean) => {
    if (data && nsfwSettings.rememberPerItemOverrides) {
      setPerItemNSFWOverride(data.remoteId, visible);
    }
  };

  useEffect(() => {
    if (error) {
      toast.error(
        (error as Error)?.message ?? 'Failed to fetch mods. Try again later.'
      );
    }
  }, [error]);

  if (!data) {
    return null;
  }

  const isDownloading = localMod?.status === ModStatus.DOWNLOADING;
  const isDownloaded =
    localMod?.status === ModStatus.DOWNLOADED ||
    localMod?.status === ModStatus.INSTALLED;
  const isInstalled = localMod?.status === ModStatus.INSTALLED;
  const isInstalling = localMod?.status === ModStatus.INSTALLING;
  const hasImages = data.images && data.images.length > 0;

  const handleDownload = async () => download();

  const handleUninstall = async () => {
    if (!localMod) {
      return;
    }
    try {
      await uninstall(localMod, false);
    } catch (_error) {
      toast.error('Failed to uninstall mod');
    }
  };

  const createInstallHandler =
    (install: InstallWithCollectionFunction) => async () => {
      if (!localMod) {
        return;
      }
      try {
        const installOptions: InstallWithCollectionOptions = {
          onStart: (mod) => {
            setModStatus(mod.remoteId, ModStatus.INSTALLING);
          },
          onComplete: (mod, result) => {
            setModStatus(mod.remoteId, ModStatus.INSTALLED);
            setInstalledVpks(
              mod.remoteId,
              result.installed_vpks,
              result.file_tree
            );
            toast.success('Mod installed successfully');
          },
          onError: (mod, error) => {
            setModStatus(mod.remoteId, ModStatus.ERROR);
            toast.error(error.message || 'Failed to install mod');
          },
          onCancel: (mod) => {
            setModStatus(mod.remoteId, ModStatus.DOWNLOADED);
            toast.info('Installation canceled');
          },
          onFileTreeAnalyzed: (mod, fileTree) => {
            if (fileTree.has_multiple_files) {
              toast.info(
                `${mod.name} contains ${fileTree.total_files} files. Select which ones to install.`
              );
            }
          },
        };

        await install(localMod, installOptions);
      } catch (_error) {
        toast.error('Failed to install mod');
      }
    };

  return (
    <>
      <InstallWithCollection>
        {({ install }) => {
          const handleInstall = createInstallHandler(install);

          return (
            <div className="scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin h-[calc(100vh-160px)] w-full overflow-y-auto overflow-x-hidden px-4">
              <div className="container mx-auto max-w-6xl space-y-6 py-6">
                <div className="mb-4 flex items-center">
                  <Button
                    className="flex items-center gap-1"
                    onClick={() => navigate('/mods')}
                    size="sm"
                    variant="ghost"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Mods
                  </Button>
                </div>

                {isModOutdated(data) && (
                  <div className="mb-4">
                    <OutdatedModWarning variant="alert" />
                  </div>
                )}

                <Card className="overflow-hidden">
                  {data.isAudio && data.audioUrl ? (
                    <div className="relative h-64 w-full bg-gradient-to-br from-muted via-secondary to-accent">
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="mb-6 flex flex-col items-center gap-4">
                          <Music className="h-16 w-16 text-primary" />
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 p-6">
                        <h1 className="font-bold text-3xl text-primary">
                          {data.name}
                        </h1>
                        <p className="mt-2 text-primary/80">{data.category}</p>
                        <Badge className="mt-2" variant="secondary">
                          Audio Mod
                        </Badge>
                      </div>
                      {data.audioUrl && (
                        <audio
                          preload="metadata"
                          ref={audioRef}
                          src={data.audioUrl}
                        />
                      )}
                    </div>
                  ) : data.hero && hasImages ? (
                    <div className="relative z-10 h-64 w-full">
                      <img
                        alt={`${data.name} hero`}
                        className={cn(
                          'h-full w-full object-cover opacity-70',
                          shouldBlur && 'blur-lg'
                        )}
                        height="256"
                        src={data.images[0]}
                        width="1200"
                      />
                      {!shouldBlur && (
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      )}
                      <div className="absolute bottom-0 left-0 p-6">
                        <h1 className="font-bold text-3xl text-white">
                          {data.name}
                        </h1>
                        <p className="mt-2 text-gray-200">{data.category}</p>
                      </div>
                    </div>
                  ) : null}

                  <div className="z-20 grid grid-cols-1 gap-6 bg-card md:grid-cols-3">
                    <div className="md:col-span-2">
                      {!(data.hero || data.isAudio) && (
                        <CardHeader>
                          <CardTitle className="text-3xl">
                            {data.name}
                          </CardTitle>
                          <CardDescription>{data.category}</CardDescription>
                        </CardHeader>
                      )}

                      <CardContent
                        className={data.hero || data.isAudio ? '' : 'pt-6'}
                      >
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center gap-2">
                              <Hash className="text-muted-foreground" />
                              <span className="text-sm">
                                ID: {data.remoteId}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="text-muted-foreground" />
                              <span className="text-sm">
                                Author: {data.author}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="text-muted-foreground" />
                              <span className="text-sm">
                                Added:{' '}
                                {format(new Date(data.remoteAddedAt), 'PPP')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="text-muted-foreground" />
                              <span className="text-sm">
                                Updated:{' '}
                                {format(new Date(data.remoteUpdatedAt), 'PPP')}
                              </span>
                            </div>
                            {isInstalled && localMod?.installedAt && (
                              <div className="flex items-center gap-2">
                                <Calendar className="text-muted-foreground" />
                                <span className="text-sm">
                                  Installed:{' '}
                                  {format(
                                    new Date(localMod.installedAt),
                                    'PPP'
                                  )}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <Download className="text-muted-foreground" />
                              <span className="text-sm">
                                Downloads: {data.downloadCount}
                              </span>
                            </div>
                          </div>

                          {data.tags && data.tags.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                              <Tag className="text-muted-foreground" />
                              {data.tags.map((tag) => (
                                <Badge key={tag} variant="secondary">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </div>

                    <div>
                      <CardContent className="pt-6">
                        <div className="space-y-4">
                          {isDownloaded ? (
                            <div className="flex flex-col gap-2">
                              {isInstalled ? (
                                <Button
                                  className="w-full"
                                  onClick={handleUninstall}
                                  size="lg"
                                  variant="destructive"
                                >
                                  Uninstall Mod
                                  <Trash className="ml-2" />
                                </Button>
                              ) : (
                                <Button
                                  className="w-full"
                                  disabled={isInstalling}
                                  onClick={handleInstall}
                                  size="lg"
                                  variant="default"
                                >
                                  {isInstalling
                                    ? 'Installing Mod...'
                                    : 'Install Mod'}
                                  <Upload className="ml-2" />
                                </Button>
                              )}

                              {localMod?.status === ModStatus.DOWNLOADED && (
                                <p className="text-center text-muted-foreground text-sm">
                                  Mod downloaded but not installed
                                </p>
                              )}
                            </div>
                          ) : (
                            <Button
                              className="w-full"
                              disabled={isDownloading || !data.downloadable}
                              onClick={handleDownload}
                              size="lg"
                            >
                              {isDownloading
                                ? 'Downloading Mod...'
                                : data.downloadable
                                  ? isInstalling
                                    ? 'Installing'
                                    : 'Download Mod'
                                  : 'Not Downloadable'}
                              <Download className="ml-2" />
                            </Button>
                          )}

                          {modProgress?.percentage !== undefined &&
                            modProgress.percentage > 0 &&
                            modProgress.percentage < 100 && (
                              <div className="space-y-1">
                                <p className="text-center text-muted-foreground text-sm">
                                  Downloading:{' '}
                                  {Math.round(modProgress.percentage)}%
                                </p>
                                <div className="h-2.5 w-full rounded-full bg-secondary">
                                  <div
                                    className="h-2.5 rounded-full bg-primary"
                                    style={{
                                      width: `${modProgress.percentage}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )}

                          {isInstalling && (
                            <div className="space-y-1">
                              <p className="text-center text-muted-foreground text-sm">
                                Installing mod...
                              </p>
                              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                                <div className="absolute inset-0 animate-pulse-x bg-gradient-to-r from-transparent via-primary to-transparent" />
                              </div>
                            </div>
                          )}

                          {localMod?.status === ModStatus.ERROR && (
                            <p className="text-destructive text-sm">
                              Error with mod
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </div>
                  </div>

                  <CardFooter className="z-20 flex flex-col items-start bg-card">
                    {data.remoteUrl && (
                      <Button
                        className="px-0"
                        onClick={async () => {
                          try {
                            await open(data.remoteUrl);
                          } catch (_error) {
                            toast.error('Failed to open forum post');
                          }
                        }}
                        variant="link"
                      >
                        View original forum post
                      </Button>
                    )}
                  </CardFooter>
                </Card>

                {data.description && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Description</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <Markup
                          className="whitespace-pre-line text-sm leading-relaxed"
                          content={data.description}
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isInstalled && localMod?.installedFileTree && (
                  <InstalledFilesDisplay
                    fileTree={localMod.installedFileTree}
                    modName={data.name}
                  />
                )}

                {data.downloadable &&
                  downloadData &&
                  availableFiles.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          Files
                        </CardTitle>
                        <CardDescription>
                          Files that can be installed.{' '}
                          {availableFiles.length > 1
                            ? 'Different versions of the mod are available.'
                            : ''}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="">
                        <ul className="list-disc space-y-2">
                          {availableFiles
                            .sort((a, b) => b.size - a.size)
                            .map((file) => (
                              <li
                                className="flex items-center justify-between text-sm"
                                key={file.name}
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <span className="truncate" title={file.name}>
                                    {file.name}
                                  </span>
                                </div>
                                <span className="ml-2 text-muted-foreground text-xs">
                                  {formatSize(file.size)}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                {data.isAudio && data.audioUrl ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Volume2 className="h-5 w-5" />
                        Audio Preview
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col items-center space-y-6 p-8">
                        <audio
                          className="w-full"
                          controls
                          preload="metadata"
                          src={data.audioUrl}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ) : hasImages ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Gallery</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Carousel className="w-full">
                        <div className="relative">
                          <CarouselContent>
                            {data.images.map((image, index) => (
                              <CarouselItem key={`image-${image}`}>
                                <div className="p-1">
                                  <Card className="overflow-hidden">
                                    <NSFWBlur
                                      blurStrength={nsfwSettings.blurStrength}
                                      className="aspect-video w-full"
                                      disableBlur={nsfwSettings.disableBlur}
                                      isNSFW={shouldBlur}
                                      onToggleVisibility={handleNSFWToggle}
                                    >
                                      <img
                                        alt={`Screenshot ${index + 1}`}
                                        className="aspect-video w-full object-cover"
                                        height="225"
                                        src={image}
                                        width="400"
                                      />
                                    </NSFWBlur>
                                  </Card>
                                </div>
                              </CarouselItem>
                            ))}
                          </CarouselContent>
                          <div className="-right-12 -translate-y-1/2 absolute top-1/2">
                            <CarouselNext />
                          </div>
                          <div className="-left-12 -translate-y-1/2 absolute top-1/2">
                            <CarouselPrevious />
                          </div>
                        </div>
                      </Carousel>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </div>
          );
        }}
      </InstallWithCollection>

      <MultiFileDownloadDialog
        files={availableFiles}
        isDownloading={isDownloading || isLoadingFiles}
        isOpen={isDialogOpen}
        modName={data.name}
        onClose={closeDialog}
        onDownload={downloadSelectedFiles}
      />
    </>
  );
};

export default Mod;
