import { getMod } from '@/lib/api';
import { format } from 'date-fns';
import { ArrowLeft, Calendar, Download, Tag, Trash, Upload, User } from 'lucide-react';
import { useEffect } from 'react';
import { useQuery } from 'react-query';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Separator } from '@/components/ui/separator';
import { useDownload } from '@/hooks/use-download';
import useInstall from '@/hooks/use-install';
import useUninstall from '@/hooks/use-uninstall';
import { usePersistedStore } from '@/lib/store';
import { ModStatus } from '@/types/mods';

const Mod = () => {
  const params = useParams();
  const navigate = useNavigate();
  const { data, error } = useQuery({
    queryKey: ['mod', params.id],
    queryFn: () => getMod(params.id!),
    enabled: !!params.id,
    suspense: true
  });

  const { download, localMod } = useDownload(data);
  const { uninstall } = useUninstall();
  const { install } = useInstall();
  const { setModStatus, setInstalledVpks, getModProgress } = usePersistedStore();
  const modProgress = localMod ? getModProgress(localMod.remoteId) : undefined;

  useEffect(() => {
    if (error) toast.error((error as Error)?.message ?? 'Failed to fetch mods. Try again later.');
  }, [error]);

  if (!data) return null;

  const isDownloading = localMod?.status === ModStatus.DOWNLOADING;
  const isDownloaded = localMod?.status === ModStatus.DOWNLOADED || localMod?.status === ModStatus.INSTALLED;
  const isInstalled = localMod?.status === ModStatus.INSTALLED;
  const isInstalling = localMod?.status === ModStatus.INSTALLING;
  const hasImages = data.images && data.images.length > 0;

  const handleDownload = async () => {
    try {
      await download();
      toast.success('Mod download started');
    } catch (error) {
      toast.error('Failed to download mod');
    }
  };

  const handleUninstall = async () => {
    if (!localMod) return;
    try {
      await uninstall(localMod, false);
    } catch (error) {
      toast.error('Failed to uninstall mod');
    }
  };

  const handleInstall = async () => {
    if (!localMod) return;
    try {
      const installOptions = {
        onStart: (mod: typeof localMod) => {
          setModStatus(mod.remoteId, ModStatus.INSTALLING);
        },
        onComplete: (mod: typeof localMod, result: { installed_vpks: string[] }) => {
          setInstalledVpks(mod.remoteId, result.installed_vpks);
          toast.success('Mod installed successfully');
        },
        onError: (mod: typeof localMod, error: { message?: string }) => {
          setModStatus(mod.remoteId, ModStatus.ERROR);
          toast.error(error.message || 'Failed to install mod');
        }
      };

      await install(localMod, installOptions);
    } catch (error) {
      toast.error('Failed to install mod');
    }
  };

  return (
    <div className="h-[calc(100vh-160px)] overflow-y-auto overflow-x-hidden px-4 w-full scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin">
      <div className="container max-w-6xl mx-auto py-6 space-y-6">
        <div className="flex items-center mb-4">
          <Button variant="ghost" size="sm" className="flex items-center gap-1" onClick={() => navigate('/mods')}>
            <ArrowLeft className="h-4 w-4" />
            Back to Mods
          </Button>
        </div>

        <Card className="overflow-hidden">
          {/* Hero image */}
          {data.hero && (
            <div className="w-full h-64 bg-gradient-to-r from-gray-900 to-gray-800 relative">
              <img src={data.images[0]} alt={`${data.name} hero`} className="w-full h-full object-cover opacity-70" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
              <div className="absolute bottom-0 left-0 p-6">
                <h1 className="text-3xl font-bold text-white">{data.name}</h1>
                <p className="text-gray-200 mt-2">{data.category}</p>
              </div>
            </div>
          )}

          {/* Main content */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left side - Info */}
            <div className="md:col-span-2">
              {!data.hero && (
                <CardHeader>
                  <CardTitle className="text-3xl">{data.name}</CardTitle>
                  <CardDescription>{data.category}</CardDescription>
                </CardHeader>
              )}

              <CardContent className={!data.hero ? 'pt-2' : ''}>
                <div className="space-y-4">
                  {/* Description */}
                  <div className="prose prose-sm dark:prose-invert">
                    <p className="whitespace-pre-line">{data.description}</p>
                  </div>

                  <Separator />

                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <User className="text-muted-foreground" />
                      <span className="text-sm">Author: {data.author}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="text-muted-foreground" />
                      <span className="text-sm">Added: {format(new Date(data.remoteAddedAt), 'PPP')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="text-muted-foreground" />
                      <span className="text-sm">Updated: {format(new Date(data.remoteUpdatedAt), 'PPP')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Download className="text-muted-foreground" />
                      <span className="text-sm">Downloads: {data.downloadCount}</span>
                    </div>
                  </div>

                  {/* Tags */}
                  {data.tags && data.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center">
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

            {/* Right side - Download */}
            <div>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {!isDownloaded ? (
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleDownload}
                      disabled={isDownloading || !data.downloadable}
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
                  ) : (
                    <div className="flex flex-col gap-2">
                      {isInstalled ? (
                        <Button className="w-full" size="lg" variant="destructive" onClick={handleUninstall}>
                          Uninstall Mod
                          <Trash className="ml-2" />
                        </Button>
                      ) : (
                        <Button
                          className="w-full"
                          size="lg"
                          variant="default"
                          onClick={handleInstall}
                          disabled={isInstalling}
                        >
                          {isInstalling ? 'Installing Mod...' : 'Install Mod'}
                          <Upload className="ml-2" />
                        </Button>
                      )}

                      {localMod?.status === ModStatus.DOWNLOADED && (
                        <p className="text-sm text-muted-foreground text-center">Mod downloaded but not installed</p>
                      )}
                    </div>
                  )}

                  {/* Download Progress */}
                  {modProgress?.percentage !== undefined &&
                    modProgress.percentage > 0 &&
                    modProgress.percentage < 100 && (
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground text-center">
                          Downloading: {Math.round(modProgress.percentage)}%
                        </p>
                        <div className="w-full bg-secondary rounded-full h-2.5">
                          <div
                            className="bg-primary h-2.5 rounded-full"
                            style={{ width: `${modProgress.percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                  {/* Installation Progress */}
                  {isInstalling && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground text-center">Installing mod...</p>
                      <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse-x"></div>
                      </div>
                    </div>
                  )}

                  {localMod?.status === ModStatus.ERROR && <p className="text-destructive text-sm">Error with mod</p>}
                </div>
              </CardContent>
            </div>
          </div>

          <CardFooter className="flex flex-col items-start">
            {/* Link back to mod website */}
            {data.remoteUrl && (
              <Button variant="link" className="px-0" onClick={() => window.open(data.remoteUrl, '_blank')}>
                View original forum post
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Image Gallery */}
        {hasImages && (
          <Card>
            <CardHeader>
              <CardTitle>Gallery</CardTitle>
            </CardHeader>
            <CardContent>
              <Carousel className="w-full">
                <div className="relative">
                  <CarouselContent>
                    {data.images.map((image, index) => (
                      <CarouselItem key={index}>
                        <div className="p-1">
                          <Card className="overflow-hidden">
                            <img
                              src={image}
                              alt={`Screenshot ${index + 1}`}
                              className="aspect-video w-full object-cover"
                            />
                          </Card>
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <div className="absolute -right-12 top-1/2 -translate-y-1/2">
                    <CarouselNext />
                  </div>
                  <div className="absolute -left-12 top-1/2 -translate-y-1/2">
                    <CarouselPrevious />
                  </div>
                </div>
              </Carousel>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Mod;
