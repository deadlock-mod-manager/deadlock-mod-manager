import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ExtractionError, ProviderError } from "@deadlock-mods/common";
import * as yauzl from "yauzl";
import type { HostedSourceSnapshot } from "./types";

const MAX_TEXT_BYTES = 64 * 1024;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

/** Stream the archive to disk with bounded size and verified download origin. */
export const downloadArchive = async ({
  url,
  target,
  userAgent,
}: {
  url: string;
  target: string;
  userAgent: string;
}): Promise<
  Pick<HostedSourceSnapshot, "etag" | "lastModified" | "sha256" | "size">
> => {
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) {
    throw new ProviderError(`${url} returned HTTP ${response.status}`);
  }
  // The desktop only follows redirects within the declared download origin.
  const origin = new URL(url).origin;
  if (new URL(response.url).origin !== origin) {
    await response.body.cancel();
    throw new ProviderError(`${url} redirected outside ${origin}`);
  }
  if (Number(response.headers.get("content-length")) > MAX_ARCHIVE_BYTES) {
    await response.body.cancel();
    throw new ProviderError(`${url} is too large`);
  }

  const hash = createHash("sha256");
  let size = 0;
  await pipeline(
    response.body,
    async function* (chunks: AsyncIterable<Uint8Array>) {
      for await (const chunk of chunks) {
        size += chunk.byteLength;
        if (size > MAX_ARCHIVE_BYTES) {
          throw new ProviderError(`${url} is too large`);
        }
        hash.update(chunk);
        yield chunk;
      }
    },
    createWriteStream(target),
  );
  return {
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    sha256: hash.digest("hex"),
    size,
  };
};

export interface ArchiveContents {
  vpkPaths: string[];
  texts: Record<string, string>;
}

const openZip = (archivePath: string) =>
  new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(
      archivePath,
      { lazyEntries: true, autoClose: false },
      (error, zipfile) => {
        if (error || !zipfile) {
          reject(new ExtractionError("Failed to open ZIP file", error));
          return;
        }
        resolve(zipfile);
      },
    );
  });

const nextEntry = (zipfile: yauzl.ZipFile) =>
  new Promise<yauzl.Entry | null>((resolve, reject) => {
    const settle = () => {
      zipfile.off("entry", onEntry);
      zipfile.off("end", onEnd);
      zipfile.off("error", onError);
    };
    const onEntry = (entry: yauzl.Entry) => {
      settle();
      resolve(entry);
    };
    const onEnd = () => {
      settle();
      resolve(null);
    };
    const onError = (error: Error) => {
      settle();
      reject(new ExtractionError("Failed to read ZIP entries", error));
    };
    zipfile.on("entry", onEntry);
    zipfile.on("end", onEnd);
    zipfile.on("error", onError);
    zipfile.readEntry();
  });

const readText = (zipfile: yauzl.ZipFile, entry: yauzl.Entry) =>
  new Promise<string>((resolve, reject) => {
    zipfile.openReadStream(entry, async (error, stream?: Readable) => {
      if (error || !stream) {
        reject(new ExtractionError(`Failed to read ${entry.fileName}`, error));
        return;
      }
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        resolve(Buffer.concat(chunks).toString("utf8"));
      } catch (readError) {
        reject(
          new ExtractionError(`Failed to read ${entry.fileName}`, readError),
        );
      }
    });
  });

/** Lists the archive's VPKs and reads the named text files. */
export const inspectZip = async (
  archivePath: string,
  textPaths: string[],
): Promise<ArchiveContents> => {
  const wanted = new Set(textPaths);
  const contents: ArchiveContents = { vpkPaths: [], texts: {} };
  const zipfile = await openZip(archivePath);
  try {
    for (
      let entry = await nextEntry(zipfile);
      entry;
      entry = await nextEntry(zipfile)
    ) {
      const path = entry.fileName;
      if (path.toLowerCase().endsWith(".vpk")) {
        contents.vpkPaths.push(path);
      } else if (wanted.has(path) && entry.uncompressedSize <= MAX_TEXT_BYTES) {
        contents.texts[path] = await readText(zipfile, entry);
      }
    }
  } finally {
    zipfile.close();
  }
  return contents;
};
