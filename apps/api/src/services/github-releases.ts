import { NotFoundError, ProviderError } from "@deadlock-mods/common";
import { logger as mainLogger } from "../lib/logger";
import type { GitHubRelease, ReleasesResponse } from "../types/github-releases";
import { GitHubReleasesSchema } from "../validation/github-releases";
import { transformReleaseAssets } from "./release-asset-policy";

const logger = mainLogger.child().withContext({
  service: "github-releases",
});

const GITHUB_API_BASE = "https://api.github.com";
const REPO_OWNER = "deadlock-mod-manager";
const REPO_NAME = "deadlock-mod-manager";
const CACHE_TTL = 15 * 60 * 1000;
const RATE_LIMIT_RETRY_DELAY = 60 * 1000;

interface CacheEntry {
  data: ReleasesResponse;
  timestamp: number;
}

const transformRelease = (release: GitHubRelease) => ({
  version: release.tag_name.replace(/^v/, ""),
  name: release.name,
  releaseNotes: release.body,
  publishedAt: release.published_at,
  downloads: transformReleaseAssets(release),
  prerelease: release.prerelease,
});

export class GitHubReleasesService {
  private static instance: GitHubReleasesService;
  private cache: CacheEntry | null = null;
  private inFlight: Promise<ReleasesResponse> | null = null;
  private retryAt = 0;
  private rateLimitError: ProviderError | null = null;

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

  async fetchReleases(): Promise<ReleasesResponse> {
    if (this.isCacheValid() && this.cache) {
      logger.debug("Returning cached GitHub releases data");
      return this.cache.data;
    }

    if (this.rateLimitError && Date.now() < this.retryAt) {
      if (this.cache) return this.cache.data;
      throw this.rateLimitError;
    }

    if (this.inFlight) return this.inFlight;

    this.inFlight = this.fetchFromGitHub();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async fetchFromGitHub(): Promise<ReleasesResponse> {
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
        const error = new ProviderError(
          `GitHub API responded with status ${response.status}: ${response.statusText}`,
        );
        if (response.status === 403 || response.status === 429) {
          const now = Date.now();
          const retryAfter = response.headers.get("retry-after");
          const seconds = retryAfter === null ? NaN : Number(retryAfter);
          const retryAt = Number.isFinite(seconds)
            ? now + seconds * 1000
            : Date.parse(retryAfter ?? "");
          const resetAt =
            Number(response.headers.get("x-ratelimit-reset")) * 1000;
          const headerRetryAt = Math.max(
            Number.isFinite(retryAt) ? retryAt : 0,
            Number.isFinite(resetAt) ? resetAt : 0,
          );
          this.retryAt =
            headerRetryAt > now ? headerRetryAt : now + RATE_LIMIT_RETRY_DELAY;
          this.rateLimitError = error;
        }
        throw error;
      }

      const releases = GitHubReleasesSchema.parse(await response.json());

      if (!releases || releases.length === 0) {
        throw new NotFoundError("No releases found");
      }

      const publishedReleases = releases
        .filter((release) => !release.draft)
        .sort(
          (left, right) =>
            new Date(right.published_at).getTime() -
            new Date(left.published_at).getTime(),
        );

      if (publishedReleases.length === 0) {
        throw new NotFoundError("No published releases found");
      }

      const latestStable = publishedReleases.find(
        (release) => !release.prerelease,
      );
      const latest = latestStable || publishedReleases[0];

      const transformedLatest = transformRelease(latest);
      const allVersions = publishedReleases.slice(0, 10).map(transformRelease);

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

      this.rateLimitError = null;
      this.retryAt = 0;
      this.cache = {
        data: result,
        timestamp: Date.now(),
      };

      logger
        .withMetadata({ releaseCount: releases.length })
        .info("Fetched releases from GitHub");
      return result;
    } catch (error) {
      logger.withError(error).error("Failed to fetch releases from GitHub");

      if (this.cache) {
        logger.warn("Returning expired cached data due to API failure");
        return this.cache.data;
      }

      throw error;
    }
  }

  clearCache(): void {
    this.cache = null;
    logger.debug("GitHub releases cache cleared");
  }
}
