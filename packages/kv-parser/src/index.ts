// Export FFI functions
export {
  applyDiff,
  generateDiff,
  getDiffStats,
  getVersion,
  parseKv,
  serializeAst,
  serializeData,
} from "./ffi";
// Re-export for convenience
export type { ParseResult } from "./types";
// Export all types
export * from "./types";
