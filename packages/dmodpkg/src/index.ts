/**
 * @deadlock-mods/dmodpkg
 *
 * Library for working with Deadlock mod packages (.dmodpkg)
 */

export const VERSION = "0.1.0";

// Export FFI functions
export {
  extractMod,
  getPackageInfo,
  getVersion,
  listFiles,
  packMod,
  validateProject,
} from "./ffi";

// Export all types
export * from "./types";
