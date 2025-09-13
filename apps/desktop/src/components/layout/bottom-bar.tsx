import {
  CheckCircle,
  CloudArrowDown,
  DownloadSimple,
  Package,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import useUpdateManager from '@/hooks/use-update-manager';
import { isGameRunning } from '@/lib/api';
import { usePersistedStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ModStatus } from '@/types/mods';

export const BottomBar = () => {
  const { t } = useTranslation();
  const localMods = usePersistedStore((state) => state.localMods);
  const { gamePath } = usePersistedStore();
  const { checkForUpdates, updateAndRelaunch } = useUpdateManager();

  const { data: isRunning } = useQuery({
    queryKey: ['is-game-running'],
    queryFn: () => isGameRunning(),
    refetchInterval: 5000,
    retry: false,
    enabled: !!gamePath,
  });

  const installedMods = localMods.filter(
    (mod) => mod.status === ModStatus.Installed
  ).length;

  const downloadingMods = localMods.filter(
    (mod) => mod.status === ModStatus.Downloading
  ).length;

  const totalMods = localMods.length;

  return (
    <div className="z-30 mt-1 flex h-6 w-full items-center justify-between border-t bg-background py-2 pl-8 text-muted-foreground text-xs">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <Package className="h-3 w-3" />
          <span>
            {t('common.mods')}: {totalMods}
          </span>
          {installedMods > 0 && (
            <>
              <Separator className="mx-1 h-3" orientation="vertical" />
              <CheckCircle className="h-3 w-3 text-green-500" />
              <span>
                {installedMods} {t('common.installed')}
              </span>
            </>
          )}
        </div>

        {downloadingMods > 0 && (
          <>
            l
            <Separator className="mx-1 h-3" orientation="vertical" />
            <div className="flex items-center gap-1">
              <DownloadSimple className="h-3 w-3 animate-pulse text-blue-500" />
              <span>
                {downloadingMods} {t('common.downloading')}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-4">
        {gamePath && (
          <div className="flex items-center gap-1">
            <div
              className={cn('h-2 w-2 rounded-full', {
                'bg-green-500': isRunning,
                'bg-muted-foreground': !isRunning,
              })}
            />
            <span className="text-xs">
              {isRunning ? t('common.gameRunning') : t('common.gameReady')}
            </span>
          </div>
        )}

        {!gamePath && (
          <Badge className="h-5 px-2 py-0 text-xs" variant="destructive">
            {t('common.gameNotDetected')}
          </Badge>
        )}
        <Button
          className="h-5 gap-1 px-2 text-xs"
          onClick={async () => {
            try {
              if (await checkForUpdates()) {
                toast.loading(t('about.downloadingUpdate'));
                await updateAndRelaunch();
              } else {
                toast.info(t('about.latestVersion'));
              }
            } catch (_e) {
              toast.error(t('about.updateFailed'));
            }
          }}
          size="sm"
          variant="ghost"
        >
          <CloudArrowDown className="h-3 w-3" />
          {t('about.checkForUpdates')}
        </Button>
      </div>
    </div>
  );
};
