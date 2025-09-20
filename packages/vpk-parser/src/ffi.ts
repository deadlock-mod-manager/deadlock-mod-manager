import { CString, dlopen, FFIType, type Pointer, ptr } from "bun:ffi";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

// Get the directory of this module file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve library path relative to this package directory
const packageRoot = join(__dirname, "..");
const libPath =
  suffix === "dll"
    ? join(packageRoot, "target", "release", `vpk_parser.${suffix}`)
    : join(packageRoot, "target", "release", `libvpk_parser.${suffix}`);

const lib = dlopen(libPath, {
  vpk_parse: {
    args: [FFIType.ptr, FFIType.uint64_t, FFIType.ptr],
    returns: FFIType.cstring,
  },
  vpk_get_hashes: {
    args: [FFIType.ptr, FFIType.uint64_t, FFIType.ptr],
    returns: FFIType.cstring,
  },
  vpk_get_info: {
    args: [FFIType.ptr, FFIType.uint64_t],
    returns: FFIType.cstring,
  },
  vpk_free_string: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  vpk_version: {
    args: [],
    returns: FFIType.cstring,
  },
});

type FFIFunction = (
  ...args: (number | bigint | CString | Pointer | NodeJS.TypedArray | null)[]
) => CString;

interface ErrorResult {
  error: string;
}

/**
 * Calls native FFI function and handles various return types from Bun FFI.
 * Bun FFI can return strings, String objects, pointers to C strings, or parsed objects.
 */
function callNativeFunction<T>(
  fn: FFIFunction,
  ...args: (number | bigint | CString | Pointer | NodeJS.TypedArray | null)[]
): T {
  const result = fn(...args);
  let jsonString: string;

  if (typeof result === "string") {
    jsonString = result;
  } else if (typeof result === "object" && result !== null) {
    if (result.constructor === String || result instanceof String) {
      jsonString = result.toString();
    } else {
      const errorResult = result as ErrorResult;
      if (errorResult.error) {
        throw new Error(errorResult.error);
      }
      return result as T;
    }
  } else if (typeof result === "number" && result !== 0) {
    const resultStr = new CString(result as Pointer);
    jsonString = resultStr.toString();
    lib.symbols.vpk_free_string(result as Pointer);
  } else {
    throw new Error(
      `Unexpected result type: ${typeof result}, value: ${result}`,
    );
  }

  const parsed = JSON.parse(jsonString) as T | ErrorResult;
  const errorResult = parsed as ErrorResult;
  if (errorResult.error) {
    throw new Error(errorResult.error);
  }
  return parsed as T;
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
  const optionsJson = JSON.stringify({
    includeFullFileHash: options.includeFullFileHash || false,
    includeMerkle: options.includeMerkle || false,
    filePath: options.filePath || "",
    lastModified: options.lastModified?.toISOString() || null,
  });

  const optionsBuffer = Buffer.from(`${optionsJson}\0`, "utf8");

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
  const buffer = readFileSync(filePath);
  const stats = statSync(filePath);

  return parseVpk(buffer, {
    ...options,
    filePath: filePath,
    lastModified: stats.mtime,
  });
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
  const result = lib.symbols.vpk_version();

  if (typeof result === "number" && result !== 0) {
    const version = new CString(result as Pointer).toString();
    lib.symbols.vpk_free_string(result as Pointer);
    return version;
  } else if (typeof result === "string") {
    return result;
  } else {
    return String(result);
  }
}
