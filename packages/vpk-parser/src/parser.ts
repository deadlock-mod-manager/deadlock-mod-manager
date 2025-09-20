import { parseVpk, parseVpkFile } from "./ffi";
import type { VpkParsed, VpkParseOptionsInput } from "./types";

export class VpkParser {
  /**
   * Parse a VPK buffer with options
   * @param buffer - The VPK file buffer
   * @param options - Parsing options
   * @returns Parsed VPK data
   */
  static parse(buffer: Buffer, options: VpkParseOptionsInput = {}): VpkParsed {
    return parseVpk(buffer, options);
  }

  /**
   * Parse a VPK file from disk
   * @param filePath - Path to the VPK file
   * @param options - Parsing options
   * @returns Parsed VPK data
   */
  static parseFile(filePath: string, options: VpkParseOptionsInput = {}): VpkParsed {
    return parseVpkFile(filePath, options);
  }
}
