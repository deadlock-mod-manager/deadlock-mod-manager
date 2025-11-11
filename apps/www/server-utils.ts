import path from "node:path";
import { env } from "./env";
import { logger } from "./logger";

export interface AssetMetadata {
  route: string;
  size: number;
  type: string;
}

export interface InMemoryAsset {
  raw: Uint8Array;
  gz?: Uint8Array;
  etag?: string;
  type: string;
  immutable: boolean;
  size: number;
}

export interface PreloadResult {
  routes: Record<string, (req: Request) => Response | Promise<Response>>;
  loaded: AssetMetadata[];
  skipped: AssetMetadata[];
}

export function convertGlobToRegExp(globPattern: string): RegExp {
  const escapedPattern = globPattern
    .replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escapedPattern}$`, "i");
}

export function computeEtag(data: Uint8Array): string {
  const hash = Bun.hash(data);
  return `W/"${hash.toString(16)}-${data.byteLength.toString()}"`;
}

export function isMimeTypeCompressible(mimeType: string): boolean {
  return env.ASSET_PRELOAD_GZIP_MIME_TYPES.some((type) =>
    type.endsWith("/") ? mimeType.startsWith(type) : mimeType === type,
  );
}

export function compressDataIfAppropriate(
  data: Uint8Array,
  mimeType: string,
): Uint8Array | undefined {
  if (!env.ASSET_PRELOAD_ENABLE_GZIP) return undefined;
  if (data.byteLength < env.ASSET_PRELOAD_GZIP_MIN_SIZE) return undefined;
  if (!isMimeTypeCompressible(mimeType)) return undefined;
  try {
    return Bun.gzipSync(data.buffer as ArrayBuffer);
  } catch {
    return undefined;
  }
}

export function createResponseHandler(
  asset: InMemoryAsset,
): (req: Request) => Response {
  return (req: Request) => {
    const headers: Record<string, string> = {
      "Content-Type": asset.type,
      "Cache-Control": asset.immutable
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600",
    };

    if (env.ASSET_PRELOAD_ENABLE_ETAG && asset.etag) {
      const ifNone = req.headers.get("if-none-match");
      if (ifNone && ifNone === asset.etag) {
        return new Response(null, {
          status: 304,
          headers: { ETag: asset.etag },
        });
      }
      headers.ETag = asset.etag;
    }

    if (
      env.ASSET_PRELOAD_ENABLE_GZIP &&
      asset.gz &&
      req.headers.get("accept-encoding")?.includes("gzip")
    ) {
      headers["Content-Encoding"] = "gzip";
      headers["Content-Length"] = String(asset.gz.byteLength);
      const gzCopy = new Uint8Array(asset.gz);
      return new Response(gzCopy, { status: 200, headers });
    }

    headers["Content-Length"] = String(asset.raw.byteLength);
    const rawCopy = new Uint8Array(asset.raw);
    return new Response(rawCopy, { status: 200, headers });
  };
}

export function createCompositeGlobPattern(): Bun.Glob {
  const raw = env.ASSET_PRELOAD_INCLUDE_PATTERNS;
  if (raw.length === 0) return new Bun.Glob("**/*");
  if (raw.length === 1) return new Bun.Glob(raw[0]);
  return new Bun.Glob(`{${raw.join(",")}}`);
}

export function isFileEligibleForPreloading(
  relativePath: string,
  includePatterns: RegExp[],
  excludePatterns: RegExp[],
): boolean {
  const fileName = relativePath.split(/[/\\]/).pop() ?? relativePath;

  if (includePatterns.length > 0) {
    if (!includePatterns.some((pattern) => pattern.test(fileName))) {
      return false;
    }
  }

  if (excludePatterns.some((pattern) => pattern.test(fileName))) {
    return false;
  }

  return true;
}

export async function initializeStaticRoutes(
  clientDirectory: string,
  includePatterns: RegExp[],
  excludePatterns: RegExp[],
): Promise<PreloadResult> {
  const routes: Record<string, (req: Request) => Response | Promise<Response>> =
    {};
  const loaded: AssetMetadata[] = [];
  const skipped: AssetMetadata[] = [];

  logger.info(`Loading static assets from ${clientDirectory}...`);
  if (env.ASSET_PRELOAD_VERBOSE_LOGGING) {
    console.log(
      `Max preload size: ${(env.ASSET_PRELOAD_MAX_SIZE / 1024 / 1024).toFixed(2)} MB`,
    );
    if (includePatterns.length > 0) {
      console.log(
        `Include patterns: ${env.ASSET_PRELOAD_INCLUDE_PATTERNS.join(",")}`,
      );
    }
    if (excludePatterns.length > 0) {
      console.log(
        `Exclude patterns: ${env.ASSET_PRELOAD_EXCLUDE_PATTERNS.join(",")}`,
      );
    }
  }

  let totalPreloadedBytes = 0;

  try {
    const glob = createCompositeGlobPattern();
    for await (const relativePath of glob.scan({ cwd: clientDirectory })) {
      const filepath = path.join(clientDirectory, relativePath);
      const route = `/${relativePath.split(path.sep).join(path.posix.sep)}`;

      try {
        const file = Bun.file(filepath);

        if (!(await file.exists()) || file.size === 0) {
          continue;
        }

        const metadata: AssetMetadata = {
          route,
          size: file.size,
          type: file.type || "application/octet-stream",
        };

        const matchesPattern = isFileEligibleForPreloading(
          relativePath,
          includePatterns,
          excludePatterns,
        );
        const withinSizeLimit = file.size <= env.ASSET_PRELOAD_MAX_SIZE;

        if (matchesPattern && withinSizeLimit) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const gz = compressDataIfAppropriate(bytes, metadata.type);
          const etag = env.ASSET_PRELOAD_ENABLE_ETAG
            ? computeEtag(bytes)
            : undefined;
          const asset: InMemoryAsset = {
            raw: bytes,
            gz,
            etag,
            type: metadata.type,
            immutable: true,
            size: bytes.byteLength,
          };
          routes[route] = createResponseHandler(asset);

          loaded.push({ ...metadata, size: bytes.byteLength });
          totalPreloadedBytes += bytes.byteLength;
        } else {
          routes[route] = () => {
            const fileOnDemand = Bun.file(filepath);
            return new Response(fileOnDemand, {
              headers: {
                "Content-Type": metadata.type,
                "Cache-Control": "public, max-age=3600",
              },
            });
          };

          skipped.push(metadata);
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== "EISDIR") {
          logger.withError(error).error(`Failed to load ${filepath}`);
        }
      }
    }

    if (
      env.ASSET_PRELOAD_VERBOSE_LOGGING &&
      (loaded.length > 0 || skipped.length > 0)
    ) {
      logVerboseFileInfo(loaded, skipped);
    }

    logSummary(loaded, skipped, totalPreloadedBytes);
  } catch (error) {
    logger
      .withError(error as Error)
      .error(`Failed to load static files from ${clientDirectory}`);
  }

  return { routes, loaded, skipped };
}

function logVerboseFileInfo(
  loaded: AssetMetadata[],
  skipped: AssetMetadata[],
): void {
  const allFiles = [...loaded, ...skipped].sort((a, b) =>
    a.route.localeCompare(b.route),
  );

  const maxPathLength = Math.min(
    Math.max(...allFiles.map((f) => f.route.length)),
    60,
  );

  const formatFileSize = (bytes: number) => {
    const kb = bytes / 1024;
    const sizeStr = kb < 100 ? kb.toFixed(2) : kb.toFixed(1);
    const gzipKb = kb * 0.35;
    return {
      size: sizeStr,
      gzip: gzipKb < 100 ? gzipKb.toFixed(2) : gzipKb.toFixed(1),
    };
  };

  if (loaded.length > 0) {
    console.log("\n📁 Preloaded into memory:");
    console.log(
      "Path                                          │    Size │ Gzip Size",
    );
    loaded
      .sort((a, b) => a.route.localeCompare(b.route))
      .forEach((file) => {
        const { size, gzip } = formatFileSize(file.size);
        const paddedPath = file.route.padEnd(maxPathLength);
        const sizeStr = `${size.padStart(7)} kB`;
        const gzipStr = `${gzip.padStart(7)} kB`;
        console.log(`${paddedPath} │ ${sizeStr} │  ${gzipStr}`);
      });
  }

  if (skipped.length > 0) {
    console.log("\n💾 Served on-demand:");
    console.log(
      "Path                                          │    Size │ Gzip Size",
    );
    skipped
      .sort((a, b) => a.route.localeCompare(b.route))
      .forEach((file) => {
        const { size, gzip } = formatFileSize(file.size);
        const paddedPath = file.route.padEnd(maxPathLength);
        const sizeStr = `${size.padStart(7)} kB`;
        const gzipStr = `${gzip.padStart(7)} kB`;
        console.log(`${paddedPath} │ ${sizeStr} │  ${gzipStr}`);
      });
  }

  console.log("\n📊 Detailed file information:");
  console.log(
    "Status       │ Path                            │ MIME Type                    │ Reason",
  );
  allFiles.forEach((file) => {
    const isPreloaded = loaded.includes(file);
    const status = isPreloaded ? "MEMORY" : "ON-DEMAND";
    const reason =
      !isPreloaded && file.size > env.ASSET_PRELOAD_MAX_SIZE
        ? "too large"
        : !isPreloaded
          ? "filtered"
          : "preloaded";
    const route =
      file.route.length > 30 ? `${file.route.substring(0, 27)}...` : file.route;
    console.log(
      `${status.padEnd(12)} │ ${route.padEnd(30)} │ ${file.type.padEnd(28)} │ ${reason.padEnd(10)}`,
    );
  });
}

function logSummary(
  loaded: AssetMetadata[],
  skipped: AssetMetadata[],
  totalPreloadedBytes: number,
): void {
  console.log();
  if (loaded.length > 0) {
    logger.info(
      `Preloaded ${String(loaded.length)} files (${(totalPreloadedBytes / 1024 / 1024).toFixed(2)} MB) into memory`,
    );
  } else {
    logger.info("No files preloaded into memory");
  }

  if (skipped.length > 0) {
    const tooLarge = skipped.filter(
      (f) => f.size > env.ASSET_PRELOAD_MAX_SIZE,
    ).length;
    const filtered = skipped.length - tooLarge;
    logger.info(
      `${String(skipped.length)} files will be served on-demand (${String(tooLarge)} too large, ${String(filtered)} filtered)`,
    );
  }
}
