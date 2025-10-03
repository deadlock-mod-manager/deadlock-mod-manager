/**
 * AST (Abstract Syntax Tree) types for KeyValues format
 *
 * This provides perfect fidelity preservation of the original file:
 * - Position tracking for every node
 * - Raw text preservation (comments, whitespace, quote style)
 * - Modification tracking for surgical edits
 */

import type { KeyValuesObject, KeyValuesValue } from "./types";

/**
 * Position in the source file
 */
export interface Position {
  /** Byte offset from start of file */
  offset: number;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (0-indexed) */
  column: number;
}

/**
 * Base interface for all AST nodes
 */
export interface ASTNode {
  /** Node type discriminator */
  type: string;
  /** Start position in source */
  start: Position;
  /** End position in source */
  end: Position;
  /** Raw text as it appeared in source */
  raw: string;
}

/**
 * Root document node
 */
export interface DocumentNode extends ASTNode {
  type: "document";
  /** Child nodes (can be key-value pairs, comments, whitespace, conditionals) */
  children: (KeyValueNode | CommentNode | WhitespaceNode | ConditionalNode)[];
}

/**
 * Key-value pair node
 * Can be: "key" "value" OR "key" { ... }
 * Optionally followed by a conditional: "key" "value" [ $CONDITION ]
 */
export interface KeyValueNode extends ASTNode {
  type: "keyvalue";
  /** The key */
  key: StringNode;
  /** The value (can be string, number, or object) */
  value: StringNode | NumberNode | ObjectNode;
  /** Whitespace/formatting between key and value */
  separator?: WhitespaceNode;
  /** Optional whitespace before the conditional */
  conditionalSeparator?: WhitespaceNode;
  /** Optional conditional attached to this key-value pair */
  conditional?: ConditionalNode;
}

/**
 * Object/block node: { ... }
 */
export interface ObjectNode extends ASTNode {
  type: "object";
  /** Child nodes inside the braces */
  children: (KeyValueNode | CommentNode | WhitespaceNode | ConditionalNode)[];
  /** Opening brace token */
  openBrace: TokenNode;
  /** Closing brace token */
  closeBrace: TokenNode;
}

/**
 * String literal node
 */
export interface StringNode extends ASTNode {
  type: "string";
  /** The parsed/unescaped string value */
  value: string;
  /** Whether the string was quoted in source */
  quoted: boolean;
  /** Quote character used (" or none) */
  quoteChar?: string;
}

/**
 * Number literal node
 */
export interface NumberNode extends ASTNode {
  type: "number";
  /** The numeric value */
  value: number;
  /** Whether it's an integer or float */
  isFloat: boolean;
}

/**
 * Comment node (// or /* \*\/)
 */
export interface CommentNode extends ASTNode {
  type: "comment";
  /** Comment text (without // or /* *\/) */
  value: string;
  /** Comment style */
  style: "line" | "block";
}

/**
 * Whitespace node (spaces, tabs, newlines)
 */
export interface WhitespaceNode extends ASTNode {
  type: "whitespace";
  /** The whitespace characters */
  value: string;
}

/**
 * Conditional node ([$WIN32], [$X360], etc.)
 */
export interface ConditionalNode extends ASTNode {
  type: "conditional";
  /** Condition string (e.g., "$WIN32") */
  condition: string;
  /** Whether it's negated ([!$WIN32]) */
  negated: boolean;
}

/**
 * Include/base directive node (#include, #base)
 */
export interface IncludeNode extends ASTNode {
  type: "include";
  /** Directive type */
  directive: "include" | "base";
  /** File path to include */
  path: StringNode;
}

/**
 * Token node (for preserving exact token representation)
 */
export interface TokenNode extends ASTNode {
  type: "token";
  /** Token type */
  tokenType: string;
  /** Token value */
  value: string;
}

/**
 * Modification tracking for a node
 */
export interface NodeModification {
  /** Node that was modified */
  node: ASTNode;
  /** Type of modification */
  modificationType: "insert" | "update" | "delete";
  /** Original value (for update/delete) */
  originalValue?: string | number | boolean | null | KeyValuesValue;
  /** New value (for insert/update) */
  newValue?: string | number | boolean | null | KeyValuesValue;
  /** Timestamp of modification */
  timestamp: number;
}

/**
 * Diff entry for a single change
 */
export interface DiffEntry {
  /** Type of operation */
  op: "add" | "remove" | "replace";
  /** Path to the changed value (dot-separated) */
  path: string;
  /** Old value (for remove/replace) */
  oldValue?: string | number | boolean | null | KeyValuesValue;
  /** New value (for add/replace) */
  newValue?: string | number | boolean | null | KeyValuesValue;
  /** Position in source (for surgical updates) */
  position?: {
    start: Position;
    end: Position;
  };
}

/**
 * Diff between two documents
 */
export interface DocumentDiff {
  /** List of changes */
  changes: DiffEntry[];
  /** Source document AST */
  sourceAst: DocumentNode;
  /** Target document AST (if available) */
  targetAst?: DocumentNode;
}

/**
 * Visitor pattern for traversing AST
 */
export interface ASTVisitor {
  visitDocument?(node: DocumentNode): void;
  visitKeyValue?(node: KeyValueNode): void;
  visitObject?(node: ObjectNode): void;
  visitString?(node: StringNode): void;
  visitNumber?(node: NumberNode): void;
  visitComment?(node: CommentNode): void;
  visitWhitespace?(node: WhitespaceNode): void;
  visitConditional?(node: ConditionalNode): void;
  visitInclude?(node: IncludeNode): void;
}

/**
 * Options for AST parsing
 */
export interface ASTParseOptions {
  /** Preserve comments in AST (default: true) */
  preserveComments?: boolean;
  /** Preserve whitespace in AST (default: true) */
  preserveWhitespace?: boolean;
  /** Track positions (default: true) */
  trackPositions?: boolean;
  /** Allow escape sequences */
  allowEscapeSequences?: boolean;
  /** Allow conditionals */
  allowConditionals?: boolean;
  /** Allow includes */
  allowIncludes?: boolean;
}

/**
 * Result of parsing with AST
 */
export interface ParseResult {
  /** The parsed data object */
  data: KeyValuesObject;
  /** The AST representation */
  ast: DocumentNode;
  /** Any modifications tracked during parse */
  modifications?: NodeModification[];
}
