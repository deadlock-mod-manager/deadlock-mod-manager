import { CString, dlopen, FFIType, type Pointer, ptr } from "bun:ffi";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
    returns: FFIType.cstring,
  },
  kv_serialize_ast: {
    args: [FFIType.ptr],
    returns: FFIType.cstring,
  },
  kv_serialize_data: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.cstring,
  },
  kv_diff: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.cstring,
  },
  kv_apply_diff: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.cstring,
  },
  kv_diff_stats: {
    args: [FFIType.ptr],
    returns: FFIType.cstring,
  },
  kv_free_string: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  kv_version: {
    args: [],
    returns: FFIType.cstring,
  },
});

type FFIFunction = (
  ...args: (number | bigint | CString | Pointer | NodeJS.TypedArray | null)[]
) => CString;

type FFIFunctionPointerOnly = (
  ...args: (CString | Pointer | NodeJS.TypedArray | null)[]
) => CString;

interface ErrorResult {
  error: string;
}

/**
 * Calls native FFI function and handles various return types from Bun FFI
 */
function callNativeFunction<T>(
  fn: FFIFunction | FFIFunctionPointerOnly,
  ...args: (number | bigint | CString | Pointer | NodeJS.TypedArray | null)[]
): T {
  const result = (fn as FFIFunction)(...args);
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
    lib.symbols.kv_free_string(result as Pointer);
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

  return callNativeFunction<ParseResult>(
    lib.symbols.kv_parse,
    ptr(buffer),
    buffer.length,
    ptr(optionsBuffer),
  );
}

/**
 * Extracts a string result from various FFI return types
 */
function extractStringResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  } else if (typeof result === "object" && result !== null) {
    if (result.constructor === String || result instanceof String) {
      return result.toString();
    }
    // CString object - convert to string
    return String(result);
  } else if (typeof result === "number" && result !== 0) {
    const resultStr = new CString(result as Pointer).toString();
    lib.symbols.kv_free_string(result as Pointer);
    return resultStr;
  } else {
    throw new Error(`Unexpected result type: ${typeof result}`);
  }
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

  return callNativeFunction<DocumentDiff>(
    lib.symbols.kv_diff,
    ptr(sourceBuffer),
    ptr(targetBuffer),
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

  return callNativeFunction<KeyValuesObject>(
    lib.symbols.kv_apply_diff,
    ptr(sourceBuffer),
    ptr(diffBuffer),
  );
}

/**
 * Get diff statistics
 */
export function getDiffStats(diff: DocumentDiff): DiffStats {
  const diffJson = JSON.stringify(diff);
  const diffBuffer = Buffer.from(`${diffJson}\0`, "utf8");

  return callNativeFunction<DiffStats>(
    lib.symbols.kv_diff_stats,
    ptr(diffBuffer),
  );
}

/**
 * Get the version of the native library
 */
export function getVersion(): string {
  const result = lib.symbols.kv_version();
  return extractStringResult(result);
}
