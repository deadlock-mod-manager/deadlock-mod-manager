import { z } from "zod";
import { logger as mainLogger } from "../lib/logger";

const logger = mainLogger.child().withContext({
  service: "desktop-updates",
});

// Kaspersky flags desktop processes that poll GitHub release downloads
// (NetTool.GitHubGetRepo.HTTP.C&C), so the app checks for updates through the
// API. Installers still download straight from GitHub, once per update.
const RELEASES_URL =
  "https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases";

const MANIFEST_TTL = 5 * 60 * 1000;
const UPSTREAM_TIMEOUT = 10 * 1000;

export const UPDATE_CHANNELS = ["stable", "nightly"] as const;
export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];
export const UPDATE_MANIFESTS = ["latest.json", "latest-cef.json"] as const;
export type UpdateManifestName = (typeof UPDATE_MANIFESTS)[number];

const CHANNEL_PATHS = {
  stable: "latest/download",
  nightly: "download/nightly",
} satisfies Record<UpdateChannel, string>;

const UpdateManifestSchema = z
  .object({
    version: z.string(),
    platforms: z.record(
      z.string(),
      z.object({ signature: z.string(), url: z.string() }).passthrough(),
    ),
  })
  .passthrough();
type UpdateManifest = z.infer<typeof UpdateManifestSchema>;

interface CacheEntry {
  manifest: UpdateManifest;
  timestamp: number;
}

export class DesktopUpdatesService {
  private static instance: DesktopUpdatesService;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<UpdateManifest>>();

  static getInstance(): DesktopUpdatesService {
    if (!DesktopUpdatesService.instance) {
      DesktopUpdatesService.instance = new DesktopUpdatesService();
    }
    return DesktopUpdatesService.instance;
  }

  async getManifest(
    channel: UpdateChannel,
    name: UpdateManifestName,
  ): Promise<UpdateManifest> {
    const key = `${channel}/${name}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < MANIFEST_TTL) {
      return cached.manifest;
    }

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = this.fetchManifest(channel, name).finally(() =>
      this.inFlight.delete(key),
    );
    this.inFlight.set(key, request);
    return request;
  }

  private async fetchManifest(
    channel: UpdateChannel,
    name: UpdateManifestName,
  ): Promise<UpdateManifest> {
    const key = `${channel}/${name}`;
    try {
      const response = await fetch(
        `${RELEASES_URL}/${CHANNEL_PATHS[channel]}/${name}`,
        { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT) },
      );
      if (!response.ok) {
        throw new Error(`GitHub responded with status ${response.status}`);
      }
      const manifest = UpdateManifestSchema.parse(await response.json());
      this.cache.set(key, { manifest, timestamp: Date.now() });
      return manifest;
    } catch (error) {
      const stale = this.cache.get(key);
      logger
        .withMetadata({ channel, name, servedStale: Boolean(stale) })
        .withError(error)
        .warn("Failed to fetch updater manifest from GitHub");
      if (stale) return stale.manifest;
      throw error;
    }
  }
}
