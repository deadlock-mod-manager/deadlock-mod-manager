import type {
  DiffEntry,
  DocumentDiff,
  DocumentNode,
  KeyValueNode,
  NumberNode,
  ObjectNode,
  StringNode,
  WhitespaceNode,
} from "./ast";
import type { KeyValuesObject, KeyValuesValue } from "./types";

export class DiffApplicator {
  /**
   * Apply a diff to a data object (creates a new object)
   */
  public static applyToData(
    source: KeyValuesObject,
    diff: DocumentDiff,
  ): KeyValuesObject {
    // Deep clone the source
    const result = JSON.parse(JSON.stringify(source));

    // Apply each change
    for (const change of diff.changes) {
      DiffApplicator.applyChange(result, change);
    }

    return result;
  }

  /**
   * Apply a single change to a data object
   */
  private static applyChange(data: KeyValuesObject, change: DiffEntry): void {
    const pathParts = change.path.split(".");
    const lastKey = pathParts.pop();

    if (!lastKey) {
      throw new Error(`Invalid path: ${change.path}`);
    }

    // Navigate to the parent object
    let current: KeyValuesObject = data;
    for (const part of pathParts) {
      if (!(part in current)) {
        // Create intermediate objects if they don't exist
        current[part] = {};
      }

      const next = current[part];
      if (typeof next !== "object" || next === null || Array.isArray(next)) {
        throw new Error(
          `Cannot navigate path ${change.path}: ${part} is not an object`,
        );
      }

      current = next as KeyValuesObject;
    }

    // Apply the operation
    switch (change.op) {
      case "add":
      case "replace":
        current[lastKey] = change.newValue as KeyValuesValue;
        break;

      case "remove":
        delete current[lastKey];
        break;

      default:
        throw new Error(`Unknown operation: ${(change as { op: string }).op}`);
    }
  }

  /**
   * Apply a diff to an AST (creates a modified AST)
   * This is more complex as it needs to preserve formatting
   */
  public static applyToAST(
    sourceAst: DocumentNode,
    diff: DocumentDiff,
  ): DocumentNode {
    // Deep clone the AST
    const resultAst = DiffApplicator.cloneAST(sourceAst);

    // Apply each change
    for (const change of diff.changes) {
      DiffApplicator.applyChangeToAST(resultAst, change);
    }

    return resultAst;
  }

  /**
   * Apply a single change to an AST node
   */
  private static applyChangeToAST(ast: DocumentNode, change: DiffEntry): void {
    const pathParts = change.path.split(".");

    // Find the target node
    const { parent, key } = DiffApplicator.findNodeByPath(ast, pathParts);

    if (!parent) {
      throw new Error(`Cannot find path: ${change.path}`);
    }

    switch (change.op) {
      case "replace":
        // Find and update the key-value node
        DiffApplicator.updateKeyValueInAST(
          parent,
          key,
          change.newValue as KeyValuesValue,
        );
        break;

      case "add":
        // Add a new key-value node
        DiffApplicator.addKeyValueToAST(
          parent,
          key,
          change.newValue as KeyValuesValue,
        );
        break;

      case "remove":
        // Remove the key-value node
        DiffApplicator.removeKeyValueFromAST(parent, key);
        break;
    }
  }

  /**
   * Find a node by path in the AST
   */
  private static findNodeByPath(
    ast: DocumentNode,
    pathParts: string[],
  ): { parent: ObjectNode | DocumentNode | null; key: string } {
    if (pathParts.length === 0) {
      return { parent: null, key: "" };
    }

    let current: ObjectNode | DocumentNode = ast;
    const key = pathParts[pathParts.length - 1];

    // Navigate to the parent
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      const kvNode = current.children.find(
        (child) =>
          child.type === "keyvalue" &&
          (child as KeyValueNode).key.value === part,
      ) as KeyValueNode | undefined;

      if (!kvNode || kvNode.value.type !== "object") {
        return { parent: null, key };
      }

      current = kvNode.value as ObjectNode;
    }

