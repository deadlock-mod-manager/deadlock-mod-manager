import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@deadlock-mods/ui/components/accordion";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Download } from "@deadlock-mods/ui/icons";
import { FaApple, FaLinux, FaWindows } from "react-icons/fa";
import { formatFileSize } from "@/lib/os-detection";
import type { PlatformDownload, Release } from "@/types/releases";

interface VersionAccordionProps {
  releases: Release[];
}

const PlatformColumn = ({
  title,
  icon,
  downloads,
}: {
  title: string;
  icon: React.ReactNode;
  downloads: PlatformDownload[];
}) => (
  <div className='rounded-lg border bg-card p-4'>
    <div className='mb-4 flex items-center gap-2'>
      {icon}
      <h4 className='font-semibold'>{title}</h4>
    </div>
    <div className='space-y-2'>
      {downloads.length === 0 ? (
        <p className='text-muted-foreground text-sm'>No downloads available</p>
      ) : (
        downloads.map((download) => (
          <div
            className='flex items-center justify-between rounded-md border border-border/50 p-3 hover:bg-muted/50'
            key={`${download.platform}-${download.architecture}-${download.filename}`}>
            <div>
              <div className='font-medium text-sm'>
                {getDownloadDisplayName(download)}
              </div>
              <div className='text-muted-foreground text-xs'>
                {formatFileSize(download.size)}
              </div>
            </div>
            <Button asChild size='sm' variant='ghost'>
              <a download href={download.url}>
                <Download className='h-4 w-4' />
              </a>
            </Button>
          </div>
        ))
      )}
    </div>
  </div>
);

const getDownloadDisplayName = (download: PlatformDownload): string => {
  const { platform, architecture, installerType, filename } = download;
  const name = filename.toLowerCase();

  if (platform === "windows") {
    if (installerType === "msi") {
      return `Windows msi (${architecture})`;
    }
    if (installerType === "sig" || name.endsWith(".sig")) {
      if (name.includes(".msi.sig")) {
        return `Windows msi sig (${architecture})`;
      }
      return `Windows exe sig (${architecture})`;
    }
    if (!installerType && name.includes(".msi")) {
      return `Windows msi (${architecture})`;
    }
    return `Windows exe (${architecture})`;
  }

  if (platform === "macos") {
    if (architecture === "universal") {
      return "Mac Universal";
    }
    if (architecture === "arm64") {
      return "Mac (ARM64)";
    }
    return "Mac (x64)";
  }

  if (platform === "linux") {
    if (name.endsWith(".deb.sig")) {
      return `Linux .deb sig (${architecture})`;
    }
    if (name.endsWith(".rpm.sig")) {
      return `Linux RPM sig (${architecture})`;
    }
    if (name.endsWith(".appimage.sig")) {
      return `Linux AppImage sig (${architecture})`;
    }
    if (installerType === "deb" || name.includes(".deb")) {
      return `Linux .deb (${architecture})`;
    }
    if (installerType === "rpm" || name.includes(".rpm")) {
      return `Linux RPM (${architecture})`;
    }
    if (installerType === "appimage" || name.includes(".appimage")) {
      return `Linux AppImage (${architecture})`;
    }
    return `Linux (${architecture})`;
  }

  return filename;
};

const groupDownloadsByPlatform = (downloads: PlatformDownload[]) => {
  const grouped = {
    macos: downloads.filter((d) => d.platform === "macos"),
    windows: downloads.filter((d) => d.platform === "windows"),
    linux: downloads.filter((d) => d.platform === "linux"),
  };

  return grouped;
};

export const VersionAccordion = ({ releases }: VersionAccordionProps) => {
  return (
    <div className='container mx-auto flex max-w-6xl flex-col gap-8 py-12'>
      <div className=''>
        <h2 className='font-bold text-2xl'>All Versions</h2>
      </div>

      <Accordion className='space-y-4' type='multiple'>
        {releases
          .filter((release) => !release.prerelease)
          .map((release, index) => {
            const platformGroups = groupDownloadsByPlatform(release.downloads);

            return (
              <AccordionItem
                className='rounded-lg border bg-card'
                key={release.version}
                value={release.version}>
                <AccordionTrigger className='px-4 py-4 hover:bg-muted/50 hover:no-underline'>
                  <div className='flex items-center gap-3'>
                    <span className='font-bold text-xl'>{release.version}</span>
                    {index === 0 && (
                      <Badge className='text-xs' variant='secondary'>
                        LATEST VERSION
                      </Badge>
                    )}
                    {release.prerelease && (
                      <Badge className='text-xs' variant='outline'>
                        Pre-release
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>

                <AccordionContent className='px-4 pb-4 py-4'>
                  <div className='grid gap-4 md:grid-cols-3'>
                    <PlatformColumn
                      downloads={platformGroups.macos}
                      icon={<FaApple className='h-5 w-5' />}
                      title='macOS'
                    />
                    <PlatformColumn
                      downloads={platformGroups.windows}
                      icon={<FaWindows className='h-5 w-5' />}
                      title='Windows'
                    />
                    <PlatformColumn
                      downloads={platformGroups.linux}
                      icon={<FaLinux className='h-5 w-5' />}
                      title='Linux'
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
      </Accordion>
      <div className=''>
        <h2 className='font-bold text-2xl'>Pre-release Versions</h2>
      </div>
      <Accordion className='space-y-4' type='multiple'>
        {releases
          .filter((release) => release.prerelease)
          .slice(0, 5)
          .map((release, index) => {
            const platformGroups = groupDownloadsByPlatform(release.downloads);

            return (
              <AccordionItem
                className='rounded-lg border bg-card'
                key={release.version}
                value={release.version}>
                <AccordionTrigger className='px-4 py-4 hover:bg-muted/50 hover:no-underline'>
                  <div className='flex items-center gap-3'>
                    <span className='font-bold text-xl'>{release.version}</span>
                    {index === 0 && (
                      <Badge className='text-xs' variant='secondary'>
                        LATEST VERSION
                      </Badge>
                    )}
                    {release.prerelease && (
                      <Badge className='text-xs' variant='outline'>
                        Pre-release
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>

                <AccordionContent className='px-4 pb-4'>
                  <div className='grid gap-4 md:grid-cols-3'>
                    <PlatformColumn
                      downloads={platformGroups.macos}
                      icon={<FaApple className='h-5 w-5' />}
                      title='macOS'
                    />
                    <PlatformColumn
                      downloads={platformGroups.windows}
                      icon={<FaWindows className='h-5 w-5' />}
                      title='Windows'
                    />
                    <PlatformColumn
                      downloads={platformGroups.linux}
                      icon={<FaLinux className='h-5 w-5' />}
                      title='Linux'
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
      </Accordion>
    </div>
  );
};
