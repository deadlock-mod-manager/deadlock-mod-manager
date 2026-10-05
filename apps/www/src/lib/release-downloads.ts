import { GITHUB_REPO } from "@/lib/constants";
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

export const getDownloadRuntime = (download: PlatformDownload): "wry" | "cef" =>
  download.runtime ??
  (/(?:^|[._-])cef(?:[._-]|$)/i.test(download.filename) ? "cef" : "wry");

export const getRuntimeName = (download: PlatformDownload): "Wry" | "CEF" =>
  getDownloadRuntime(download) === "cef" ? "CEF" : "Wry";

export const getRuntimeStatus = (
  download: PlatformDownload,
): "Recommended" | "Experimental" =>
  getDownloadRuntime(download) === "cef" ? "Experimental" : "Recommended";

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
        getDownloadRuntime(download) === "wry" &&
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

interface InstallerInfo {
  label: string;
  description: string;
}

const INSTALLER_INFO = {
  exe: { label: "Installer", description: "Windows 10 and 11 setup (.exe)" },
  msi: {
    label: "MSI package",
    description: "For managed or silent installs (.msi)",
  },
  dmg: { label: "Disk image", description: "macOS application (.dmg)" },
  flatpak: { label: "Flatpak", description: "Works on most distributions" },
  deb: { label: "Debian package", description: "Ubuntu, Debian, Mint (.deb)" },
  rpm: { label: "RPM package", description: "Fedora, openSUSE, Nobara (.rpm)" },
} satisfies Record<
  Exclude<NonNullable<PlatformDownload["installerType"]>, "sig">,
  InstallerInfo
>;

export const getInstallerInfo = (download: PlatformDownload): InstallerInfo =>
  download.installerType && download.installerType !== "sig"
    ? INSTALLER_INFO[download.installerType]
    : { label: download.filename, description: "" };

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
  standard: PlatformDownload[];
  experimental: PlatformDownload[];
}

// First standard installer is the recommended default; signatures are excluded.
export const getPlatformInstallers = (
  downloads: PlatformDownload[],
  platform: PlatformDownload["platform"],
): PlatformInstallers => {
  const installers = downloads
    .filter(
      (download) =>
        download.platform === platform && !isSignatureFile(download),
    )
    .sort(
      (left, right) => getInstallerPriority(left) - getInstallerPriority(right),
    );

  return {
    standard: installers.filter(
      (download) => getDownloadRuntime(download) === "wry",
    ),
    experimental: installers.filter(
      (download) => getDownloadRuntime(download) === "cef",
    ),
  };
};

export const getReleaseUrl = (version: string): string =>
  `${GITHUB_REPO}/releases/tag/${/^\d/.test(version) ? `v${version}` : version}`;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * "October 5, 2026", always in UTC. Formatting in the visitor's timezone would
 * make the server and the browser disagree on the date and break hydration.
 */
export const formatReleaseDate = (iso: string): string => {
  const date = new Date(iso);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
};

/** "October 5, 2026, 14:03 UTC", for tooltips. */
export const formatReleaseDateTime = (iso: string): string => {
  const date = new Date(iso);
  const time = [date.getUTCHours(), date.getUTCMinutes()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
  return `${formatReleaseDate(iso)}, ${time} UTC`;
};
