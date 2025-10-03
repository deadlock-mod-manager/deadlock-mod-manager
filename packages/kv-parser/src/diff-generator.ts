/**
 * Diff Generator - Generates diffs between two KeyValues documents
 *
 * This generates surgical diffs that can be applied to preserve formatting
 */

import type {
  DiffEntry,
  DocumentDiff,
  DocumentNode,
  KeyValueNode,
  ObjectNode,
} from "./ast";
import type { KeyValuesObject, KeyValuesValue } from "./types";

export class DiffGenerator {
  /**
   * Generate diff between two data objects
   */
  public static generateDataDiff(
    source: KeyValuesObject,
    target: KeyValuesObject,
    sourceAst?: DocumentNode,
    targetAst?: DocumentNode,
  ): DocumentDiff {
    const changes: DiffEntry[] = [];

    // Compare objects recursively
    DiffGenerator.compareObjects(source, target, "", changes);

    return {
      changes,
      sourceAst: sourceAst || DiffGenerator.createEmptyDocument(),
      targetAst,
    };
  }

  /**
   * Generate diff between two AST documents
   */
  public static generateASTDiff(
    source: DocumentNode,
    target: DocumentNode,
  ): DocumentDiff {
    const changes: DiffEntry[] = [];

    // Extract data from ASTs
    const sourceData = DiffGenerator.astToData(source);
    const targetData = DiffGenerator.astToData(target);

    // Compare the data
    DiffGenerator.compareObjects(sourceData, targetData, "", changes);

    return {
      changes,
      sourceAst: source,
      targetAst: target,
    };
  }

  /**
   * Compare two objects recursively and generate diff entries
   */
  private static compareObjects(
    source: KeyValuesValue,
    target: KeyValuesValue,
    path: string,
    changes: DiffEntry[],
  ): void {
    // Handle null/undefined
    if (source === null || source === undefined) {
      if (target !== null && target !== undefined) {
        changes.push({
          op: "add",
          path,
          newValue: target,
        });
      }
      return;
    }

    if (target === null || target === undefined) {
      changes.push({
        op: "remove",
        path,
        oldValue: source,
      });
      return;
    }

    // Handle arrays (duplicate keys)
    if (Array.isArray(source) || Array.isArray(target)) {
      if (!Array.isArray(source) || !Array.isArray(target)) {
        // Type changed
        changes.push({
          op: "replace",
          path,
          oldValue: source,
          newValue: target,
        });
      } else if (!DiffGenerator.arraysEqual(source, target)) {
        // Arrays differ
        changes.push({
          op: "replace",
          path,
          oldValue: source,
          newValue: target,
        });
      }
      return;
    }

    // Handle objects
    if (typeof source === "object" && typeof target === "object") {
      // Check for removed keys
      for (const key in source) {
        if (!(key in target)) {
          changes.push({
            op: "remove",
            path: path ? `${path}.${key}` : key,
            oldValue: source[key],
          });
        }
      }

      // Check for added or modified keys
      for (const key in target) {
        const sourcePath = path ? `${path}.${key}` : key;

        if (!(key in source)) {
          // Added
          changes.push({
            op: "add",
            path: sourcePath,
            newValue: target[key],
          });
        } else if (source[key] !== target[key]) {
          // Check if both are objects or arrays for recursive comparison
          if (
            typeof source[key] === "object" &&
            typeof target[key] === "object"
          ) {
            DiffGenerator.compareObjects(
              source[key],
              target[key],
              sourcePath,
              changes,
            );
          } else {
            // Values differ
            changes.push({
              op: "replace",
              path: sourcePath,
              oldValue: source[key],
              newValue: target[key],
            });
          }
        }
      }
      return;
    }

    // Primitive values
    if (source !== target) {
      changes.push({
        op: "replace",
        path,
        oldValue: source,
        newValue: target,
      });
    }
  }

