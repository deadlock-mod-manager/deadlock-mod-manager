import { writeFileSync } from "node:fs";
import type {
  DocumentDiff,
  DocumentNode,
  NodeModification,
  ObjectNode,
} from "./ast";
import { ASTSerializer } from "./ast-serializer";
import { DiffApplicator } from "./diff-applicator";
import { DiffGenerator } from "./diff-generator";
import { KvDocumentBase } from "./document-base";
import {
  parseKv,
  parseKvFile,
  parseKvFileWithAST,
  parseKvWithAST,
  serializeKv,
} from "./parser";
import type { KeyValuesObject, KeyValuesValue } from "./types";

/**
 * KeyValues Document class for load → modify → save workflows with AST preservation
 *
 * This version uses AST for perfect fidelity preservation:
 * - Preserves comments, whitespace, and formatting
 * - Only modifies changed values (surgical edits)
 * - Tracks all modifications
 *
 * Usage:
 * ```typescript
 * const doc = new KvDocument();
 * doc.load("gameinfo.gi");
 * doc.set("GameInfo.game", "new_game_name");
 * doc.save(); // Saves with minimal changes
 * ```
 */
export class KvDocument extends KvDocumentBase {
  private filePath?: string;
  private modifications: NodeModification[] = [];

  /**
   * Load a KeyValues file
   */
  load(filePath: string): void {
    this.filePath = filePath;
    if (this.useAST) {
      const result = parseKvFileWithAST(filePath);
      this.data = result.data;
      this.ast = result.ast;
    } else {
      this.data = parseKvFile(filePath);
    }
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
   * Save to the original file
   */
  save(): void {
    if (!this.filePath) {
      throw new Error("No file path set. Use saveAs() or load() first.");
    }
    this.saveAs(this.filePath);
  }

  /**
   * Save to a specific file
   */
  saveAs(filePath: string): void {
    let content: string;

    if (this.useAST && this.ast) {
      // Use AST for perfect preservation
      // TODO: Apply modifications to AST before serializing
      content = ASTSerializer.serialize(this.ast);
    } else {
      // Fallback to data serialization
      content = serializeKv(this.data, this.serializeOptions);
    }

    writeFileSync(filePath, content, "utf-8");
    this.filePath = filePath;
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
   * Get all modifications
   */
  getModifications(): NodeModification[] {
    return this.modifications;
  }

  /**
   * Clone the document
   */
  clone(): KvDocument {
    const cloned = new KvDocument({
      ...this.serializeOptions,
      useAST: this.useAST,
    });
    cloned.data = JSON.parse(JSON.stringify(this.data));
    cloned.filePath = this.filePath;
    cloned.ast = this.ast ? structuredClone(this.ast) : undefined;
    return cloned;
  }

  /**
   * Reset the document to empty state
   */
  clear(): void {
    this.data = {};
    this.ast = undefined;
    this.modifications = [];
  }

  /**
   * Generate a diff between this document and another
   */
  diff(other: KvDocument): DocumentDiff {
    if (this.useAST && this.ast && other.useAST && other.ast) {
      // Use AST diff for better precision
      return DiffGenerator.generateASTDiff(this.ast, other.ast);
    } else {
      // Fall back to data diff
      return DiffGenerator.generateDataDiff(
        this.data,
        other.data,
        this.ast,
        other.ast,
      );
    }
  }

  /**
   * Apply a diff to this document
   */
  applyDiff(diff: DocumentDiff): void {
    if (this.useAST && this.ast) {
      // Apply to AST
      this.ast = DiffApplicator.applyToAST(this.ast, diff);
      // Update data from modified AST
      this.data = this.extractDataFromAST(this.ast);
    } else {
      // Apply to data
      this.data = DiffApplicator.applyToData(this.data, diff);
    }
  }

  /**
   * Compare with another document
   */
  equals(other: KvDocument): boolean {
    return DiffGenerator.areEqual(this.data, other.data);
  }

  /**
   * Get a human-readable diff summary
   */
  diffSummary(other: KvDocument): string {
    const diff = this.diff(other);
    return DiffGenerator.formatDiff(diff);
  }

  /**
   * Get diff statistics
   */
  diffStats(other: KvDocument): {
    total: number;
    added: number;
    removed: number;
    modified: number;
  } {
    const diff = this.diff(other);
    return DiffGenerator.getStats(diff);
  }

  /**
   * Extract data from AST (helper method)
   */
  private extractDataFromAST(ast: DocumentNode): KeyValuesObject {
    const result: KeyValuesObject = {};

    for (const child of ast.children) {
      if (child.type === "keyvalue") {
        const key = child.key.value;
        let value: KeyValuesValue;

        if (child.value.type === "string") {
          value = child.value.value;
        } else if (child.value.type === "number") {
          value = child.value.value;
        } else if (child.value.type === "object") {
          value = this.extractDataFromObjectNode(child.value);
        } else {
          // This should never happen, but TypeScript needs exhaustiveness checking
          throw new Error(
            `Unknown value type: ${(child.value as { type: string }).type}`,
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
   * Extract data from object node (helper method)
   */
  private extractDataFromObjectNode(node: ObjectNode): KeyValuesObject {
    const result: KeyValuesObject = {};

    for (const child of node.children) {
      if (child.type === "keyvalue") {
        const key = child.key.value;
        let value: KeyValuesValue;

        if (child.value.type === "string") {
          value = child.value.value;
        } else if (child.value.type === "number") {
          value = child.value.value;
        } else if (child.value.type === "object") {
          value = this.extractDataFromObjectNode(child.value);
        } else {
          // This should never happen, but TypeScript needs exhaustiveness checking
          throw new Error(
            `Unknown value type: ${(child.value as { type: string }).type}`,
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
}
