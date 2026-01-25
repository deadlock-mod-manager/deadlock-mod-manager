import type { KeyValuesValue } from "./generated/KeyValuesValue";

// Re-export generated types from Rust
export type { AstNode } from "./generated/AstNode";
export type { CommentNode } from "./generated/CommentNode";
export type { CommentStyle } from "./generated/CommentStyle";
export type { ConditionalNode } from "./generated/ConditionalNode";
export type { DiffEntry } from "./generated/DiffEntry";
export type { DiffOp } from "./generated/DiffOp";
export type { DiffStats } from "./generated/DiffStats";
export type { DocumentDiff } from "./generated/DocumentDiff";
export type { DocumentNode } from "./generated/DocumentNode";
export type { KeyValueNode } from "./generated/KeyValueNode";
export type { KeyValuesValue } from "./generated/KeyValuesValue";
export type { NodeType } from "./generated/NodeType";
export type { NumberNode } from "./generated/NumberNode";
export type { ObjectNode } from "./generated/ObjectNode";
export type { ParseOptions } from "./generated/ParseOptions";
export type { ParseResult } from "./generated/ParseResult";
export type { Position } from "./generated/Position";
export type { SerializeOptions } from "./generated/SerializeOptions";
export type { StringNode } from "./generated/StringNode";
export type { Token } from "./generated/Token";
export type { TokenMetadata } from "./generated/TokenMetadata";
export type { TokenNode } from "./generated/TokenNode";
export type { TokenType } from "./generated/TokenType";
export type { ValueNode } from "./generated/ValueNode";
export type { WhitespaceNode } from "./generated/WhitespaceNode";

// Helper type for KeyValuesObject
export type KeyValuesObject = Record<string, KeyValuesValue>;
