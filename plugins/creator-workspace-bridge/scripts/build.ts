/**
 * Builds the installable plugin archive:
 *   1. compiles the Rust backend to wasm32-unknown-unknown,
 *   2. bundles the React UI with Vite,
 *   3. assembles dist/package and writes a reproducible ZIP from it.
 *
 * The ZIP stores entries uncompressed, in byte order of their paths, with a
 * fixed 1980-01-01 timestamp and no extra fields, so identical inputs and
 * toolchains always produce an identical archive.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { build as viteBuild } from "vite";

const PLUGIN_ROOT = resolve(import.meta.dir, "..");
const SDK_ROOT = resolve(PLUGIN_ROOT, "../../packages/plugin-sdk-rust");
const DIST = join(PLUGIN_ROOT, "dist");
const PACKAGE_DIR = join(DIST, "package");
const WASM_TARGET = "wasm32-unknown-unknown";
const CRATE = "creator-workspace-bridge";
const WASM_OUTPUT = join(
  PLUGIN_ROOT,
  "target",
  WASM_TARGET,
  "release",
  `${CRATE.replaceAll("-", "_")}.wasm`,
);

const MAX_BACKEND_BYTES = 16 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 256;
const SAFE_COMPONENT = /^[A-Za-z0-9._\-@+~]+$/;

type Manifest = {
  id: string;
  version: string;
  ui: string;
  backend: string;
};

function run(command: string[], env: Record<string, string> = {}) {
  const result = Bun.spawnSync(command, {
    cwd: PLUGIN_ROOT,
    env: { ...process.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited with ${result.exitCode}`);
  }
}

function buildBackend() {
  const cargoHome = process.env.CARGO_HOME ?? join(homedir(), ".cargo");
  // Strip machine-specific paths from panic locations so the module is
  // byte-identical across checkouts. CARGO_ENCODED_RUSTFLAGS keeps paths with
  // spaces intact.
  const sysroot = Bun.spawnSync(["rustc", "--print", "sysroot"])
    .stdout.toString()
    .trim();
  const rustflags = [
    `--remap-path-prefix=${sysroot}=/rust`,
    `--remap-path-prefix=${PLUGIN_ROOT}=/plugin`,
    `--remap-path-prefix=${SDK_ROOT}=/plugin-sdk-rust`,
    `--remap-path-prefix=${cargoHome}=/cargo`,
  ].join("\x1f");
  run(
    [
      "cargo",
      "build",
      "--release",
      "--locked",
      "--target",
      WASM_TARGET,
      "-p",
      CRATE,
    ],
    { CARGO_ENCODED_RUSTFLAGS: rustflags },
  );
  const bytes = readFileSync(WASM_OUTPUT);
  if (bytes.length > MAX_BACKEND_BYTES) {
    throw new Error(
      `backend.wasm is ${bytes.length} bytes; the limit is 16 MiB`,
    );
  }
  const module = new WebAssembly.Module(bytes);
  const imports = WebAssembly.Module.imports(module).map(
    ({ module: name, name: field, kind }) => `${name}.${field}:${kind}`,
  );
  if (imports.join(",") !== "dmm.host_call:function") {
    throw new Error(
      `backend.wasm must import only dmm.host_call, found ${imports.join(", ")}`,
    );
  }
  const exports = new Set(
    WebAssembly.Module.exports(module).map(
      ({ name, kind }) => `${name}:${kind}`,
    ),
  );
  for (const required of ["memory:memory", "alloc:function", "call:function"]) {
    if (!exports.has(required)) {
      throw new Error(`backend.wasm is missing the ${required} export`);
    }
  }
  return bytes;
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Refusing to package symlink ${path}`);
    if (entry.isDirectory()) return listFiles(path);
    if (entry.isFile()) return [path];
    throw new Error(`Refusing to package special file ${path}`);
  });
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Minimal stored-entry ZIP writer; see the file header for why. */
function writeZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const DOS_DATE_1980_01_01 = (0 << 9) | (1 << 5) | 1;
  const UTF8_NAMES = 0x0800;
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, UTF8_NAMES, true);
    header.setUint16(8, 0, true);
    header.setUint16(10, 0, true);
    header.setUint16(12, DOS_DATE_1980_01_01, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, data.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, nameBytes.length, true);
    header.setUint16(28, 0, true);
    local.push(new Uint8Array(header.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, UTF8_NAMES, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, 0, true);
    entry.setUint16(14, DOS_DATE_1980_01_01, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return Buffer.concat([...local, ...central, new Uint8Array(end.buffer)]);
}

async function main() {
  const manifestBytes = readFileSync(join(PLUGIN_ROOT, "manifest.json"));
  const manifest: Manifest = JSON.parse(manifestBytes.toString("utf8"));

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(PACKAGE_DIR, { recursive: true });

  const backend = buildBackend();
  await viteBuild({ configFile: join(PLUGIN_ROOT, "vite.config.ts") });
  writeFileSync(join(PACKAGE_DIR, manifest.backend), backend);
  copyFileSync(
    join(PLUGIN_ROOT, "manifest.json"),
    join(PACKAGE_DIR, "manifest.json"),
  );

  const entries = listFiles(PACKAGE_DIR)
    .map((path) => ({
      name: relative(PACKAGE_DIR, path).split(sep).join("/"),
      data: readFileSync(path),
    }))
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)),
    );
  for (const { name } of entries) {
    if (
      !name
        .split("/")
        .every((part) => SAFE_COMPONENT.test(part) && part !== "..")
    ) {
      throw new Error(`Unsafe package path ${name}`);
    }
  }
  const names = new Set(entries.map(({ name }) => name));
  for (const required of ["manifest.json", manifest.ui, manifest.backend]) {
    if (!names.has(required)) throw new Error(`Package is missing ${required}`);
  }
  if (entries.length > MAX_ENTRIES) {
    throw new Error(
      `Package has ${entries.length} files; the limit is ${MAX_ENTRIES}`,
    );
  }

  const archive = writeZip(entries);
  if (archive.length > MAX_ARCHIVE_BYTES) {
    throw new Error(`Archive is ${archive.length} bytes; the limit is 32 MiB`);
  }
  const archiveName = `${manifest.id}-${manifest.version}.zip`;
  const archivePath = join(DIST, archiveName);
  writeFileSync(archivePath, archive);
  const digest = createHash("sha256").update(archive).digest("hex");
  writeFileSync(`${archivePath}.sha256`, `${digest}  ${archiveName}\n`);

  console.log(`\n${relative(PLUGIN_ROOT, archivePath)}`);
  console.log(`  ${entries.length} files, ${archive.length} bytes`);
  console.log(`  sha256 ${digest}`);
}

await main();
