import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const VPK_SIGNATURE = 0x55aa1234;
const VPK_VERSION = 2;
const INLINE_ARCHIVE_INDEX = 0x7fff;
const ENTRY_TERMINATOR = 0xffff;

export type VpkRecipeEntry = {
  path: string;
  contents: string | Uint8Array;
};

type PackedEntry = {
  normalizedPath: string;
  extension: string;
  directory: string;
  filename: string;
  crc32: number;
  offset: number;
  contents: Uint8Array;
};

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

const crc32 = (contents: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of contents)
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const cString = (value: string): Buffer => Buffer.from(`${value}\0`, "utf8");
const u16 = (value: number): Buffer => {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value);
  return buffer;
};
const u32 = (value: number): Buffer => {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value);
  return buffer;
};

const parseEntry = (entry: VpkRecipeEntry, offset: number): PackedEntry => {
  const normalized = entry.path.replaceAll("\\", "/").toLowerCase();
  if (
    normalized.startsWith("/") ||
    normalized.includes("../") ||
    normalized.includes("\0") ||
    /^[a-z]:\//.test(normalized)
  ) {
    throw new Error(`Unsafe VPK recipe path '${entry.path}'`);
  }
  const extension = path.posix.extname(normalized).slice(1);
  const filename = path.posix.basename(normalized, `.${extension}`);
  if (extension.length === 0 || filename.length === 0) {
    throw new Error(
      `VPK recipe path needs a filename and extension: '${entry.path}'`,
    );
  }
  const parent = path.posix.dirname(normalized);
  const contents =
    typeof entry.contents === "string"
      ? Buffer.from(entry.contents)
      : entry.contents;
  return {
    normalizedPath: normalized,
    extension,
    directory: parent === "." ? " " : parent,
    filename,
    crc32: crc32(contents),
    offset,
    contents,
  };
};

export const buildSyntheticVpk = (
  recipe: readonly VpkRecipeEntry[],
): Buffer => {
  if (recipe.length === 0)
    throw new Error("A synthetic VPK needs at least one entry");
  const sorted = [...recipe].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const packed: PackedEntry[] = [];
  const normalizedPaths = new Set<string>();
  let offset = 0;
  for (const entry of sorted) {
    const parsed = parseEntry(entry, offset);
    if (normalizedPaths.has(parsed.normalizedPath)) {
      throw new Error(`Duplicate VPK recipe path '${entry.path}'`);
    }
    normalizedPaths.add(parsed.normalizedPath);
    packed.push(parsed);
    offset += parsed.contents.byteLength;
  }

  const treeParts: Buffer[] = [];
  const extensions = [
    ...new Set(packed.map((entry) => entry.extension)),
  ].sort();
  for (const extension of extensions) {
    treeParts.push(cString(extension));
    const byExtension = packed.filter((entry) => entry.extension === extension);
    const directories = [
      ...new Set(byExtension.map((entry) => entry.directory)),
    ].sort();
    for (const directory of directories) {
      treeParts.push(cString(directory));
      for (const entry of byExtension.filter(
        (candidate) => candidate.directory === directory,
      )) {
        treeParts.push(
          cString(entry.filename),
          u32(entry.crc32),
          u16(0),
          u16(INLINE_ARCHIVE_INDEX),
          u32(entry.offset),
          u32(entry.contents.byteLength),
          u16(ENTRY_TERMINATOR),
        );
      }
      treeParts.push(Buffer.from([0]));
    }
    treeParts.push(Buffer.from([0]));
  }
  treeParts.push(Buffer.from([0]));
  const tree = Buffer.concat(treeParts);
  const data = Buffer.concat(
    packed.map((entry) => Buffer.from(entry.contents)),
  );
  const header = Buffer.concat([
    u32(VPK_SIGNATURE),
    u32(VPK_VERSION),
    u32(tree.byteLength),
    u32(data.byteLength),
    u32(0),
    u32(0),
    u32(0),
  ]);
  return Buffer.concat([header, tree, data]);
};

export const writeSyntheticVpk = async (
  outputPath: string,
  recipe: readonly VpkRecipeEntry[],
): Promise<void> => {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buildSyntheticVpk(recipe));
};
