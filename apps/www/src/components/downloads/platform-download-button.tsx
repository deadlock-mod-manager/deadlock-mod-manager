import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FaApple, FaLinux, FaWindows } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { DOWNLOAD_URL } from '@/lib/constants';
import { detectOS } from '@/lib/os-detection';
import type { OSInfo, PlatformDownload } from '@/types/releases';
import { orpc } from '@/utils/orpc';

interface PlatformDownloadButtonProps {
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link';
  showVersionInfo?: boolean;
}

export const PlatformDownloadButton = ({
  size = 'lg',
  className = '',
  variant = 'default',
  showVersionInfo = false,
}: PlatformDownloadButtonProps) => {
  const [userOS, setUserOS] = useState<OSInfo | null>(null);
  const { data: releases } = useQuery(orpc.getReleases.queryOptions());

  useEffect(() => {
    setUserOS(detectOS());
  }, []);

  const getRecommendedDownload = (): PlatformDownload | null => {
    if (!userOS || userOS.os === 'unknown' || !releases?.latest) {
      return null;
    }

    const release = releases.latest;

    // Find exact match first (platform + architecture)
    const exactMatch = release.downloads.find(
      (download) =>
        download.platform === userOS.os &&
        download.architecture === userOS.architecture
    );
    if (exactMatch) {
      return exactMatch;
    }

    // Fallback to platform match with different architecture
    const platformMatch = release.downloads.find(
      (download) => download.platform === userOS.os
    );
    if (platformMatch) {
      return platformMatch;
    }

    // Fallback to universal macOS builds
    if (userOS.os === 'macos') {
      const universalMatch = release.downloads.find(
        (download) =>
          download.platform === 'macos' && download.architecture === 'universal'
      );
      if (universalMatch) {
        return universalMatch;
      }
    }

    return null;
  };

  const recommendedDownload = getRecommendedDownload();

  const getPlatformButtonText = (): string => {
    if (!userOS || userOS.os === 'unknown') {
      return 'Download';
    }

    switch (userOS.os) {
      case 'windows':
        return 'Download for Windows';
      case 'macos':
        return 'Download for macOS';
      case 'linux':
        return 'Download for Linux';
      default:
        return 'Download';
    }
  };

  const getPlatformButtonIcon = () => {
    if (!userOS || userOS.os === 'unknown') {
      return <Download className="h-4 w-4" />;
    }

    switch (userOS.os) {
      case 'windows':
        return <FaWindows className="h-4 w-4" />;
      case 'macos':
        return <FaApple className="h-4 w-4" />;
      case 'linux':
        return <FaLinux className="h-4 w-4" />;
      default:
        return <Download className="h-4 w-4" />;
    }
  };

  const getVersionInfo = (): string => {
    if (!userOS) {
      return '';
    }

    if (!releases?.latest) {
      return '';
    }

    if (!recommendedDownload) {
      return '';
    }

    const { latest } = releases;
    const archText =
      recommendedDownload.architecture === 'universal'
        ? ''
        : ` (${recommendedDownload.architecture})`;

    return `Version ${latest.version} for ${userOS.displayName}${archText}`;
  };

  return (
    <div className="flex flex-col items-center">
      <Button
        asChild
        className={`font-semibold ${className}`}
        size={size}
        variant={variant}
      >
        <a
          download={recommendedDownload ? true : undefined}
          href={recommendedDownload?.url || DOWNLOAD_URL}
          rel="noopener noreferrer"
          target={recommendedDownload ? undefined : '_blank'}
        >
          {getPlatformButtonIcon()}
          {getPlatformButtonText()}
        </a>
      </Button>

      {showVersionInfo && getVersionInfo() && (
        <p className="mt-2 text-muted-foreground text-sm">{getVersionInfo()}</p>
      )}
    </div>
  );
};
