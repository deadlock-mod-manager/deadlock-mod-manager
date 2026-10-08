import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { z } from "zod";
import type { CommunityDefinition } from "../../curated/community";
import { decodeText, fetchJson, fetchPinned } from "./fetch";
import type { CommunityPin } from "./sources";

/** GameBanana's field names, mapped to ours as the response is parsed. */
const profileFileSchema = z
  .object({
    _idRow: z.number().int(),
    _sFile: z.string(),
    _tsDateAdded: z.number(),
    _sMd5Checksum: z.string(),
  })
  .transform(
    ({
      _idRow: id,
      _sFile: name,
      _tsDateAdded: addedAt,
      _sMd5Checksum: md5,
    }) => ({
      id,
      name,
      addedAt,
      md5,
    }),
  );

const profilePageSchema = z
  .object({
    _sName: z.string(),
    _nDownloadCount: z.number().int().optional(),
    _tsDateUpdated: z.number().optional(),
    _tsDateModified: z.number().optional(),
    _tsDateAdded: z.number().optional(),
    _aSubmitter: z
      .object({ _sName: z.string() })
      .transform(({ _sName: submitter }) => submitter)
      .optional(),
    _aFiles: z.array(profileFileSchema).optional(),
  })
  .transform(
    ({
      _sName: name,
      _nDownloadCount: downloads,
      _tsDateUpdated: updated,
      _tsDateModified: modified,
      _tsDateAdded: added,
      _aSubmitter: author,
      _aFiles: files,
    }) => ({
      name,
      downloads: downloads ?? 0,
      updatedAt: updated ?? modified ?? added,
      author: author ?? "unknown",
      files: files ?? [],
    }),
  );

type ProfileFile = z.infer<typeof profileFileSchema>;

/** `aFlattenedFileList()` answers with one list of paths per requested file. */
const archiveListingSchema = z.array(z.array(z.string()));

const isoDate = (seconds: number | undefined): string | null =>
  seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : null;

const archiveListing = async (fileId: number): Promise<string[]> => {
  const url = `https://api.gamebanana.com/Core/Item/Data?itemtype=File&itemid=${fileId}&fields=aFlattenedFileList()`;
  const [listing] = await fetchJson(url, archiveListingSchema);
  return listing ?? [];
};

const matchesHint = (path: string, hint: string): boolean =>
  path.replace(/\\/g, "/").toLowerCase().endsWith(hint.toLowerCase());

/** Current metadata and the file to pin for one GameBanana config. */
export const refreshCommunityPin = async (
  definition: CommunityDefinition,
): Promise<CommunityPin> => {
  const page = await fetchJson(
    `https://gamebanana.com/apiv11/Mod/${definition.gamebananaId}/ProfilePage`,
    profilePageSchema,
  );
  const files = [...page.files].sort(
    (a, b) => b.addedAt - a.addedAt || b.id - a.id,
  );
  let chosen: ProfileFile | undefined;
  if (definition.fileId) {
    chosen = files.find((file) => file.id === definition.fileId);
  } else {
    for (const file of files) {
      const listing = await archiveListing(file.id);
      if (listing.some((path) => matchesHint(path, definition.variantHint))) {
        chosen = file;
        break;
      }
    }
  }
  if (!chosen) {
    throw new Error(
      `GameBanana ${definition.gamebananaId}: no live file contains ${definition.variantHint}`,
    );
  }
  return {
    fileId: chosen.id,
    fileName: chosen.name,
    md5: chosen.md5,
    name: page.name,
    author: page.author,
    downloads: page.downloads,
    updatedAt: isoDate(page.updatedAt),
  };
};

const EXTRACTORS: string[][] = [
  ["bsdtar", "-xf"],
  ...(process.platform === "win32"
    ? [["C:\\Windows\\System32\\tar.exe", "-xf"]]
    : []),
  ["7z", "x", "-y"],
];

const extract = (archive: string, into: string) => {
  const failures: string[] = [];
  for (const [command, ...args] of EXTRACTORS) {
    const isSevenZip = command === "7z";
    const result = spawnSync(
      command,
      isSevenZip
        ? [...args, `-o${into}`, archive]
        : [...args, archive, "-C", into],
      { encoding: "utf8" },
    );
    if (result.status === 0) return;
    failures.push(
      `${command}: ${result.error?.message ?? result.stderr.trim().split("\n")[0]}`,
    );
  }
  throw new Error(
    `Could not extract ${archive}; install bsdtar (libarchive-tools) or 7-Zip.\n${failures.join("\n")}`,
  );
};

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });

/**
 * Downloads the pinned file (md5-verified, cached), extracts it to a temporary
 * folder and returns the text of the variant. Nothing extracted is kept.
 */
export const readCommunityVariant = async (
  pin: CommunityPin,
  variantHint: string,
): Promise<{ text: string; path: string }> => {
  const data = await fetchPinned({
    url: `https://gamebanana.com/dl/${pin.fileId}`,
    md5: pin.md5,
  });
  const extension = pin.fileName.slice(pin.fileName.lastIndexOf("."));
  if (!/\.(zip|rar|7z)$/i.test(extension))
    return { text: decodeText(data), path: pin.fileName };
  const workDir = mkdtempSync(join(tmpdir(), "perf-catalog-"));
  try {
    const archive = join(workDir, `archive${extension}`);
    writeFileSync(archive, data);
    const out = join(workDir, "out");
    mkdirSync(out);
    extract(archive, out);
    const files = listFiles(out).map((path) =>
      relative(out, path).replace(/\\/g, "/"),
    );
    const match = files
      .filter((path) => matchesHint(path, variantHint))
      .sort()[0];
    if (!match) {
      throw new Error(
        `${pin.fileName}: no file ends with ${variantHint} (found ${files.join(", ")})`,
      );
    }
    return {
      text: decodeText(new Uint8Array(readFileSync(join(out, match)))),
      path: match,
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
};
