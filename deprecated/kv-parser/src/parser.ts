import { readFileSync, writeFileSync } from "node:fs";
import type { ASTParseOptions, DocumentNode, ParseResult } from "./ast";
import { ASTParser } from "./ast-parser";
import { ASTSerializer } from "./ast-serializer";
import { KvSerializer } from "./serializer";
import type {
  KeyValuesObject,
  KvParseOptions,
  KvSerializeOptions,
} from "./types";

export class KvParser {
  /**
   * Parse KeyValues with AST (default, for perfect preservation)
   */
  static parseWithAST(content: string, options?: ASTParseOptions): ParseResult {
    return ASTParser.parse(content, options);
  }

  /**
   * Parse KeyValues (legacy, data only)
   */
  static parse(content: string, options?: KvParseOptions): KeyValuesObject {
    // Use AST parser but only return data
    const result = ASTParser.parse(content, {
      preserveComments: false,
      preserveWhitespace: false,
      ...options,
    });
    return result.data;
  }

  /**
   * Parse file with AST (default)
   */
  static parseFileWithAST(
    filePath: string,
    options?: ASTParseOptions,
  ): ParseResult {
    const content = readFileSync(filePath, "utf-8");
    return ASTParser.parse(content, options);
  }

  /**
   * Parse file (legacy, data only)
   */
  static parseFile(
    filePath: string,
    options?: KvParseOptions,
  ): KeyValuesObject {
    const content = readFileSync(filePath, "utf-8");
    const result = ASTParser.parse(content, {
      preserveComments: false,
      preserveWhitespace: false,
      ...options,
    });
    return result.data;
  }

  /**
   * Serialize from AST (perfect preservation)
   */
  static serializeAST(ast: DocumentNode): string {
    return ASTSerializer.serialize(ast);
  }

  /**
   * Serialize from data object
   */
  static serialize(
    data: KeyValuesObject,
    options?: KvSerializeOptions,
  ): string {
    return KvSerializer.serialize(data, options);
  }

  static writeFile(
    filePath: string,
    data: KeyValuesObject,
    options?: KvSerializeOptions,
  ): void {
    const content = KvSerializer.serialize(data, options);
    writeFileSync(filePath, content, "utf-8");
  }
}

// ============================================================================
// Default API - Data only (for backwards compatibility with existing tests)
// ============================================================================

/**
 * Parse KeyValues to data object
 */
export function parseKv(
  content: string,
  options?: KvParseOptions,
): KeyValuesObject {
  return KvParser.parse(content, options);
}

/**
 * Parse KeyValues file to data object
 */
export function parseKvFile(
  filePath: string,
  options?: KvParseOptions,
): KeyValuesObject {
  return KvParser.parseFile(filePath, options);
}

/**
 * Serialize AST back to string (perfect preservation)
 */
export function serializeKv(ast: DocumentNode): string;
/**
 * Serialize data object to string
 */
export function serializeKv(
  data: KeyValuesObject,
  options?: KvSerializeOptions,
): string;
export function serializeKv(
  input: DocumentNode | KeyValuesObject,
  options?: KvSerializeOptions,
): string {
  // Check if input is an AST node
  if (
    input &&
    typeof input === "object" &&
    "type" in input &&
    input.type === "document"
  ) {
    return KvParser.serializeAST(input as DocumentNode);
  }
  return KvParser.serialize(input as KeyValuesObject, options);
}

export function writeKvFile(
  filePath: string,
  data: KeyValuesObject,
  options?: KvSerializeOptions,
): void {
  KvParser.writeFile(filePath, data, options);
}

// ============================================================================
// AST API - For perfect preservation
// ============================================================================

/**
 * Parse KeyValues with AST (perfect preservation)
 */
export function parseKvWithAST(
  content: string,
  options?: ASTParseOptions,
): ParseResult {
  return KvParser.parseWithAST(content, options);
}

/**
 * Parse KeyValues file with AST (perfect preservation)
 */
export function parseKvFileWithAST(
  filePath: string,
  options?: ASTParseOptions,
): ParseResult {
  return KvParser.parseFileWithAST(filePath, options);
}
