import type {
  DetectedArchitecture,
  DetectedOS,
  PlatformDownload,
} from "@/types/releases";

const getInstallerPriority = (download: PlatformDownload): number => {
  if (download.platform === "windows") {
    return download.installerType === "exe" ? 0 : 1;
  }

  if (download.platform === "linux") {
    switch (download.installerType) {
      case "flatpak":
        return 0;
      case "deb":
        return 1;
      case "rpm":
        return 2;
      default:
        return 3;
    }
  }

  return 0;
};

export const getDownloadDescription = (download: PlatformDownload): string => {
  if (download.installerType === "sig") {
    return "Updater signature, not an installer";
  }

  switch (download.installerType) {
    case "flatpak":
      return "Sandboxed bundle for most Linux systems";
    case "deb":
      return "Package for Debian and Ubuntu";
    case "rpm":
      return "Package for Fedora, RHEL, and openSUSE";
    case "exe":
      return "Windows installer";
    case "msi":
      return "Windows Installer package";
    case "dmg":
      return "macOS disk image";
    default:
      return "Download package";
  }
};

export const getRuntimeName = (download: PlatformDownload): "Wry" | "CEF" =>
  download.runtime === "cef" ? "CEF" : "Wry";

export const getRuntimeStatus = (
  download: PlatformDownload,
): "Recommended" | "Experimental" =>
  download.runtime === "cef" ? "Experimental" : "Recommended";

export const isNightlyDownload = (download: PlatformDownload): boolean =>
  /(?:^|[.-])nightly(?:[.-]|$)/i.test(download.filename);

export const selectExactDownload = (
  downloads: PlatformDownload[],
  platform: PlatformDownload["platform"],
  architecture: PlatformDownload["architecture"],
  runtime: PlatformDownload["runtime"],
  installerType: NonNullable<PlatformDownload["installerType"]>,
): PlatformDownload | null =>
  downloads.find(
    (download) =>
      download.platform === platform &&
      download.architecture === architecture &&
      download.runtime === runtime &&
      download.installerType === installerType,
  ) ?? null;

export const selectRecommendedDownload = (
  downloads: PlatformDownload[],
  os: DetectedOS,
  architecture: DetectedArchitecture,
): PlatformDownload | null => {
  if (os === "unknown") {
    return null;
  }

  const eligibleDownloads = downloads
    .filter(
      (download) =>
        download.runtime === "wry" &&
        download.platform === os &&
        download.installerType !== "sig",
    )
    .sort(
      (left, right) => getInstallerPriority(left) - getInstallerPriority(right),
    );

  if (architecture !== "unknown") {
    const exactArchitecture = eligibleDownloads.find(
      (download) => download.architecture === architecture,
    );
    if (exactArchitecture) {
      return exactArchitecture;
    }
  }

  if (os === "macos") {
    const universalDownload = eligibleDownloads.find(
      (download) => download.architecture === "universal",
    );
    if (universalDownload) {
      return universalDownload;
    }
  }

  return eligibleDownloads[0] ?? null;
};
