import { GITHUB_REPO } from "@/lib/constants";
import type {
  DetectedArchitecture,
  DetectedOS,
  PlatformDownload,
} from "@/types/releases";

const getInstallerPriority = (download: PlatformDownload): number => {
  if (download.platform === "windows") {
    switch (download.installerType) {
      case "exe":
        return 0;
      case "msi":
        return 1;
      default:
        return 2;
    }
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

export const getDownloadRuntime = (download: PlatformDownload): "wry" | "cef" =>
  download.runtime ??
  (/(?:^|[._-])cef(?:[._-]|$)/i.test(download.filename) ? "cef" : "wry");

// The system webview (WebKitGTK) renders poorly on many Linux setups, so Linux
// defaults to the bundled Chromium (CEF) build. Other platforms keep Wry.
const getPreferredRuntime = (
  platform: PlatformDownload["platform"],
): "wry" | "cef" => (platform === "linux" ? "cef" : "wry");

export const getRuntimeName = (download: PlatformDownload): "Wry" | "CEF" =>
  getDownloadRuntime(download) === "cef" ? "CEF" : "Wry";

export const getRuntimeStatus = (
  download: PlatformDownload,
): "Recommended" | "Alternative" =>
  getDownloadRuntime(download) === getPreferredRuntime(download.platform)
    ? "Recommended"
    : "Alternative";

// Preferred runtime first. A Linux release without CEF builds falls back to
// Wry; CEF is never picked where Wry is preferred.
const getRuntimeRank = (download: PlatformDownload): number => {
  const preferred = getPreferredRuntime(download.platform);
  const runtime = getDownloadRuntime(download);
  if (runtime === preferred) return 0;
  return runtime === "wry" ? 1 : Number.POSITIVE_INFINITY;
};

const compareDownloads = (
  left: PlatformDownload,
  right: PlatformDownload,
): number =>
  getRuntimeRank(left) - getRuntimeRank(right) ||
  getInstallerPriority(left) - getInstallerPriority(right);

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
        download.platform === os &&
        download.installerType !== "sig" &&
        Number.isFinite(getRuntimeRank(download)),
    )
    .sort(compareDownloads);

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

const isSignatureFile = (download: PlatformDownload): boolean =>
  download.installerType === "sig" ||
  download.filename.toLowerCase().endsWith(".sig");

export const findSignatureFor = (
  downloads: PlatformDownload[],
  download: PlatformDownload,
): PlatformDownload | null =>
  downloads.find(
    (candidate) => candidate.filename === `${download.filename}.sig`,
  ) ?? null;

interface PlatformInstallers {
  primary: PlatformDownload[];
  alternative: PlatformDownload[];
}

// Installers in the platform's preferred runtime come first; the first primary
// installer is the recommended default. Signatures are excluded.
export const getPlatformInstallers = (
  downloads: PlatformDownload[],
  platform: PlatformDownload["platform"],
): PlatformInstallers => {
  const installers = downloads
    .filter(
      (download) =>
        download.platform === platform && !isSignatureFile(download),
    )
    .sort(compareDownloads);
  // Fall back to Wry (rank 1) when there is no preferred-runtime installer.
  const bestRank = installers.some((download) => getRuntimeRank(download) === 0)
    ? 0
    : 1;

  return {
    primary: installers.filter(
      (download) => getRuntimeRank(download) === bestRank,
    ),
    alternative: installers.filter(
      (download) => getRuntimeRank(download) !== bestRank,
    ),
  };
};

export const getReleaseUrl = (version: string): string =>
  `${GITHUB_REPO}/releases/tag/${/^\d/.test(version) ? `v${version}` : version}`;
