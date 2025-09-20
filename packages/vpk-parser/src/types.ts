export type { VpkEntry } from "./generated/VpkEntry";
export type { VpkFingerprint } from "./generated/VpkFingerprint";
export type { VpkHeader } from "./generated/VpkHeader";
export type { VpkInfo } from "./generated/VpkInfo";
export type { VpkParsed } from "./generated/VpkParsed";
export type { VpkParseOptions } from "./generated/VpkParseOptions";

export interface VpkParseOptionsInput {
  includeFullFileHash?: boolean;
  includeMerkle?: boolean;
  filePath?: string;
  lastModified?: Date;
}
