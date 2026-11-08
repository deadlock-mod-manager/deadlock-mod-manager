import { createHash } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderError } from "@deadlock-mods/common";
import { inspectZip } from "@/hosted-sources/archive";
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

/** Mod packs are tens of MB; the cap only stops a runaway download. */
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const USER_AGENT = `deadlock-mod-manager-api/${version}`;

const snapshotKey = (id: string) => `hosted-source:${id}:snapshot`;

export type HostedSourceRefreshOutcome = "unchanged" | "updated" | "failed";

interface ArchiveValidators {
  etag: string | null;
  lastModified: string | null;
}

const sameArchive = (
  stored: HostedSourceSnapshot,
  current: ArchiveValidators,
) =>
  current.etag
    ? stored.etag === current.etag
    : current.lastModified !== null &&
      stored.lastModified === current.lastModified;

const validatorsOf = (response: Response): ArchiveValidators => ({
  etag: response.headers.get("etag"),
  lastModified: response.headers.get("last-modified"),
});

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
    const parsed = hostedSourceSnapshotSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      logger
        .withMetadata({ id, issues: parsed.error.issues })
        .warn("Ignoring a stored hosted source snapshot that no longer parses");
      return null;
    }
    return parsed.data;
  }

  isEnabled(definition: HostedSourceDefinition): Promise<boolean> {
    return FeatureFlagsServiceSingleton.getInstance()
      .isFeatureEnabled(definition.flag)
      .unwrapOr(false);
  }

  listingStates(): Promise<HostedListingState[]> {
    return Promise.all(
      hostedSourceDefinitions.map(async (definition) => ({
        definition,
        enabled: await this.isEnabled(definition),
        snapshot: await this.getSnapshot(definition.id),
      })),
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
      if (head?.ok && sameArchive(stored, validatorsOf(head))) {
        return "unchanged";
      }
    }

    const workDir = await mkdtemp(join(tmpdir(), "hosted-source-"));
    try {
      const archivePath = join(workDir, "archive.zip");
      const download = await this.download(definition, archivePath);
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
      // Throws when the archive no longer fits the definition.
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

  /** Streams the archive to disk, hashing it on the way. */
  private async download(
    definition: HostedSourceDefinition,
    target: string,
  ): Promise<ArchiveValidators & { sha256: string; size: number }> {
    const origin = new URL(definition.archiveUrl).origin;
    const response = await fetch(definition.archiveUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok || !response.body) {
      throw new ProviderError(
        `${definition.archiveUrl} returned HTTP ${response.status}`,
      );
    }
    // The desktop only follows redirects within the declared download origin.
    if (new URL(response.url).origin !== origin) {
      throw new ProviderError(
        `${definition.archiveUrl} redirected outside ${origin}`,
      );
    }
    if (Number(response.headers.get("content-length")) > MAX_ARCHIVE_BYTES) {
      throw new ProviderError(`${definition.archiveUrl} is too large`);
    }

    const hash = createHash("sha256");
    const file = createWriteStream(target);
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > MAX_ARCHIVE_BYTES) {
          throw new ProviderError(`${definition.archiveUrl} is too large`);
        }
        hash.update(chunk);
        if (!file.write(chunk)) await once(file, "drain");
      }
    } finally {
      file.end();
      await once(file, "close");
    }
    return { ...validatorsOf(response), sha256: hash.digest("hex"), size };
  }
}
