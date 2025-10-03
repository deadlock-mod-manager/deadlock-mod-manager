import type { DocumentNode, ParseResult } from "./ast";
import type {
  KeyValuesObject,
  KeyValuesValue,
  KvSerializeOptions,
} from "./types";

/**
 * Base KeyValues Document class with shared functionality
 * This class contains all the common methods between browser and Node.js versions
 */
export abstract class KvDocumentBase {
  protected data: KeyValuesObject = {};
  protected ast?: DocumentNode | ParseResult["ast"];
  protected serializeOptions: KvSerializeOptions;
  protected useAST: boolean;

  constructor(options?: KvSerializeOptions & { useAST?: boolean }) {
    this.serializeOptions = options || {};
    this.useAST = options?.useAST ?? false;
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
   * Get the AST (if available)
   */
  getAST(): DocumentNode | ParseResult["ast"] | undefined {
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
   * Export as string - must be implemented by subclasses
   */
  abstract toString(): string;

  /**
   * Clone the document - must be implemented by subclasses
   */
  abstract clone(): KvDocumentBase;

  /**
   * Reset the document to empty state - must be implemented by subclasses
   */
  abstract clear(): void;
}
