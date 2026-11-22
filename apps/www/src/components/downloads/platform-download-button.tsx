import { Button } from "@deadlock-mods/ui/components/button";
import { Download } from "@deadlock-mods/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaLinux, FaWindows } from "react-icons/fa";
import { useAnalyticsContext } from "@/components/analytics-provider";
import { DOWNLOAD_URL } from "@/lib/constants";
import { type DeviceInfo, detectOS } from "@/lib/os-detection";
import { selectRecommendedDownload } from "@/lib/release-downloads";
import type { OSInfo, PlatformDownload } from "@/types/releases";
import { orpc } from "@/utils/orpc";

interface PlatformDownloadButtonProps {
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  showVersionInfo?: boolean;
}

interface PlatformIconProps {
  os: OSInfo["os"];
}

export const PlatformIcon = ({ os }: PlatformIconProps) => {
  if (os === "unknown" || os === "macos") {
    return <Download className='h-4 w-4' />;
  }

  switch (os) {
    case "windows":
      return <FaWindows className='h-4 w-4' />;
    case "linux":
      return <FaLinux className='h-4 w-4' />;
    default:
      return <Download className='h-4 w-4' />;
  }
};

interface PlatformButtonTextProps {
  os: OSInfo["os"];
}

export const PlatformButtonText = ({ os }: PlatformButtonTextProps) => {
  const { t } = useTranslation("common");

  if (os === "unknown" || os === "macos") {
    return t("platformDownload.download");
  }

  switch (os) {
    case "windows":
      return t("platformDownload.windows");
    case "linux":
      return t("platformDownload.linux");
    default:
      return t("platformDownload.download");
  }
};

/**
 * Picks the right installer for the visitor's OS and tracks the click. Shared
 * by PlatformDownloadButton and the landing page's own download CTAs.
 *
 * The app only ships for Windows and Linux, so phones, tablets and macOS never
 * get a direct download link.
 */
export const usePlatformDownload = () => {
  const { t } = useTranslation("common");
  const [userOS, setUserOS] = useState<DeviceInfo | null>(null);
  const { data: releases } = useQuery(orpc.getReleases.queryOptions());
  const { analytics } = useAnalyticsContext();

  useEffect(() => {
    setUserOS(detectOS());
  }, []);

  // False only once detection confirms the device can't run the app. Stays
  // true on the server, before detection and on unrecognized desktops, so
  // those keep the generic download link and the markup hydrates cleanly.
  const canInstall = !(userOS?.mobile || userOS?.os === "macos");

  const recommendedDownload: PlatformDownload | null =
    canInstall && userOS && userOS.os !== "unknown" && releases?.latest
      ? selectRecommendedDownload(
          releases.latest.downloads,
          userOS.os,
          userOS.architecture,
        )
      : null;

  const versionInfo = (() => {
    if (!userOS || !releases?.latest || !recommendedDownload) return "";
    const values = {
      version: releases.latest.version,
      os: userOS.displayName,
    };
    return recommendedDownload.architecture === "universal"
      ? t("platformDownload.version", values)
      : t("platformDownload.versionWithArch", {
          ...values,
          arch: recommendedDownload.architecture,
        });
  })();

  const onClick = () => {
    if (analytics.isEnabled && recommendedDownload && releases?.latest) {
      analytics.trackDownloadStarted(
        recommendedDownload.platform,
        releases.latest.version,
        {
          architecture: recommendedDownload.architecture,
          file_size_mb: recommendedDownload.size,
        },
      );
    }
  };

  return {
    os: userOS?.os ?? "unknown",
    /** Phone or tablet the visitor is on, once detected. */
    mobile: userOS?.mobile ?? null,
    canInstall,
    versionInfo,
    linkProps: {
      download: recommendedDownload ? true : undefined,
      href: recommendedDownload?.url || DOWNLOAD_URL,
      rel: "noopener noreferrer",
      target: recommendedDownload ? undefined : "_blank",
      onClick,
    },
  };
};

export const PlatformDownloadButton = ({
  size = "lg",
  className = "",
  variant = "default",
  showVersionInfo = false,
}: PlatformDownloadButtonProps) => {
  const { t } = useTranslation("common");
  const { os, canInstall, versionInfo, linkProps } = usePlatformDownload();
  const note = canInstall ? versionInfo : t("platformDownload.available");

  return (
    <div className='flex flex-col items-center'>
      <Button
        asChild
        className={`font-semibold ${className}`}
        size={size}
        variant={variant}>
        <a {...linkProps}>
          <PlatformIcon os={os} />
          <PlatformButtonText os={os} />
        </a>
      </Button>

      {showVersionInfo && note && (
        <p className='mt-2 text-muted-foreground text-sm'>{note}</p>
      )}
    </div>
  );
};
