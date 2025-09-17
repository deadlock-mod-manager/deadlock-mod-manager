export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  assets: GitHubAsset[];
  draft: boolean;
  prerelease: boolean;
}

export interface GitHubAsset {
  name: string;
  download_count: number;
  browser_download_url: string;
  size: number;
  content_type: string;
}

export interface PlatformDownload {
  platform: 'windows' | 'macos' | 'linux';
  architecture: 'x64' | 'arm64' | 'universal';
  url: string;
  filename: string;
  size: number;
  downloadCount: number;
}

export interface ReleasesResponse {
  latest: {
    version: string;
    name: string;
    releaseNotes: string;
    publishedAt: string;
    downloads: PlatformDownload[];
  };
  allVersions: {
    version: string;
    name: string;
    publishedAt: string;
    prerelease: boolean;
    downloads: PlatformDownload[];
  }[];
}
