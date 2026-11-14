import { RuntimeError } from "@deadlock-mods/common";
import { CString, dlopen, FFIType, type Pointer, ptr } from "bun:ffi";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { takeNativeString } from "./native-string";
import type {
  DiffStats,
  DocumentDiff,
  KeyValuesObject,
  ParseOptions,
  ParseResult,
  SerializeOptions,
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
    ? join(packageRoot, "target", "release", `kv_parser.${suffix}`)
    : join(packageRoot, "target", "release", `libkv_parser.${suffix}`);

const lib = dlopen(libPath, {
  kv_parse: {
    args: [FFIType.ptr, FFIType.uint64_t, FFIType.ptr],
    returns: FFIType.ptr,
  },
  kv_serialize_ast: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  kv_serialize_data: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  kv_diff: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  kv_apply_diff: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  kv_diff_stats: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  kv_free_string: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  kv_version: {
    args: [],
    returns: FFIType.ptr,
  },
});

function decodeNativeResult<T extends object>(result: Pointer | null): T {
  const parsed: T & { error?: string } = JSON.parse(
    extractStringResult(result),
  );
  if (parsed.error) {
    throw new RuntimeError(parsed.error);
  }
  return parsed;
}

/**
 * Parse KeyValues from string
 */
export function parseKv(content: string, options?: ParseOptions): ParseResult {
  const buffer = Buffer.from(content, "utf8");
  const optionsJson = JSON.stringify({
    allowEscapeSequences: options?.allowEscapeSequences ?? true,
    allowConditionals: options?.allowConditionals ?? true,
    allowIncludes: options?.allowIncludes ?? true,
  });
  const optionsBuffer = Buffer.from(`${optionsJson}\0`, "utf8");

  return decodeNativeResult<ParseResult>(
    lib.symbols.kv_parse(ptr(buffer), buffer.length, ptr(optionsBuffer)),
  );
}

/**
 * Copies and frees a string allocated by the native KV library.
 */
function extractStringResult(result: Pointer | null): string {
  return takeNativeString(
    result,
    (pointer) => new CString(pointer).toString(),
    lib.symbols.kv_free_string,
  );
}

/**
 * Serialize AST to KeyValues string (perfect preservation)
 */
export function serializeAst(ast: ParseResult["ast"]): string {
  const astJson = JSON.stringify(ast);
  const astBuffer = Buffer.from(`${astJson}\0`, "utf8");

  const result = lib.symbols.kv_serialize_ast(ptr(astBuffer));
  return extractStringResult(result);
}

/**
 * Serialize data object to KeyValues string
 */
export function serializeData(
  data: KeyValuesObject,
  options?: SerializeOptions,
): string {
  const dataJson = JSON.stringify(data);
  const dataBuffer = Buffer.from(`${dataJson}\0`, "utf8");

  const optionsJson = JSON.stringify({
    indentSize: options?.indentSize ?? 4,
    useTabs: options?.useTabs ?? false,
    quoteAllStrings: options?.quoteAllStrings ?? false,
    minimizeQuotes: options?.minimizeQuotes ?? true,
  });
  const optionsBuffer = Buffer.from(`${optionsJson}\0`, "utf8");

  const result = lib.symbols.kv_serialize_data(
    ptr(dataBuffer),
    ptr(optionsBuffer),
  );

  return extractStringResult(result);
}

/**
 * Generate diff between two data objects
 */
export function generateDiff(
  source: KeyValuesObject,
  target: KeyValuesObject,
): DocumentDiff {
  const sourceJson = JSON.stringify(source);
  const targetJson = JSON.stringify(target);
  const sourceBuffer = Buffer.from(`${sourceJson}\0`, "utf8");
  const targetBuffer = Buffer.from(`${targetJson}\0`, "utf8");

  return decodeNativeResult<DocumentDiff>(
    lib.symbols.kv_diff(ptr(sourceBuffer), ptr(targetBuffer)),
  );
}

/**
 * Apply diff to data object
 */
export function applyDiff(
  source: KeyValuesObject,
  diff: DocumentDiff,
): KeyValuesObject {
  const sourceJson = JSON.stringify(source);
  const diffJson = JSON.stringify(diff);
  const sourceBuffer = Buffer.from(`${sourceJson}\0`, "utf8");
  const diffBuffer = Buffer.from(`${diffJson}\0`, "utf8");

  return decodeNativeResult<KeyValuesObject>(
    lib.symbols.kv_apply_diff(ptr(sourceBuffer), ptr(diffBuffer)),
  );
}

/**
 * Get diff statistics
 */
export function getDiffStats(diff: DocumentDiff): DiffStats {
  const diffJson = JSON.stringify(diff);
  const diffBuffer = Buffer.from(`${diffJson}\0`, "utf8");

  return decodeNativeResult<DiffStats>(
    lib.symbols.kv_diff_stats(ptr(diffBuffer)),
  );
}

/**
 * Get the version of the native library
 */
export function getVersion(): string {
  const result = lib.symbols.kv_version();
  return extractStringResult(result);
}
