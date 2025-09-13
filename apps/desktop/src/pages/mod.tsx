import { open } from '@tauri-apps/plugin-shell';
import { ArrowLeft, Trash } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import ModButton from '@/components/mod-browsing/mod-button';
import { InstalledFilesDisplay } from '@/components/mod-detail/installed-files-display';
import { ModAudioPreview } from '@/components/mod-detail/mod-audio-preview';
import { ModDescription } from '@/components/mod-detail/mod-description';
import { ModFiles } from '@/components/mod-detail/mod-files';
import { ModGallery } from '@/components/mod-detail/mod-gallery';
import { ModHero } from '@/components/mod-detail/mod-hero';
import { ModInfo } from '@/components/mod-detail/mod-info';
import { OutdatedModWarning } from '@/components/mod-management/outdated-mod-warning';
import ErrorBoundary from '@/components/shared/error-boundary';
import { Button } from '@/components/ui/button';
import { Card, CardFooter } from '@/components/ui/card';
import { useMod } from '@/hooks/use-mod';
import { useModDownloads } from '@/hooks/use-mod-downloads';
import { useNSFWBlur } from '@/hooks/use-nsfw-blur';
import useUninstall from '@/hooks/use-uninstall';
import { usePersistedStore } from '@/lib/store';
import { isModOutdated } from '@/lib/utils';
import { type ModDownloadItem, ModStatus } from '@/types/mods';

const Mod = () => {
  const params = useParams();
  const navigate = useNavigate();

  const { data: mod, error } = useMod(params.id);

  const { availableFiles: rawAvailableFiles } = useModDownloads({
    remoteId: params.id,
    isDownloadable: mod?.downloadable,
    enabled: !!params.id && !params.id?.includes('local'),
  });

  const availableFiles = rawAvailableFiles as unknown as ModDownloadItem[];

  const { localMods } = usePersistedStore();
  const localMod = localMods.find((m) => m.remoteId === mod?.remoteId);

  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);

  useEffect(() => {
    if (error) {
      toast.error(
        (error as Error)?.message ?? 'Failed to fetch mods. Try again later.'
      );
      navigate('/mods');
    }
  }, [error, navigate]);

  const isInstalled = localMod?.status === ModStatus.Installed;
  const hasImages = mod?.images && mod.images.length > 0;
  const hasHero = !!mod?.hero || !!mod?.isAudio;
  const [deleting, setDeleting] = useState(false);
  const { uninstall } = useUninstall();

  const deleteMod = async () => {
    if (!localMod) {
      return;
    }

    try {
      setDeleting(true);
      await uninstall(localMod, true);
    } catch (error) {
      toast.error(`Failed to remove mod: ${error}`);
    } finally {
      setDeleting(false);
    }
  };

  if (!mod) {
    return null;
  }

  return (
    <ErrorBoundary>
      <div className="scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin h-[calc(100vh-160px)] w-full overflow-y-auto overflow-x-hidden px-4">
        <div className="container mx-auto max-w-6xl space-y-6 py-6">
          <div className="mb-4 flex items-center justify-between">
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

          {isModOutdated(mod) && (
            <div className="mb-4">
              <OutdatedModWarning variant="alert" />
            </div>
          )}

          <Card className="overflow-hidde space-y-4">
            <ModHero mod={mod} shouldBlur={shouldBlur} />
            <ModInfo hasHero={hasHero} mod={mod} />

            <CardFooter className="z-20 flex flex-row items-start justify-between bg-card">
              {mod.remoteUrl && (
                <Button
                  className="px-0"
                  onClick={async () => {
                    try {
                      await open(mod.remoteUrl);
                    } catch (_error) {
                      toast.error('Failed to open forum post');
                    }
                  }}
                  variant="link"
                >
                  View original forum post
                </Button>
              )}

              <div className="flex items-center gap-2">
                <ModButton remoteMod={mod} variant="default" />
                {!!localMod?.status && (
                  <Button
                    icon={<Trash className="h-4 w-4" />}
                    isLoading={deleting}
                    onClick={deleteMod}
                    size="lg"
                    variant="destructive"
                  >
                    Delete Mod
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>

          {mod.description && <ModDescription description={mod.description} />}

          {isInstalled && localMod?.installedFileTree && (
            <InstalledFilesDisplay
              fileTree={localMod.installedFileTree}
              modName={mod.name}
            />
          )}

          <ModFiles
            files={availableFiles}
            isDownloadable={!!mod.downloadable}
          />

          {mod.audioUrl && (
            <ModAudioPreview audioUrl={mod.audioUrl} isAudio={!!mod.isAudio} />
          )}

          {!mod.isAudio && hasImages && mod.images && (
            <ModGallery
              images={mod.images}
              nsfwSettings={nsfwSettings}
              onNSFWToggle={(visible) => handleNSFWToggle(visible)}
              shouldBlur={shouldBlur}
            />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default Mod;
