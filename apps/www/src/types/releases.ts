export interface PlatformDownload {
  platform: "windows" | "macos" | "linux";
  architecture: "x64" | "arm64" | "universal";
  installerType?: "exe" | "msi" | "dmg" | "deb" | "rpm" | "appimage" | "sig";
  url: string;
  filename: string;
  size: number;
  downloadCount: number;
}

export interface Release {
  version: string;
  name: string;
  releaseNotes?: string;
  publishedAt: string;
  downloads: PlatformDownload[];
  prerelease?: boolean;
}

export interface ReleasesResponse {
  latest: Release;
  allVersions: Release[];
}

export type DetectedOS = "windows" | "macos" | "linux" | "unknown";
export type DetectedArchitecture = "x64" | "arm64" | "unknown";

export interface OSInfo {
  os: DetectedOS;
  architecture: DetectedArchitecture;
  displayName: string;
}
