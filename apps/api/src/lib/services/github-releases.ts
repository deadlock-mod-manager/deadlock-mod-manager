import type {
  GitHubRelease,
  PlatformDownload,
  ReleasesResponse,
} from "../../types/github-releases";
import { logger as mainLogger } from "../logger";

const logger = mainLogger.child().withContext({
  service: "github-releases",
});

const GITHUB_API_BASE = "https://api.github.com";
const REPO_OWNER = "deadlock-mod-manager";
const REPO_NAME = "deadlock-mod-manager";
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes in milliseconds

interface CacheEntry {
  data: ReleasesResponse;
  timestamp: number;
}

export class GitHubReleasesService {
  private static instance: GitHubReleasesService;
  private cache: CacheEntry | null = null;

  static getInstance(): GitHubReleasesService {
    if (!GitHubReleasesService.instance) {
      GitHubReleasesService.instance = new GitHubReleasesService();
    }
    return GitHubReleasesService.instance;
  }

  private isCacheValid(): boolean {
    if (!this.cache) {
      return false;
    }
    return Date.now() - this.cache.timestamp < CACHE_TTL;
  }

  private parsePlatformFromFilename(filename: string): {
    platform: "windows" | "macos" | "linux";
    architecture: "x64" | "arm64" | "universal";
  } | null {
    const name = filename.toLowerCase();

    // Windows patterns
    if (
      name.includes(".exe") ||
      name.includes("windows") ||
      name.includes("win32") ||
      name.includes("win64")
    ) {
      const arch = name.includes("arm64") ? "arm64" : "x64";
      return { platform: "windows", architecture: arch };
    }

    // macOS patterns
    if (
      name.includes(".dmg") ||
      name.includes("macos") ||
      name.includes("darwin")
    ) {
      const arch = name.includes("arm64")
        ? "arm64"
        : name.includes("x64") || name.includes("x86_64")
          ? "x64"
          : "universal";
      return { platform: "macos", architecture: arch };
    }

    // Linux patterns
    if (
      name.includes(".appimage") ||
      name.includes(".deb") ||
      name.includes(".rpm") ||
      name.includes("linux")
    ) {
      const arch =
        name.includes("arm64") || name.includes("aarch64") ? "arm64" : "x64";
      return { platform: "linux", architecture: arch };
    }

    return null;
  }

  private transformRelease(release: GitHubRelease): {
    version: string;
    name: string;
    releaseNotes: string;
    publishedAt: string;
    downloads: PlatformDownload[];
    prerelease: boolean;
  } {
    const downloads: PlatformDownload[] = [];

    for (const asset of release.assets) {
      const platformInfo = this.parsePlatformFromFilename(asset.name);
      if (platformInfo) {
        downloads.push({
          platform: platformInfo.platform,
          architecture: platformInfo.architecture,
          url: asset.browser_download_url,
          filename: asset.name,
          size: asset.size,
          downloadCount: asset.download_count,
        });
      }
    }

    return {
      version: release.tag_name.replace(/^v/, ""), // Remove 'v' prefix if present
      name: release.name,
      releaseNotes: release.body,
      publishedAt: release.published_at,
      downloads,
      prerelease: release.prerelease,
    };
  }

  async fetchReleases(): Promise<ReleasesResponse> {
    if (this.isCacheValid() && this.cache) {
      logger.debug("Returning cached GitHub releases data");
      return this.cache.data;
    }

    try {
      logger.info("Fetching releases from GitHub API");

      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/releases`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "deadlock-modmanager-api",
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `GitHub API responded with status ${response.status}: ${response.statusText}`,
        );
      }

      const releases: GitHubRelease[] = await response.json();

      if (!releases || releases.length === 0) {
        throw new Error("No releases found");
      }

      // Filter out drafts and sort by published date
      const publishedReleases = releases
        .filter((release) => !release.draft)
        .sort(
          (a, b) =>
            new Date(b.published_at).getTime() -
            new Date(a.published_at).getTime(),
        );

      if (publishedReleases.length === 0) {
        throw new Error("No published releases found");
      }

      // Find the latest stable release (non-prerelease)
      const latestStable = publishedReleases.find(
        (release) => !release.prerelease,
      );
      const latest = latestStable || publishedReleases[0]; // Fallback to the latest release if no stable found

      const transformedLatest = this.transformRelease(latest);
      const allVersions = publishedReleases.slice(0, 10).map((release) => ({
        ...this.transformRelease(release),
      }));

      const result: ReleasesResponse = {
        latest: {
          version: transformedLatest.version,
          name: transformedLatest.name,
          releaseNotes: transformedLatest.releaseNotes,
          publishedAt: transformedLatest.publishedAt,
          downloads: transformedLatest.downloads,
        },
        allVersions,
      };

      // Update cache
      this.cache = {
        data: result,
        timestamp: Date.now(),
      };

      logger.info(
        `Successfully fetched ${releases.length} releases from GitHub`,
      );
      return result;
    } catch (error) {
      logger.error(
        `Failed to fetch releases from GitHub: ${error instanceof Error ? error.message : "Unknown error"}`,
      );

      // Return cached data if available, even if expired
      if (this.cache) {
        logger.warn("Returning expired cached data due to API failure");
        return this.cache.data;
      }

      throw error;
    }
  }

  // Method to clear cache (useful for testing or forced refresh)
  clearCache(): void {
    this.cache = null;
    logger.debug("GitHub releases cache cleared");
  }
}
