import { open } from '@tauri-apps/plugin-shell';
import { ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import ErrorBoundary from '@/components/shared/error-boundary';
import { InstalledFilesDisplay } from '@/components/mod-detail/installed-files-display';
import { ModAudioPreview } from '@/components/mod-detail/mod-audio-preview';
import { ModDescription } from '@/components/mod-detail/mod-description';
import { ModFiles } from '@/components/mod-detail/mod-files';
import { ModGallery } from '@/components/mod-detail/mod-gallery';
import { ModHero } from '@/components/mod-detail/mod-hero';
import { ModInfo } from '@/components/mod-detail/mod-info';
import { OutdatedModWarning } from '@/components/mod-management/outdated-mod-warning';
import { Button } from '@/components/ui/button';
import { Card, CardFooter } from '@/components/ui/card';
import { useMod } from '@/hooks/use-mod';
import { useModDownloads } from '@/hooks/use-mod-downloads';
import { useNSFWBlur } from '@/hooks/use-nsfw-blur';
import { usePersistedStore } from '@/lib/store';
import { isModOutdated } from '@/lib/utils';
import { type ModDownloadItem, ModStatus } from '@/types/mods';

const Mod = () => {
  const params = useParams();
  const navigate = useNavigate();

  const { data, error } = useMod(params.id);

  const { availableFiles: rawAvailableFiles } = useModDownloads({
    remoteId: params.id,
    isDownloadable: data?.downloadable,
    enabled: !!params.id && !params.id?.includes('local'),
  });

  const availableFiles = rawAvailableFiles as unknown as ModDownloadItem[];

  const { localMods } = usePersistedStore();
  const localMod = localMods.find((m) => m.remoteId === data?.remoteId);

  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(data);

  useEffect(() => {
    if (error) {
      toast.error(
        (error as Error)?.message ?? 'Failed to fetch mods. Try again later.'
      );
      navigate('/mods');
    }
  }, [error, navigate]);

  if (!data) {
    return null;
  }

  const isInstalled = localMod?.status === ModStatus.Installed;
  const hasImages = data.images && data.images.length > 0;
  const hasHero = !!data.hero || !!data.isAudio;

  return (
    <ErrorBoundary>
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
            <ModHero mod={data} shouldBlur={shouldBlur} />
            <ModInfo hasHero={hasHero} mod={data} />

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
            <ModDescription description={data.description} />
          )}

          {isInstalled && localMod?.installedFileTree && (
            <InstalledFilesDisplay
              fileTree={localMod.installedFileTree}
              modName={data.name}
            />
          )}

          <ModFiles
            files={availableFiles}
            isDownloadable={!!data.downloadable}
          />

          {data.audioUrl && (
            <ModAudioPreview
              audioUrl={data.audioUrl}
              isAudio={!!data.isAudio}
            />
          )}

          {!data.isAudio && hasImages && data.images && (
            <ModGallery
              images={data.images}
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
