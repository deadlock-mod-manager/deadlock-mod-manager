import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadArchive, inspectZip } from "@/hosted-sources/archive";
import { hostedSourceDefinitions } from "@/hosted-sources/definitions";
import {
  buildInstallation,
  type HostedListingState,
} from "@/hosted-sources/documents";
import { parsePakList } from "@/hosted-sources/pak-list";
import {
  type HostedSourceDefinition,
  type HostedSourceSnapshot,
  hostedSourceSnapshotSchema,
} from "@/hosted-sources/types";
import { logger as mainLogger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { version } from "@/version";
import { FeatureFlagsServiceSingleton } from "./feature-flags";

const logger = mainLogger.child().withContext({
  service: "hosted-sources",
});

const USER_AGENT = `deadlock-mod-manager-api/${version}`;

const snapshotKey = (id: string) => `hosted-source:${id}:snapshot`;

export type HostedSourceRefreshOutcome = "unchanged" | "updated" | "failed";

const sameArchive = (stored: HostedSourceSnapshot, headers: Headers) => {
  const etag = headers.get("etag");
  const lastModified = headers.get("last-modified");
  return etag
    ? stored.etag === etag
    : lastModified !== null && stored.lastModified === lastModified;
};

/**
 * Watches the archives of hosted sources. The worker refreshes snapshots;
 * API processes only read them, so a failed refresh keeps serving the last
 * good one.
 */
export class HostedSourcesService {
  private static instance: HostedSourcesService | null = null;

  static getInstance(): HostedSourcesService {
    HostedSourcesService.instance ??= new HostedSourcesService();
    return HostedSourcesService.instance;
  }

  async getSnapshot(id: string): Promise<HostedSourceSnapshot | null> {
    const raw = await redis.get(snapshotKey(id));
    if (!raw) return null;
    try {
      return hostedSourceSnapshotSchema.parse(JSON.parse(raw));
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ id })
        .warn("Ignoring an invalid hosted source snapshot");
      return null;
    }
  }

  isEnabled(definition: HostedSourceDefinition): Promise<boolean> {
    return FeatureFlagsServiceSingleton.getInstance()
      .isFeatureEnabled(definition.flag)
      .unwrapOr(false);
  }

  listingStates(): Promise<HostedListingState[]> {
    return Promise.all(
      hostedSourceDefinitions.map(async (definition) => {
        const [enabled, snapshot] = await Promise.all([
          this.isEnabled(definition),
          this.getSnapshot(definition.id),
        ]);
        return { definition, enabled, snapshot };
      }),
    );
  }

  async refreshAll(): Promise<Record<string, HostedSourceRefreshOutcome>> {
    const outcomes: Record<string, HostedSourceRefreshOutcome> = {};
    for (const definition of hostedSourceDefinitions) {
      try {
        outcomes[definition.id] = await this.refresh(definition);
      } catch (error) {
        logger
          .withError(error)
          .withMetadata({ id: definition.id, url: definition.archiveUrl })
          .warn("Hosted source refresh failed; keeping the last snapshot");
        outcomes[definition.id] = "failed";
      }
    }
    return outcomes;
  }

  async refresh(
    definition: HostedSourceDefinition,
  ): Promise<HostedSourceRefreshOutcome> {
    const stored = await this.getSnapshot(definition.id);
    if (stored) {
      const head = await fetch(definition.archiveUrl, {
        method: "HEAD",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      }).catch(() => null);
      if (head?.ok && sameArchive(stored, head.headers)) {
        return "unchanged";
      }
    }

    const workDir = await mkdtemp(join(tmpdir(), "hosted-source-"));
    try {
      const archivePath = join(workDir, "archive.zip");
      const download = await downloadArchive({
        url: definition.archiveUrl,
        target: archivePath,
        userAgent: USER_AGENT,
      });
      const contents = await inspectZip(
        archivePath,
        definition.labelFiles ?? [],
      );
      const labels: Record<string, string> = {};
      for (const [path, text] of Object.entries(contents.texts)) {
        Object.assign(labels, parsePakList(path, text));
      }
      const snapshot: HostedSourceSnapshot = {
        ...download,
        vpkPaths: contents.vpkPaths,
        labels,
        fetchedAt: new Date().toISOString(),
      };
      buildInstallation(definition, snapshot);
      await redis.set(snapshotKey(definition.id), JSON.stringify(snapshot));
      logger
        .withMetadata({
          id: definition.id,
          sha256: snapshot.sha256,
          size: snapshot.size,
          vpks: snapshot.vpkPaths.length,
        })
        .info("Hosted source snapshot updated");
      return "updated";
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}
