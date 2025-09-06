import { Trash } from '@phosphor-icons/react';
import {
  Download,
  LayoutGrid,
  LayoutList,
  Loader2,
  Music,
  Pause,
  Play,
  Search,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import ErrorBoundary from '@/components/error-boundary';
import InstallWithCollection from '@/components/install-with-collection';
import NSFWBlur from '@/components/nsfw-blur';
import { OutdatedModWarning } from '@/components/outdated-mod-warning';
import PageTitle from '@/components/page-title';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  InstallWithCollectionFunction,
  InstallWithCollectionOptions,
} from '@/hooks/use-install-with-collection';
import { useMultiFileDownload } from '@/hooks/use-multi-file-download';
import { useSearch } from '@/hooks/use-search';
import useUninstall from '@/hooks/use-uninstall';
import useUpdateMod from '@/hooks/use-update-mod';
import { getModDownloads } from '@/lib/api';
import { createLogger } from '@/lib/logger';
import { usePersistedStore } from '@/lib/store';
import { canModUpdate, cn, isModOutdated } from '@/lib/utils';
import { type LocalMod, ModStatus } from '@/types/mods';

const logger = createLogger('installation');

// View mode enum
enum ViewMode {
  GRID = 'grid',
  LIST = 'list',
}

// Custom ModCard for Grid View
const GridModCard = ({
  mod,
  install,
  installOptions,
}: {
  mod: LocalMod;
  install: InstallWithCollectionFunction;
  installOptions: InstallWithCollectionOptions;
}) => {
  const isDisabled = mod.status !== ModStatus.INSTALLED;
  const isInstalling = mod.status === ModStatus.INSTALLING;
  const hasUpdate = canModUpdate(mod);
  const navigate = useNavigate();
  const { nsfwSettings, setPerItemNSFWOverride, getPerItemNSFWOverride } =
    usePersistedStore();
  const { uninstall } = useUninstall();
  const { update, isUpdating } = useUpdateMod(mod);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Fetch downloadable files for updates
  const { data: downloadData } = useQuery({
    queryKey: ['mod-downloads', mod.remoteId],
    queryFn: () => getModDownloads(mod.remoteId),
    enabled: hasUpdate && !!mod.downloadable,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const availableFiles = downloadData?.downloads || [];

  const { download: downloadWithSelection } = useMultiFileDownload(
    mod,
    availableFiles
  );

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

  return (
    <Card className="shadow">
      <div className={cn('relative', isDisabled && 'grayscale')}>
        <div
          className="cursor-pointer"
          onClick={() => navigate(`/mods/${mod.remoteId}`)}
        >
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
          ) : mod.images && mod.images.length > 0 ? (
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
                <div className="mx-auto mb-2 h-12 w-12" />
                <p className="text-sm">No preview available</p>
              </div>
            </div>
          )}
        </div>
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {mod.isAudio && <Badge variant="secondary">Audio</Badge>}
          {hasUpdate && (
            <Badge
              className="animate-pulse bg-primary text-primary-foreground"
              variant="secondary"
            >
              Update
            </Badge>
          )}
          {isModOutdated(mod) && <OutdatedModWarning variant="indicator" />}
        </div>
        {mod.status === ModStatus.INSTALLING && (
          <div className="absolute inset-0 flex items-center justify-center rounded-t-xl bg-black/50">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>
      <CardHeader className="px-3 py-3 pb-0">
        <div className="flex items-start">
          <div className="flex flex-col">
            <CardTitle
              className="w-48 cursor-pointer overflow-clip text-ellipsis text-nowrap"
              onClick={() => navigate(`/mods/${mod.remoteId}`)}
              title={mod.name}
            >
              {mod.name}
            </CardTitle>
            <CardDescription
              className="w-48 overflow-clip text-ellipsis text-nowrap"
              title={mod.author}
            >
              By {mod.author}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardFooter className="flex justify-between px-3 py-3 pt-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={mod.status === ModStatus.INSTALLED}
            disabled={isInstalling || isUpdating(mod)}
            id={`install-mod-${mod.remoteId}`}
            onCheckedChange={(value) => {
              if (value) {
                install(mod, installOptions);
              } else {
                uninstall(mod, false);
              }
            }}
          />
          <Label className="text-xs" htmlFor={`install-mod-${mod.remoteId}`}>
            {isInstalling
              ? 'Installing...'
              : isUpdating(mod)
                ? 'Updating...'
                : mod.status === ModStatus.INSTALLED
                  ? 'Disable'
                  : 'Enable'}
          </Label>
        </div>
        <div className="flex items-center gap-1">
          {hasUpdate && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={isInstalling || isUpdating(mod)}
                  onClick={() => update(mod, install, downloadWithSelection)}
                  size="icon"
                  variant="outline"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Update mod</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => uninstall(mod, true)}
                size="icon"
                variant="outline"
              >
                <Trash className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove mod</TooltipContent>
          </Tooltip>
        </div>
      </CardFooter>
    </Card>
  );
};

// List view card for mods
const ListModCard = ({
  mod,
  install,
  installOptions,
}: {
  mod: LocalMod;
  install: InstallWithCollectionFunction;
  installOptions: InstallWithCollectionOptions;
}) => {
  const isDisabled = mod.status !== ModStatus.INSTALLED;
  const isInstalling = mod.status === ModStatus.INSTALLING;
  const hasUpdate = canModUpdate(mod);
  const navigate = useNavigate();
  const { nsfwSettings, setPerItemNSFWOverride, getPerItemNSFWOverride } =
    usePersistedStore();
  const { uninstall } = useUninstall();
  const { update, isUpdating } = useUpdateMod(mod);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Fetch downloadable files for updates
  const { data: downloadData } = useQuery({
    queryKey: ['mod-downloads', mod.remoteId],
    queryFn: () => getModDownloads(mod.remoteId),
    enabled: hasUpdate && !!mod.downloadable,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const availableFiles = (downloadData?.downloads ||
    []) as unknown as import('@/types/mods').ModDownloadItem[];

  const { download: downloadWithSelection } = useMultiFileDownload(
    mod,
    availableFiles
  );

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

  return (
    <Card className="shadow">
      <div className="flex items-center">
        <div
          className={cn(
            'relative h-24 w-24 min-w-24',
            isDisabled && 'grayscale'
          )}
          onClick={() => navigate(`/mods/${mod.remoteId}`)}
        >
          {mod.isAudio ? (
            // Audio-only mod display - Clean design for list view
            <div className="relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden rounded-l-xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5">
              <div className="relative z-10 flex items-center justify-center">
                <Button
                  className={`h-8 w-8 border-primary/40 p-0 text-primary shadow-sm transition-all duration-200 ${
                    isPlaying
                      ? 'scale-105 bg-primary/30 hover:bg-primary/40'
                      : 'bg-primary/20 hover:scale-110 hover:bg-primary/30'
                  }`}
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
                    <Play className="ml-0.5 h-4 w-4" />
                  )}
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
          ) : mod.images && mod.images.length > 0 ? (
            // Regular mod with images
            <NSFWBlur
              blurStrength={nsfwSettings.blurStrength}
              className="h-full w-full cursor-pointer overflow-hidden rounded-l-xl"
              disableBlur={nsfwSettings.disableBlur}
              isNSFW={shouldBlur}
              onToggleVisibility={handleNSFWToggle}
            >
              <img
                alt={mod.name}
                className="h-full w-full object-cover"
                height="160"
                src={mod.images[0]}
                width="160"
              />
            </NSFWBlur>
          ) : (
            // Fallback for mods without images or audio
            <div className="flex h-full w-full cursor-pointer items-center justify-center rounded-l-xl bg-muted">
              <div className="text-center text-muted-foreground">
                <div className="mx-auto h-6 w-6" />
              </div>
            </div>
          )}
          <div className="absolute top-1 right-1 flex flex-col gap-1">
            {mod.isAudio && (
              <Badge className="text-xs" variant="secondary">
                Audio
              </Badge>
            )}
            {hasUpdate && (
              <Badge className="animate-pulse text-xs" variant="secondary">
                Update
              </Badge>
            )}
            {isModOutdated(mod) && (
              <OutdatedModWarning className="text-xs" variant="indicator" />
            )}
          </div>
          {mod.status === ModStatus.INSTALLING && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
        </div>
        <div className="flex w-full flex-col justify-between p-3">
          <div>
            <h3
              className="cursor-pointer font-semibold text-lg"
              onClick={() => navigate(`/mods/${mod.remoteId}`)}
            >
              {mod.name}
            </h3>
            <p className="text-muted-foreground text-sm">
              By {mod.author} {mod.isAudio && '• Audio Mod'}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={mod.status === ModStatus.INSTALLED}
                disabled={isInstalling || isUpdating(mod)}
                id={`list-install-mod-${mod.remoteId}`}
                onCheckedChange={(value) => {
                  if (value) {
                    install(mod, installOptions);
                  } else {
                    uninstall(mod, false);
                  }
                }}
              />
              <Label
                className="text-xs"
                htmlFor={`list-install-mod-${mod.remoteId}`}
              >
                {isInstalling
                  ? 'Installing...'
                  : isUpdating(mod)
                    ? 'Updating...'
                    : mod.status === ModStatus.INSTALLED
                      ? 'Disable'
                      : 'Enable'}
              </Label>
            </div>
            <div className="flex items-center gap-1">
              {hasUpdate && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      disabled={isInstalling || isUpdating(mod)}
                      onClick={() =>
                        update(mod, install, downloadWithSelection)
                      }
                      size="icon"
                      variant="outline"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Update mod</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    disabled={isInstalling || isUpdating(mod)}
                    onClick={() => uninstall(mod, true)}
                    size="icon"
                    variant="outline"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove mod</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

// Simple search bar without sorting
const SimpleSearchBar = ({
  query,
  setQuery,
}: {
  query: string;
  setQuery: (query: string) => void;
}) => {
  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
      <Input
        className="pl-8"
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search mods"
        value={query}
      />
    </div>
  );
};

const MyMods = () => {
  const mods = usePersistedStore((state) => state.mods);
  const { setModStatus, setInstalledVpks } = usePersistedStore();
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.GRID);
  const { results, query, setQuery } = useSearch({
    data: mods,
    keys: ['name', 'description', 'author'],
  });

  return (
    <div className="scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin h-[calc(100vh-160px)] w-full gap-4 overflow-y-auto px-4">
      <PageTitle className="mb-8" title="My Mods" />
      <ErrorBoundary>
        <InstallWithCollection>
          {({ install }) => {
            const installOptions: InstallWithCollectionOptions = {
              onStart: (mod) => {
                logger.info('Starting installation', { mod: mod.remoteId });
                setModStatus(mod.remoteId, ModStatus.INSTALLING);
              },
              onComplete: (mod, result) => {
                logger.info('Installation complete', {
                  mod: mod.remoteId,
                  result: result.installed_vpks,
                  hasFileTree: !!result.file_tree,
                });
                setModStatus(mod.remoteId, ModStatus.INSTALLED);
                setInstalledVpks(
                  mod.remoteId,
                  result.installed_vpks,
                  result.file_tree
                );
                toast.success('Mod installed successfully');
              },
              onError: (mod, error) => {
                logger.error('Installation error', {
                  mod: mod.remoteId,
                  error,
                });
                toast.error(error.message || 'Failed to install mod');

                switch (error.kind) {
                  case 'modAlreadyInstalled':
                    setModStatus(mod.remoteId, ModStatus.INSTALLED);
                    break;
                  default:
                    setModStatus(mod.remoteId, ModStatus.ERROR);
                }
              },
              onCancel: (mod) => {
                logger.info('Installation canceled', { mod: mod.remoteId });
                setModStatus(mod.remoteId, ModStatus.DOWNLOADED);
                toast.info('Installation canceled');
              },
              onFileTreeAnalyzed: (mod, fileTree) => {
                logger.info('File tree analyzed', {
                  mod: mod.remoteId,
                  hasMultipleFiles: fileTree.has_multiple_files,
                  totalFiles: fileTree.total_files,
                });
                if (fileTree.has_multiple_files) {
                  toast.info(
                    `${mod.name} contains ${fileTree.total_files} files. Select which ones to install.`
                  );
                }
              },
            };

            return (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <SimpleSearchBar query={query} setQuery={setQuery} />
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => setViewMode(ViewMode.GRID)}
                          size="icon"
                          variant={
                            viewMode === ViewMode.GRID ? 'default' : 'outline'
                          }
                        >
                          <LayoutGrid className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Grid view</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => setViewMode(ViewMode.LIST)}
                          size="icon"
                          variant={
                            viewMode === ViewMode.LIST ? 'default' : 'outline'
                          }
                        >
                          <LayoutList className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>List view</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {viewMode === ViewMode.GRID ? (
                  <div className="grid grid-cols-4 gap-4">
                    {results.map((mod) => (
                      <GridModCard
                        install={install}
                        installOptions={installOptions}
                        key={mod.remoteId}
                        mod={mod}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {results.map((mod) => (
                      <ListModCard
                        install={install}
                        installOptions={installOptions}
                        key={mod.remoteId}
                        mod={mod}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          }}
        </InstallWithCollection>
      </ErrorBoundary>
    </div>
  );
};

export default MyMods;
