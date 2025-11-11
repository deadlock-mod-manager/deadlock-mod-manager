import { CString, dlopen, FFIType, type Pointer, ptr } from "bun:ffi";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtractResultFFI } from "./generated/ExtractResultFFI";
import type { FileListFFI } from "./generated/FileListFFI";
import type { PackageInfoFFI } from "./generated/PackageInfoFFI";
import type { PackResultFFI } from "./generated/PackResultFFI";
import type { ValidationResultFFI } from "./generated/ValidationResultFFI";

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
    ? join(packageRoot, "target", "release", `dmodpkg.${suffix}`)
    : join(packageRoot, "target", "release", `libdmodpkg.${suffix}`);

const lib = dlopen(libPath, {
  dmodpkg_pack: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.cstring,
  },
  dmodpkg_extract: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.cstring,
  },
  dmodpkg_get_info: {
    args: [FFIType.ptr],
    returns: FFIType.cstring,
  },
  dmodpkg_validate: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.cstring,
  },
  dmodpkg_list_files: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.cstring,
  },
  dmodpkg_free_string: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  dmodpkg_version: {
    args: [],
    returns: FFIType.cstring,
  },
});

type FFIFunction = (
  ...args: (CString | Pointer | NodeJS.TypedArray | null)[]
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
  ...args: (CString | Pointer | NodeJS.TypedArray | null)[]
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
    lib.symbols.dmodpkg_free_string(result as Pointer);
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

export interface PackOptionsInput {
  compressionLevel?: number;
  chunkSize?: number;
  skipValidation?: boolean;
}

export interface ExtractOptionsInput {
  verifyChecksums?: boolean;
  layers?: string[];
  overwrite?: boolean;
}

export interface ValidationOptionsInput {
  strict?: boolean;
}

/**
 * Pack a mod project into a .dmodpkg file
 * @param projectPath - Path to the mod project directory
 * @param outputPath - Optional path where the .dmodpkg file will be created
 * @param options - Optional packing options
 * @returns Pack result with package path and statistics
 */
export function packMod(
  projectPath: string,
  outputPath?: string,
  options?: PackOptionsInput,
): PackResultFFI {
  const projectPathBuffer = Buffer.from(`${projectPath}\0`, "utf8");
  const outputPathBuffer = outputPath
    ? Buffer.from(`${outputPath}\0`, "utf8")
    : null;
  const optionsBuffer = options
    ? Buffer.from(`${JSON.stringify(options)}\0`, "utf8")
    : null;

  return callNativeFunction<PackResultFFI>(
    lib.symbols.dmodpkg_pack,
    ptr(projectPathBuffer),
    outputPathBuffer ? ptr(outputPathBuffer) : null,
    optionsBuffer ? ptr(optionsBuffer) : null,
  );
}

/**
 * Extract a .dmodpkg file to a project directory
 * @param packagePath - Path to the .dmodpkg file
 * @param outputPath - Optional path where the project will be extracted
 * @param options - Optional extraction options
 * @returns Extract result with project path and statistics
 */
export function extractMod(
  packagePath: string,
  outputPath?: string,
  options?: ExtractOptionsInput,
): ExtractResultFFI {
  const packagePathBuffer = Buffer.from(`${packagePath}\0`, "utf8");
  const outputPathBuffer = outputPath
    ? Buffer.from(`${outputPath}\0`, "utf8")
    : null;
  const optionsBuffer = options
    ? Buffer.from(`${JSON.stringify(options)}\0`, "utf8")
    : null;

  return callNativeFunction<ExtractResultFFI>(
    lib.symbols.dmodpkg_extract,
    ptr(packagePathBuffer),
    outputPathBuffer ? ptr(outputPathBuffer) : null,
    optionsBuffer ? ptr(optionsBuffer) : null,
  );
}

/**
 * Get package information without extracting
 * @param packagePath - Path to the .dmodpkg file
 * @returns Package information including config, stats, layers, and files
 */
export function getPackageInfo(packagePath: string): PackageInfoFFI {
  const packagePathBuffer = Buffer.from(`${packagePath}\0`, "utf8");

  return callNativeFunction<PackageInfoFFI>(
    lib.symbols.dmodpkg_get_info,
    ptr(packagePathBuffer),
  );
}

/**
 * Validate a mod project
 * @param projectPath - Path to the mod project directory
 * @param options - Optional validation options
 * @returns Validation result with warnings and errors
 */
export function validateProject(
  projectPath: string,
  options?: ValidationOptionsInput,
): ValidationResultFFI {
  const projectPathBuffer = Buffer.from(`${projectPath}\0`, "utf8");
  const optionsBuffer = options
    ? Buffer.from(`${JSON.stringify(options)}\0`, "utf8")
    : null;

  return callNativeFunction<ValidationResultFFI>(
    lib.symbols.dmodpkg_validate,
    ptr(projectPathBuffer),
    optionsBuffer ? ptr(optionsBuffer) : null,
  );
}

/**
 * List files in a package
 * @param packagePath - Path to the .dmodpkg file
 * @param layer - Optional layer name to filter by
 * @returns List of files in the package
 */
export function listFiles(packagePath: string, layer?: string): FileListFFI {
  const packagePathBuffer = Buffer.from(`${packagePath}\0`, "utf8");
  const layerBuffer = layer ? Buffer.from(`${layer}\0`, "utf8") : null;

  return callNativeFunction<FileListFFI>(
    lib.symbols.dmodpkg_list_files,
    ptr(packagePathBuffer),
    layerBuffer ? ptr(layerBuffer) : null,
  );
}

/**
 * Get the version of the native dmodpkg library
 * @returns Version string of the underlying Rust library
 */
export function getVersion(): string {
  const result = lib.symbols.dmodpkg_version();

  if (typeof result === "number" && result !== 0) {
    const version = new CString(result as Pointer).toString();
    lib.symbols.dmodpkg_free_string(result as Pointer);
    return version;
  } else if (typeof result === "string") {
    return result;
  } else {
    return String(result);
  }
}
