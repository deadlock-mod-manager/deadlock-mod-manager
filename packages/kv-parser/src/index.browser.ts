/**
 * Browser-compatible exports for @deadlock-mods/kv-parser
 *
 * This entry point excludes file system operations (parseKvFile, writeKvFile, etc.)
 * and only includes string-based parsing and serialization functions.
 *
 * Use this for browser/web environments.
 */

// Core types
export * from "./ast";
// AST parsing and serialization
export { ASTParser } from "./ast-parser";
export { ASTSerializer } from "./ast-serializer";
// Diff utilities
export * from "./diff-applicator";
export * from "./diff-generator";
// Serialization
export { KvSerializer } from "./serializer";
export * from "./types";

// Browser-safe parser functions (string-based only)
import type { ASTParseOptions, ParseResult } from "./ast";
import { ASTParser } from "./ast-parser";
import { ASTSerializer } from "./ast-serializer";
import { KvSerializer } from "./serializer";
import type {
  KeyValuesObject,
  KeyValuesValue,
  KvParseOptions,
  KvSerializeOptions,
} from "./types";

/**
 * Parse KeyValues from string with AST (for perfect preservation)
 */
export function parseKvWithAST(
  content: string,
  options?: ASTParseOptions,
): ParseResult {
  return ASTParser.parse(content, options);
}

/**
 * Parse KeyValues from string (data only)
 */
export function parseKv(
  content: string,
  options?: KvParseOptions,
): KeyValuesObject {
  const result = ASTParser.parse(content, {
    preserveComments: false,
    preserveWhitespace: false,
    ...options,
  });
  return result.data;
}

/**
 * Serialize KeyValues object to string
 */
export function serializeKv(
  data: KeyValuesObject,
  options?: KvSerializeOptions,
): string {
  return KvSerializer.serialize(data, options);
}

/**
 * Browser-safe KvDocument class (no file I/O)
 * For loading from files, use the Node.js version or load the file yourself
 * and use loadFromString()
 */
export class KvDocument {
  private data: KeyValuesObject = {};
  private ast?: ParseResult["ast"];
  private serializeOptions: KvSerializeOptions;
  private useAST: boolean;

  constructor(options?: KvSerializeOptions & { useAST?: boolean }) {
    this.serializeOptions = options || {};
    this.useAST = options?.useAST ?? false;
  }

  /**
   * Load from a string
   */
  loadFromString(content: string): void {
    if (this.useAST) {
      const result = parseKvWithAST(content);
      this.data = result.data;
      this.ast = result.ast;
    } else {
      this.data = parseKv(content);
    }
  }

  /**
   * Get the entire data object
   */
  getData(): KeyValuesObject {
    return this.data;
  }

  /**
   * Get a value by path (e.g., "GameInfo.game")
   */
  get(path: string): KeyValuesValue | undefined {
    const parts = path.split(".");
    let current: KeyValuesValue = this.data;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      if (typeof current !== "object" || Array.isArray(current)) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Set a value by path (e.g., "GameInfo.game")
   * Creates intermediate objects if they don't exist
   */
  set(path: string, value: KeyValuesValue): void {
    const parts = path.split(".");
    const lastPart = parts.pop();

    if (!lastPart) {
      throw new Error("Invalid path");
    }

    let current: KeyValuesObject = this.data;

    // Navigate/create path
    for (const part of parts) {
      if (!(part in current)) {
        current[part] = {};
      }

      const next = current[part];
      if (typeof next !== "object" || next === null || Array.isArray(next)) {
        throw new Error(
          `Cannot set property on non-object value at path: ${parts.join(".")}`,
        );
      }

      current = next as KeyValuesObject;
    }

    // Set the value
    current[lastPart] = value;
  }

  /**
   * Delete a value by path
   */
  delete(path: string): boolean {
    const parts = path.split(".");
    const lastPart = parts.pop();

    if (!lastPart) {
      return false;
    }

    let current: KeyValuesValue = this.data;

    // Navigate to parent
    for (const part of parts) {
      if (
        typeof current !== "object" ||
        current === null ||
        Array.isArray(current)
      ) {
        return false;
      }
      if (!(part in current)) {
        return false;
      }
      current = current[part];
    }

    // Delete the key
    if (
      typeof current === "object" &&
      current !== null &&
      !Array.isArray(current)
    ) {
      if (lastPart in current) {
        delete current[lastPart];
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a path exists
   */
  has(path: string): boolean {
    return this.get(path) !== undefined;
  }

  /**
   * Export as string
   */
  toString(): string {
    if (this.useAST && this.ast) {
      return ASTSerializer.serialize(this.ast);
    }
    return serializeKv(this.data, this.serializeOptions);
  }

  /**
   * Get the AST (if available)
   */
  getAST(): ParseResult["ast"] | undefined {
    return this.ast;
  }

  /**
   * Export as JSON string
   */
  toJSON(): string {
    return JSON.stringify(this.data, null, 2);
  }

  /**
   * Get all keys at a given path
   */
  keys(path?: string): string[] {
    if (!path) {
      return Object.keys(this.data);
    }

    const value = this.get(path);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value);
    }

    return [];
  }

  /**
   * Get all values at a given path
   */
  values(path?: string): KeyValuesValue[] {
    if (!path) {
      return Object.values(this.data);
    }

    const value = this.get(path);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.values(value);
    }

    return [];
  }

  /**
   * Get all entries [key, value] at a given path
   */
  entries(path?: string): [string, KeyValuesValue][] {
    if (!path) {
      return Object.entries(this.data);
    }

    const value = this.get(path);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.entries(value);
    }

    return [];
  }

  /**
   * Merge another object into the document at a given path
   */
  merge(path: string | undefined, obj: KeyValuesObject): void {
    if (!path) {
      // Merge at root
      this.data = { ...this.data, ...obj };
      return;
    }

    const target = this.get(path);
    if (!target || typeof target !== "object" || Array.isArray(target)) {
      throw new Error(`Cannot merge into non-object at path: ${path}`);
    }

    Object.assign(target, obj);
  }

  /**
   * Clone the document
   */
  clone(): KvDocument {
    const cloned = new KvDocument(this.serializeOptions);
    cloned.data = JSON.parse(JSON.stringify(this.data));
    return cloned;
  }

  /**
   * Reset the document to empty state
   */
  clear(): void {
    this.data = {};
    this.ast = undefined;
  }
}
