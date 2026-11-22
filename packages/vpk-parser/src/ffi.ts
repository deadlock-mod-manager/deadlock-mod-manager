import { RuntimeError } from "@deadlock-mods/common";
import { CString, dlopen, FFIType, type Pointer, ptr } from "bun:ffi";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  VpkFingerprint,
  VpkInfo,
  VpkParsed,
  VpkParseOptionsInput,
} from "./types";

const suffix =
  process.platform === "win32"
    ? "dll"
    : process.platform === "darwin"
      ? "dylib"
      : "so";

// Resolve library path relative to this package directory
const packageRoot = join(import.meta.dir, "..");
const libPath =
  suffix === "dll"
    ? join(packageRoot, "target", "release", `vpk_parser.${suffix}`)
    : join(packageRoot, "target", "release", `libvpk_parser.${suffix}`);

const lib = dlopen(libPath, {
  vpk_parse: {
    args: [FFIType.ptr, FFIType.uint64_t, FFIType.ptr],
    returns: FFIType.ptr,
  },
  vpk_parse_file: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  vpk_get_hashes: {
    args: [FFIType.ptr, FFIType.uint64_t, FFIType.ptr],
    returns: FFIType.ptr,
  },
  vpk_get_info: {
    args: [FFIType.ptr, FFIType.uint64_t],
    returns: FFIType.ptr,
  },
  vpk_free_string: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  vpk_version: {
    args: [],
    returns: FFIType.ptr,
  },
});

type FFIArg = number | bigint | Pointer | NodeJS.TypedArray | null;
type FFIFunction = (...args: FFIArg[]) => Pointer | null;

interface ErrorResult {
  error: string;
}

/**
 * Copies a string allocated by the native library and frees it. The symbols
 * return raw pointers because Bun's `cstring` return type hands back a JS
 * string and drops the pointer, which leaks every result.
 */
function takeNativeString(result: Pointer | null): string {
  if (result === null) {
    throw new RuntimeError("Native VPK parser returned a null pointer");
  }
  const text = new CString(result).toString();
  lib.symbols.vpk_free_string(result);
  return text;
}

function callNativeFunction<T>(fn: FFIFunction, ...args: FFIArg[]): T {
  return decodeNativeResult<T>(fn(...args));
}

function decodeNativeResult<T>(result: Pointer | null): T {
  const parsed = JSON.parse(takeNativeString(result)) as T | ErrorResult;
  const errorResult = parsed as ErrorResult;
  if (errorResult.error) {
    throw new RuntimeError(errorResult.error);
  }
  return parsed as T;
}

function encodeParseOptions(options: VpkParseOptionsInput): Buffer {
  const optionsJson = JSON.stringify({
    includeFullFileHash: options.includeFullFileHash || false,
    includeMerkle: options.includeMerkle || false,
    filePath: options.filePath || "",
    lastModified: options.lastModified?.toISOString() || null,
    includeEntries: options.includeEntries !== false, // Default to true for backward compatibility
  });
  return Buffer.from(`${optionsJson}\0`, "utf8");
}

/**
 * Parse a VPK buffer with optional parsing configuration.
 * @param buffer - The VPK file data as a Buffer
 * @param options - Parsing options including hash calculation and file metadata
 * @returns Parsed VPK data including header, entries, and fingerprint
 */
export function parseVpk(
  buffer: Buffer,
  options: VpkParseOptionsInput = {},
): VpkParsed {
  const optionsBuffer = encodeParseOptions(options);

  return callNativeFunction<VpkParsed>(
    lib.symbols.vpk_parse,
    ptr(buffer),
    buffer.length,
    ptr(optionsBuffer),
  );
}

/**
 * Parse a VPK file directly from the filesystem.
 * @param filePath - Path to the VPK file
 * @param options - Parsing options (file path and modification time are automatically set)
 * @returns Parsed VPK data including header, entries, and fingerprint
 */
export function parseVpkFile(
  filePath: string,
  options: VpkParseOptionsInput = {},
): VpkParsed {
  const stats = statSync(filePath);
  const pathBuffer = Buffer.from(`${filePath}\0`, "utf8");
  const optionsBuffer = encodeParseOptions({
    ...options,
    filePath,
    lastModified: stats.mtime,
  });

  return decodeNativeResult<VpkParsed>(
    lib.symbols.vpk_parse_file(ptr(pathBuffer), ptr(optionsBuffer)),
  );
}

/**
 * Generate cryptographic hashes for VPK mod identification and verification.
 * @param buffer - The VPK file data as a Buffer
 * @param filePath - Optional file path for context (used in hash calculation)
 * @returns Fingerprint containing various hashes and metadata flags
 */
export function getVpkHashes(
  buffer: Buffer,
  filePath: string = "",
): VpkFingerprint {
  const pathBuffer = filePath
    ? Buffer.from(`${filePath}\0`, "utf8")
    : Buffer.from("\0");

  return callNativeFunction<VpkFingerprint>(
    lib.symbols.vpk_get_hashes,
    ptr(buffer),
    buffer.length,
    ptr(pathBuffer),
  );
}

/**
 * Generate cryptographic hashes for a VPK file from filesystem.
 * @param filePath - Path to the VPK file
 * @returns Fingerprint containing various hashes and metadata flags
 */
export function getVpkHashesFromFile(filePath: string): VpkFingerprint {
  const buffer = readFileSync(filePath);
  return getVpkHashes(buffer, filePath);
}

/**
 * Extract basic VPK metadata without full parsing (optimized for speed).
 * @param buffer - The VPK file data as a Buffer
 * @returns Basic VPK information including version, file count, and quick hashes
 */
export function getVpkInfo(buffer: Buffer): VpkInfo {
  return callNativeFunction<VpkInfo>(
    lib.symbols.vpk_get_info,
    ptr(buffer),
    buffer.length,
  );
}

/**
 * Extract basic VPK metadata from filesystem (optimized for speed).
 * @param filePath - Path to the VPK file
 * @returns Basic VPK information including version, file count, and quick hashes
 */
export function getVpkInfoFromFile(filePath: string): VpkInfo {
  const buffer = readFileSync(filePath);
  return getVpkInfo(buffer);
}

/**
 * Get the version of the native VPK parser library.
 * @returns Version string of the underlying Rust library
 */
export function getVersion(): string {
  return takeNativeString(lib.symbols.vpk_version());
}
