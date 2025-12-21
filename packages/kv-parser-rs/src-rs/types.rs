use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use ts_rs::TS;

/// KeyValues value type - can be string, number, object, or array
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/")]
#[serde(untagged)]
pub enum KeyValuesValue {
    String(String),
    Number(f64),
    Object(KeyValuesObject),
    Array(Vec<KeyValuesValue>),
}

/// KeyValues object - a map of string keys to values
pub type KeyValuesObject = HashMap<String, KeyValuesValue>;

/// Position in source file
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct Position {
    /// Byte offset from start of file
    pub offset: usize,
    /// Line number (1-indexed)
    pub line: usize,
    /// Column number (0-indexed)
    pub column: usize,
}

/// Token types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/")]
pub enum TokenType {
    String,
    OpenBrace,
    CloseBrace,
    Comment,
    Whitespace,
    Conditional,
    Include,
    Base,
    Eof,
    Error,
}

/// Token with metadata
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct Token {
    #[ts(rename = "type")]
    pub token_type: TokenType,
    pub value: String,
    pub line: usize,
    pub column: usize,
    pub offset: usize,
    pub raw: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<TokenMetadata>,
}

/// Token metadata
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct TokenMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quoted: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quote_char: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment_style: Option<CommentStyle>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/")]
#[serde(rename_all = "lowercase")]
pub enum CommentStyle {
    Line,
    Block,
}

/// Parse options
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ParseOptions {
    #[serde(default = "default_true")]
    pub allow_escape_sequences: bool,
    #[serde(default = "default_true")]
    pub allow_conditionals: bool,
    #[serde(default = "default_true")]
    pub allow_includes: bool,
}

impl Default for ParseOptions {
    fn default() -> Self {
        Self {
            allow_escape_sequences: true,
            allow_conditionals: true,
            allow_includes: true,
        }
    }
}

fn default_true() -> bool {
    true
}

/// Serialize options
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct SerializeOptions {
    #[serde(default = "default_indent_size")]
    pub indent_size: usize,
    #[serde(default)]
    pub use_tabs: bool,
    #[serde(default)]
    pub quote_all_strings: bool,
    #[serde(default = "default_true")]
    pub minimize_quotes: bool,
}

impl Default for SerializeOptions {
    fn default() -> Self {
        Self {
            indent_size: default_indent_size(),
            use_tabs: false,
            quote_all_strings: false,
            minimize_quotes: default_true(),
        }
    }
}

fn default_indent_size() -> usize {
    4
}

/// Parse result containing both data and AST
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ParseResult {
    pub data: KeyValuesObject,
    pub ast: DocumentNode,
}

/// Diff operation type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/")]
#[serde(rename_all = "lowercase")]
pub enum DiffOp {
    Add,
    Remove,
    Replace,
}

/// Comment position relative to a path
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum CommentPosition {
    Before,
    After,
}

/// Single diff entry
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct DiffEntry {
    pub op: DiffOp,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_value: Option<KeyValuesValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_value: Option<KeyValuesValue>,
    /// Comment text to add/remove (for comment operations)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// Position where comment should be inserted relative to path
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment_position: Option<CommentPosition>,
}

/// Document diff
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct DocumentDiff {
    pub changes: Vec<DiffEntry>,
}

/// Diff statistics
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct DiffStats {
    pub total: usize,
    pub added: usize,
    pub removed: usize,
    pub modified: usize,
}

// AST Node types

/// Base node type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/")]
#[serde(rename_all = "lowercase")]
pub enum NodeType {
    Document,
    KeyValue,
    Object,
    String,
    Number,
    Comment,
    Whitespace,
    Conditional,
    Token,
}

/// Document node (root)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct DocumentNode {
    #[ts(rename = "type")]
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub start: Position,
    pub end: Position,
    pub raw: String,
    pub children: Vec<AstNode>,
}

/// Key-value pair node
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct KeyValueNode {
    #[ts(rename = "type")]
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub start: Position,
    pub end: Position,
    pub raw: String,
    pub key: StringNode,
    pub value: ValueNode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub separator: Option<WhitespaceNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conditional_separator: Option<WhitespaceNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conditional: Option<ConditionalNode>,
}

/// Object/block node
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ObjectNode {
    #[ts(rename = "type")]
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub start: Position,
    pub end: Position,
    pub raw: String,
    pub open_brace: TokenNode,
    pub children: Vec<AstNode>,
    pub close_brace: TokenNode,
}

/// String literal node
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct StringNode {
    #[ts(rename = "type")]
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub start: Position,
    pub end: Position,
    pub raw: String,
    pub value: String,
    pub quoted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quote_char: Option<String>,
}

/// Number literal node
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct NumberNode {
    #[ts(rename = "type")]
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub start: Position,
    pub end: Position,
    pub raw: String,
    pub value: f64,
    pub is_float: bool,
}

/// Comment node
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CommentNode {
    #[ts(rename = "type")]
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub start: Position,
    pub end: Position,
    pub raw: String,
    pub value: String,
    pub style: CommentStyle,
}

/// Whitespace node
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct WhitespaceNode {
    #[ts(rename = "type")]
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub start: Position,
    pub end: Position,
    pub raw: String,
    pub value: String,
}

/// Conditional node
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ConditionalNode {
    #[ts(rename = "type")]
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub start: Position,
    pub end: Position,
    pub raw: String,
    pub condition: String,
    pub negated: bool,
}

/// Token node
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct TokenNode {
    #[ts(rename = "type")]
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub start: Position,
    pub end: Position,
    pub raw: String,
    pub token_type: String,
    pub value: String,
}

/// Value node (can be string, number, or object)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/")]
#[serde(untagged)]
pub enum ValueNode {
    String(StringNode),
    Number(NumberNode),
    Object(Box<ObjectNode>),
}

/// AST node (can be any node type)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/")]
#[serde(untagged)]
pub enum AstNode {
    KeyValue(Box<KeyValueNode>),
    Comment(CommentNode),
    Whitespace(WhitespaceNode),
    Conditional(ConditionalNode),
}