    return { parent: current, key };
  }

  /**
   * Update a key-value in an AST node
   */
  private static updateKeyValueInAST(
    parent: ObjectNode | DocumentNode,
    key: string,
    newValue: KeyValuesValue,
  ): void {
    // Find the key-value node
    const kvIndex = parent.children.findIndex(
      (child) =>
        child.type === "keyvalue" && (child as KeyValueNode).key.value === key,
    );

    if (kvIndex === -1) {
      throw new Error(`Key not found: ${key}`);
    }

    const kvNode = parent.children[kvIndex] as KeyValueNode;

    // Update the value while preserving structure
    if (typeof newValue === "string") {
      if (kvNode.value.type === "string") {
        // Update in place
        (kvNode.value as StringNode).value = newValue;
        (kvNode.value as StringNode).raw =
          DiffApplicator.formatString(newValue);
      } else {
        // Replace with string node
        kvNode.value = DiffApplicator.createStringNode(newValue);
      }
    } else if (typeof newValue === "number") {
      if (kvNode.value.type === "number") {
        // Update in place
        (kvNode.value as NumberNode).value = newValue;
        (kvNode.value as NumberNode).raw = newValue.toString();
      } else {
        // Replace with number node
        kvNode.value = DiffApplicator.createNumberNode(newValue);
      }
    } else if (typeof newValue === "object" && !Array.isArray(newValue)) {
      // Update object - this is complex, for now replace
      kvNode.value = DiffApplicator.createObjectNode(newValue);
    }
  }

  /**
   * Add a key-value to an AST node
   */
  private static addKeyValueToAST(
    parent: ObjectNode | DocumentNode,
    key: string,
    value: KeyValuesValue,
  ): void {
    // Create a new key-value node
    const kvNode: KeyValueNode = {
      type: "keyvalue",
      key: DiffApplicator.createStringNode(key),
      value: DiffApplicator.createValueNode(value),
      start: { offset: 0, line: 0, column: 0 },
      end: { offset: 0, line: 0, column: 0 },
      raw: "",
      separator: DiffApplicator.createWhitespaceNode("    "),
    };

    // Add to children
    parent.children.push(kvNode);
  }

  /**
   * Remove a key-value from an AST node
   */
  private static removeKeyValueFromAST(
    parent: ObjectNode | DocumentNode,
    key: string,
  ): void {
    const kvIndex = parent.children.findIndex(
      (child) =>
        child.type === "keyvalue" && (child as KeyValueNode).key.value === key,
    );

    if (kvIndex !== -1) {
      parent.children.splice(kvIndex, 1);
    }
  }

  /**
   * Create a string node
   */
  private static createStringNode(value: string): StringNode {
    const needsQuotes = /[\s{}"]/.test(value) || value.length === 0;
    const raw = needsQuotes ? `"${value}"` : value;

    return {
      type: "string",
      value,
      quoted: needsQuotes,
      quoteChar: needsQuotes ? '"' : undefined,
      start: { offset: 0, line: 0, column: 0 },
      end: { offset: 0, line: 0, column: 0 },
      raw,
    };
  }

  /**
   * Create a number node
   */
  private static createNumberNode(value: number): NumberNode {
    return {
      type: "number",
      value,
      isFloat: !Number.isInteger(value),
      start: { offset: 0, line: 0, column: 0 },
      end: { offset: 0, line: 0, column: 0 },
      raw: value.toString(),
    };
  }

  /**
   * Create an object node
   */
  private static createObjectNode(data: KeyValuesObject): ObjectNode {
    const children: (KeyValueNode | WhitespaceNode)[] = [];

    for (const [key, value] of Object.entries(data)) {
      const kvNode: KeyValueNode = {
        type: "keyvalue",
        key: DiffApplicator.createStringNode(key),
        value: DiffApplicator.createValueNode(value),
        start: { offset: 0, line: 0, column: 0 },
        end: { offset: 0, line: 0, column: 0 },
        raw: "",
        separator: DiffApplicator.createWhitespaceNode("    "),
      };
      children.push(kvNode);
    }

    return {
      type: "object",
      children,
      openBrace: {
        type: "token",
        tokenType: "OPEN_BRACE",
        value: "{",
        start: { offset: 0, line: 0, column: 0 },
        end: { offset: 0, line: 0, column: 0 },
        raw: "{",
      },
      closeBrace: {
        type: "token",
        tokenType: "CLOSE_BRACE",
        value: "}",
        start: { offset: 0, line: 0, column: 0 },
        end: { offset: 0, line: 0, column: 0 },
        raw: "}",
      },
      start: { offset: 0, line: 0, column: 0 },
      end: { offset: 0, line: 0, column: 0 },
      raw: "",
    };
  }

  /**
   * Create a value node based on type
   */
  private static createValueNode(
    value: KeyValuesValue,
  ): StringNode | NumberNode | ObjectNode {
    if (typeof value === "string") {
      return DiffApplicator.createStringNode(value);
    } else if (typeof value === "number") {
      return DiffApplicator.createNumberNode(value);
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      return DiffApplicator.createObjectNode(value as KeyValuesObject);
    }

    // Default to string for arrays and other types
    return DiffApplicator.createStringNode(String(value));
  }

  /**
   * Create a whitespace node
   */
  private static createWhitespaceNode(value: string): WhitespaceNode {
    return {
      type: "whitespace",
      value,
      start: { offset: 0, line: 0, column: 0 },
      end: { offset: 0, line: 0, column: 0 },
      raw: value,
    };
  }

  /**
   * Format a string with proper quoting
   */
  private static formatString(value: string): string {
    const needsQuotes = /[\s{}"]/.test(value) || value.length === 0;
    if (needsQuotes) {
      const escaped = value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t");
      return `"${escaped}"`;
    }
    return value;
  }

  /**
   * Deep clone an AST node
   */
  private static cloneAST(node: DocumentNode): DocumentNode {
    return JSON.parse(JSON.stringify(node));
  }

  /**
   * Validate that a diff can be applied
   */
  public static validateDiff(
    source: KeyValuesObject,
    diff: DocumentDiff,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const change of diff.changes) {
      const pathParts = change.path.split(".");

      // Validate remove and replace operations
      if (change.op === "remove" || change.op === "replace") {
        if (!DiffApplicator.pathExists(source, pathParts)) {
          errors.push(`Path does not exist: ${change.path}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if a path exists in data
   */
  private static pathExists(
    data: KeyValuesObject,
    pathParts: string[],
  ): boolean {
    let current: KeyValuesValue = data;

    for (const part of pathParts) {
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

    return true;
  }
}
