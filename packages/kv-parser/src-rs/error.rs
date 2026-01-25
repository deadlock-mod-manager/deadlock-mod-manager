use thiserror::Error;

pub type Result<T> = std::result::Result<T, KvError>;

#[derive(Debug, Error)]
pub enum KvError {
    #[error("Parse error at line {line}, column {column}: {message}")]
    ParseError {
        line: usize,
        column: usize,
        message: String,
    },

    #[error("Tokenization error at line {line}, column {column}: {message}")]
    TokenError {
        line: usize,
        column: usize,
        message: String,
    },

    #[error("Unexpected end of input at line {line}, column {column}")]
    UnexpectedEof { line: usize, column: usize },

    #[error("Unterminated string at line {line}, column {column}")]
    UnterminatedString { line: usize, column: usize },

    #[error("Invalid escape sequence at line {line}, column {column}")]
    InvalidEscapeSequence { line: usize, column: usize },

    #[error("Token exceeds maximum length of {max_length} at line {line}, column {column}")]
    TokenTooLong {
        line: usize,
        column: usize,
        max_length: usize,
    },

    #[error("Unknown directive '{directive}' at line {line}, column {column}")]
    UnknownDirective {
        directive: String,
        line: usize,
        column: usize,
    },

    #[error("Unexpected character '{character}' at line {line}, column {column}")]
    UnexpectedCharacter {
        character: char,
        line: usize,
        column: usize,
    },

    #[error("Expected {expected} at line {line}, column {column}")]
    ExpectedToken {
        expected: String,
        line: usize,
        column: usize,
    },

    #[error("Invalid path: {path}")]
    InvalidPath { path: String },

    #[error("Diff error: {message}")]
    DiffError { message: String },

    #[error("Path does not exist: {path}")]
    PathNotFound { path: String },

    #[error("Cannot navigate path {path}: {part} is not an object")]
    PathNotObject { path: String, part: String },

    #[error("Cannot set property on non-object value at path: {path}")]
    CannotSetOnNonObject { path: String },

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("Arrays must be handled as duplicate keys, not serialized directly")]
    ArraySerializationError,

    #[error("Invalid options: {0}")]
    InvalidOptions(String),

    #[error("Invalid buffer")]
    InvalidBuffer,

    #[error("{0}")]
    Other(String),
}
