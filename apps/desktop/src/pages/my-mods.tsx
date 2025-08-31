import ErrorBoundary from '@/components/error-boundary';
import { OutdatedModWarning } from '@/components/outdated-mod-warning';
import PageTitle from '@/components/page-title';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import useInstall from '@/hooks/use-install';
import { useSearch } from '@/hooks/use-search';
import useUninstall from '@/hooks/use-uninstall';
import { createLogger } from '@/lib/logger';
import { usePersistedStore } from '@/lib/store';
import { cn, isModOutdated } from '@/lib/utils';
import { LocalMod, ModStatus } from '@/types/mods';
import { Trash } from '@phosphor-icons/react';
import { LayoutGrid, LayoutList, Loader2, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

const logger = createLogger('installation');

// View mode enum
enum ViewMode {
  GRID = 'grid',
  LIST = 'list'
}

// Custom ModCard for Grid View
const GridModCard = ({ mod }: { mod: LocalMod }) => {
  const isDisabled = mod.status !== ModStatus.INSTALLED;
  const isInstalling = mod.status === ModStatus.INSTALLING;
  const navigate = useNavigate();
  const { setModStatus, setInstalledVpks } = usePersistedStore();
  const { install } = useInstall();
  const { uninstall } = useUninstall();

  return (
    <Card className="shadow">
      <div className={cn('relative', isDisabled && 'grayscale')}>
        <div className="cursor-pointer" onClick={() => navigate(`/mods/${mod.remoteId}`)}>
          <img src={mod.images[0]} alt={mod.name} className="h-48 w-full object-cover rounded-t-xl" />
        </div>
        {isModOutdated(mod) && (
          <div className="absolute top-2 right-2">
            <OutdatedModWarning variant="indicator" />
          </div>
        )}
        {mod.status === ModStatus.INSTALLING && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-t-xl">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>
      <CardHeader className="px-3 py-3 pb-0">
        <div className="flex items-start">
          <div className="flex flex-col">
            <CardTitle
              className="text-ellipsis w-48 overflow-clip text-nowrap cursor-pointer"
              title={mod.name}
              onClick={() => navigate(`/mods/${mod.remoteId}`)}
            >
              {mod.name}
            </CardTitle>
            <CardDescription className="text-ellipsis w-48 overflow-clip text-nowrap" title={mod.author}>
              By {mod.author}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardFooter className="px-3 py-3 pt-2 flex justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id={`install-mod-${mod.remoteId}`}
            checked={mod.status === ModStatus.INSTALLED}
            disabled={isInstalling}
            onCheckedChange={(value) => {
              if (value) {
                install(mod, {
                  onStart: (mod) => {
                    logger.info('Starting installation', { mod: mod.remoteId });
                    setModStatus(mod.remoteId, ModStatus.INSTALLING);
                  },
                  onComplete: (mod, result) => {
                    logger.info('Installation complete', { mod: mod.remoteId, result: result.installed_vpks });
                    setInstalledVpks(mod.remoteId, result.installed_vpks);
                  },
                  onError: (mod, error) => {
                    logger.error('Installation error', { mod: mod.remoteId, error });
                    toast.error(error.message);

                    switch (error.kind) {
                      case 'modAlreadyInstalled':
                        setModStatus(mod.remoteId, ModStatus.INSTALLED);
                        break;
                      default:
                        setModStatus(mod.remoteId, ModStatus.ERROR);
                    }
                  }
                });
              } else {
                uninstall(mod, false);
              }
            }}
          />
          <Label htmlFor={`install-mod-${mod.remoteId}`} className="text-xs">
            {isInstalling ? 'Installing...' : mod.status === ModStatus.INSTALLED ? 'Disable' : 'Enable'}
          </Label>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={() => uninstall(mod, true)} disabled={isInstalling}>
              <Trash className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove mod</TooltipContent>
        </Tooltip>
      </CardFooter>
    </Card>
  );
};

// List view card for mods
const ListModCard = ({ mod }: { mod: LocalMod }) => {
  const isDisabled = mod.status !== ModStatus.INSTALLED;
  const isInstalling = mod.status === ModStatus.INSTALLING;
  const navigate = useNavigate();
  const { setModStatus, setInstalledVpks } = usePersistedStore();
  const { install } = useInstall();
  const { uninstall } = useUninstall();

  return (
    <Card className="shadow">
      <div className="flex">
        <div
          className={cn('relative h-24 w-24 min-w-24', isDisabled && 'grayscale')}
          onClick={() => navigate(`/mods/${mod.remoteId}`)}
        >
          <img src={mod.images[0]} alt={mod.name} className="h-full w-full object-cover rounded-l-xl cursor-pointer" />
          {isModOutdated(mod) && (
            <div className="absolute top-1 right-1">
              <OutdatedModWarning variant="indicator" className="text-xs" />
            </div>
          )}
          {mod.status === ModStatus.INSTALLING && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
        </div>
        <div className="flex flex-col justify-between p-3 w-full">
          <div>
            <h3 className="font-semibold text-lg cursor-pointer" onClick={() => navigate(`/mods/${mod.remoteId}`)}>
              {mod.name}
            </h3>
            <p className="text-sm text-muted-foreground">By {mod.author}</p>
          </div>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Switch
                id={`list-install-mod-${mod.remoteId}`}
                checked={mod.status === ModStatus.INSTALLED}
                disabled={isInstalling}
                onCheckedChange={(value) => {
                  if (value) {
                    install(mod, {
                      onStart: (mod) => {
                        logger.info('Starting installation', { mod: mod.remoteId });
                        setModStatus(mod.remoteId, ModStatus.INSTALLING);
                      },
                      onComplete: (mod, result) => {
                        logger.info('Installation complete', { mod: mod.remoteId, result: result.installed_vpks });
                        setInstalledVpks(mod.remoteId, result.installed_vpks);
                      },
                      onError: (mod, error) => {
                        logger.error('Installation error', { mod: mod.remoteId, error });

                        switch (error.kind) {
                          case 'modAlreadyInstalled':
                            setModStatus(mod.remoteId, ModStatus.INSTALLED);
                            break;
                          default:
                            setModStatus(mod.remoteId, ModStatus.ERROR);
                        }
                      }
                    });
                  } else {
                    uninstall(mod, false);
                  }
                }}
              />
              <Label htmlFor={`list-install-mod-${mod.remoteId}`} className="text-xs">
                {isInstalling ? 'Installing...' : mod.status === ModStatus.INSTALLED ? 'Disable' : 'Enable'}
              </Label>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={() => uninstall(mod, true)} disabled={isInstalling}>
                  <Trash className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove mod</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </Card>
  );
};

// Simple search bar without sorting
const SimpleSearchBar = ({ query, setQuery }: { query: string; setQuery: (query: string) => void }) => {
  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input placeholder="Search mods" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
    </div>
  );
};

const MyMods = () => {
  const mods = usePersistedStore((state) => state.mods);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.GRID);
  const { results, query, setQuery } = useSearch({
    data: mods,
    keys: ['name', 'description', 'author']
  });

  return (
    <div className="h-[calc(100vh-160px)] overflow-y-auto px-4 gap-4 w-full scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin">
      <PageTitle className="mb-8" title="My Mods" />
      <ErrorBoundary>
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <SimpleSearchBar query={query} setQuery={setQuery} />
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === ViewMode.GRID ? 'default' : 'outline'}
                    size="icon"
                    onClick={() => setViewMode(ViewMode.GRID)}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Grid view</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === ViewMode.LIST ? 'default' : 'outline'}
                    size="icon"
                    onClick={() => setViewMode(ViewMode.LIST)}
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
                <GridModCard key={mod.remoteId} mod={mod} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {results.map((mod) => (
                <ListModCard key={mod.remoteId} mod={mod} />
              ))}
            </div>
          )}
        </div>
      </ErrorBoundary>
    </div>
  );
};

export default MyMods;