  /**
   * Check if two arrays are equal
   */
  private static arraysEqual(
    a: KeyValuesValue[],
    b: KeyValuesValue[],
  ): boolean {
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
      if (typeof a[i] === "object" && typeof b[i] === "object") {
        if (a[i] === null || b[i] === null) {
          if (a[i] !== b[i]) return false;
        } else if (
          !DiffGenerator.objectsEqual(
            a[i] as KeyValuesObject,
            b[i] as KeyValuesObject,
          )
        ) {
          return false;
        }
      } else if (a[i] !== b[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if two objects are equal (deep comparison)
   */
  private static objectsEqual(a: KeyValuesValue, b: KeyValuesValue): boolean {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object") return a === b;
    if (a === null || b === null) return a === b;
    if (Array.isArray(a) && Array.isArray(b)) {
      return DiffGenerator.arraysEqual(a, b);
    }
    if (Array.isArray(a) || Array.isArray(b)) return false;

    const objA = a as KeyValuesObject;
    const objB = b as KeyValuesObject;

    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!(key in objB)) return false;
      if (!DiffGenerator.objectsEqual(objA[key], objB[key])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Convert AST to data object (simplified extraction)
   */
  private static astToData(node: DocumentNode | ObjectNode): KeyValuesObject {
    const result: KeyValuesObject = {};

    for (const child of node.children) {
      if (child.type === "keyvalue") {
        const kvNode = child as KeyValueNode;
        const key = kvNode.key.value;
        let value: KeyValuesValue;

        if (kvNode.value.type === "string") {
          value = kvNode.value.value;
        } else if (kvNode.value.type === "number") {
          value = kvNode.value.value;
        } else if (kvNode.value.type === "object") {
          value = DiffGenerator.astToData(kvNode.value as ObjectNode);
        } else {
          // This should never happen, but TypeScript needs exhaustiveness checking
          throw new Error(
            `Unknown value type: ${(kvNode.value as { type: string }).type}`,
          );
        }

        // Handle duplicate keys
        if (key in result) {
          const existing = result[key];
          if (Array.isArray(existing)) {
            existing.push(value);
          } else {
            result[key] = [existing, value];
          }
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Create an empty document node
   */
  private static createEmptyDocument(): DocumentNode {
    return {
      type: "document",
      start: { offset: 0, line: 1, column: 0 },
      end: { offset: 0, line: 1, column: 0 },
      raw: "",
      children: [],
    };
  }

  /**
   * Generate a human-readable diff summary
   */
  public static formatDiff(diff: DocumentDiff): string {
    if (diff.changes.length === 0) {
      return "No changes";
    }

    let output = `${diff.changes.length} change(s):\n\n`;

    for (const change of diff.changes) {
      switch (change.op) {
        case "add":
          output += `+ Add ${change.path} = ${JSON.stringify(change.newValue)}\n`;
          break;
        case "remove":
          output += `- Remove ${change.path} (was: ${JSON.stringify(change.oldValue)})\n`;
          break;
        case "replace":
          output += `~ Replace ${change.path}\n`;
          output += `  - Old: ${JSON.stringify(change.oldValue)}\n`;
          output += `  + New: ${JSON.stringify(change.newValue)}\n`;
          break;
      }
    }

    return output;
  }

  /**
   * Generate a unified diff format (Git-style)
   */
  public static generateUnifiedDiff(
    diff: DocumentDiff,
    sourceLabel: string = "source",
    targetLabel: string = "target",
  ): string {
    if (diff.changes.length === 0) {
      return "";
    }

    let output = `--- ${sourceLabel}\n`;
    output += `+++ ${targetLabel}\n`;

    for (const change of diff.changes) {
      output += `@@ ${change.path} @@\n`;

      switch (change.op) {
        case "add":
          output += `+${change.path} = ${JSON.stringify(change.newValue)}\n`;
          break;
        case "remove":
          output += `-${change.path} = ${JSON.stringify(change.oldValue)}\n`;
          break;
        case "replace":
          output += `-${change.path} = ${JSON.stringify(change.oldValue)}\n`;
          output += `+${change.path} = ${JSON.stringify(change.newValue)}\n`;
          break;
      }
    }

    return output;
  }

  /**
   * Check if two documents are equal
   */
  public static areEqual(
    source: KeyValuesObject,
    target: KeyValuesObject,
  ): boolean {
    const diff = DiffGenerator.generateDataDiff(source, target);
    return diff.changes.length === 0;
  }

  /**
   * Get statistics about a diff
   */
  public static getStats(diff: DocumentDiff): {
    total: number;
    added: number;
    removed: number;
    modified: number;
  } {
    const stats = {
      total: diff.changes.length,
      added: 0,
      removed: 0,
      modified: 0,
    };

    for (const change of diff.changes) {
      switch (change.op) {
        case "add":
          stats.added++;
          break;
        case "remove":
          stats.removed++;
          break;
        case "replace":
          stats.modified++;
          break;
      }
    }

    return stats;
  }
}
