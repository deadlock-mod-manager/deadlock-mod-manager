use crate::error::{KvError, Result};
use crate::types::{CommentStyle, Token, TokenMetadata, TokenType};

const MAX_TOKEN_LENGTH: usize = 1024;

pub struct Tokenizer {
    input: Vec<char>,
    pos: usize,
    line: usize,
    column: usize,
    allow_escape_sequences: bool,
    allow_conditionals: bool,
    allow_includes: bool,
}

impl Tokenizer {
    pub fn new(input: &str) -> Self {
        Self {
            input: input.chars().collect(),
            pos: 0,
            line: 1,
            column: 1,
            allow_escape_sequences: true,
            allow_conditionals: true,
            allow_includes: true,
        }
    }

    pub fn with_options(
        input: &str,
        allow_escape_sequences: bool,
        allow_conditionals: bool,
        allow_includes: bool,
    ) -> Self {
        Self {
            input: input.chars().collect(),
            pos: 0,
            line: 1,
            column: 1,
            allow_escape_sequences,
            allow_conditionals,
            allow_includes,
        }
    }

    fn current_char(&self) -> Option<char> {
        if self.pos < self.input.len() {
            Some(self.input[self.pos])
        } else {
            None
        }
    }

    fn peek(&self, offset: usize) -> Option<char> {
        let peek_pos = self.pos + offset;
        if peek_pos < self.input.len() {
            Some(self.input[peek_pos])
        } else {
            None
        }
    }

    fn advance(&mut self) {
        if let Some(ch) = self.current_char() {
            if ch == '\n' {
                self.line += 1;
                self.column = 1;
            } else {
                self.column += 1;
            }
            self.pos += 1;
        }
    }

    fn is_whitespace(ch: char) -> bool {
        ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r'
    }

    fn read_whitespace(&mut self) -> Token {
        let start_line = self.line;
        let start_column = self.column;
        let start_offset = self.pos;
        let mut value = String::new();

        while let Some(ch) = self.current_char() {
            if Self::is_whitespace(ch) {
                value.push(ch);
                self.advance();
            } else {
                break;
            }
        }

        Token {
            token_type: TokenType::Whitespace,
            value: value.clone(),
            line: start_line,
            column: start_column,
            offset: start_offset,
            raw: value,
            metadata: None,
        }
    }

    fn read_single_line_comment(&mut self) -> Token {
        let start_line = self.line;
        let start_column = self.column;
        let start_offset = self.pos;

        let mut raw = String::from("//");
        self.advance(); // Skip first /
        self.advance(); // Skip second /

        let mut value = String::new();
        while let Some(ch) = self.current_char() {
            if ch == '\n' {
                break;
            }
            value.push(ch);
            raw.push(ch);
            self.advance();
        }

        Token {
            token_type: TokenType::Comment,
            value,
            line: start_line,
            column: start_column,
            offset: start_offset,
            raw,
            metadata: Some(TokenMetadata {
                quoted: None,
                quote_char: None,
                comment_style: Some(CommentStyle::Line),
            }),
        }
    }

    fn read_multi_line_comment(&mut self) -> Result<Token> {
        let start_line = self.line;
        let start_column = self.column;
        let start_offset = self.pos;

        let mut raw = String::from("/*");
        self.advance(); // Skip /
        self.advance(); // Skip *

        let mut value = String::new();
        while let Some(ch) = self.current_char() {
            if ch == '*' && self.peek(1) == Some('/') {
                raw.push_str("*/");
                self.advance(); // Skip *
                self.advance(); // Skip /
                break;
            }
            value.push(ch);
            raw.push(ch);
            self.advance();
        }

        if self.current_char().is_none() && !raw.ends_with("*/") {
            return Ok(Token {
                token_type: TokenType::Error,
                value: "Unterminated block comment".to_string(),
                line: start_line,
                column: start_column,
                offset: start_offset,
                raw,
                metadata: Some(TokenMetadata {
                    quoted: None,
                    quote_char: None,
                    comment_style: Some(CommentStyle::Block),
                }),
            });
        }

        Ok(Token {
            token_type: TokenType::Comment,
            value,
            line: start_line,
            column: start_column,
            offset: start_offset,
            raw,
            metadata: Some(TokenMetadata {
                quoted: None,
                quote_char: None,
                comment_style: Some(CommentStyle::Block),
            }),
        })
    }

    fn read_escape_sequence(&mut self) -> Result<char> {
        self.advance(); // Skip backslash
        let ch = self.current_char().ok_or(KvError::UnexpectedEof {
            line: self.line,
            column: self.column,
        })?;

        let result = match ch {
            'n' => '\n',
            't' => '\t',
            '\\' => '\\',
            '"' => '"',
            _ => {
                // For unrecognized escape sequences, keep the backslash
                return Ok(ch);
            }
        };

        self.advance();
        Ok(result)
    }

    fn read_quoted_string(&mut self) -> Result<Token> {
        let start_line = self.line;
        let start_column = self.column;
        let start_offset = self.pos;

        let mut raw = String::from("\"");
        self.advance(); // Skip opening quote

        let mut value = String::new();

        while let Some(ch) = self.current_char() {
            if value.len() >= MAX_TOKEN_LENGTH {
                return Err(KvError::TokenTooLong {
                    line: start_line,
                    column: start_column,
                    max_length: MAX_TOKEN_LENGTH,
                });
            }

            if ch == '"' {
                raw.push('"');
                self.advance(); // Skip closing quote
                break;
            }

            if ch == '\\' && self.allow_escape_sequences {
                let escape_start = self.pos;
                let escaped = self.read_escape_sequence()?;
                value.push(escaped);
                // Add the raw escape sequence
                for i in escape_start..self.pos {
                    raw.push(self.input[i]);
                }
            } else {
                value.push(ch);
                raw.push(ch);
                self.advance();
            }
        }

        if self.current_char().is_none() && !raw.ends_with('"') {
            return Err(KvError::UnterminatedString {
                line: start_line,
                column: start_column,
            });
        }

        Ok(Token {
            token_type: TokenType::String,
            value,
            line: start_line,
            column: start_column,
            offset: start_offset,
            raw,
            metadata: Some(TokenMetadata {
                quoted: Some(true),
                quote_char: Some("\"".to_string()),
                comment_style: None,
            }),
        })
    }

    fn read_unquoted_string(&mut self) -> Result<Token> {
        let start_line = self.line;
        let start_column = self.column;
        let start_offset = self.pos;
        let mut value = String::new();

        while let Some(ch) = self.current_char() {
            if value.len() >= MAX_TOKEN_LENGTH {
                return Err(KvError::TokenTooLong {
                    line: start_line,
                    column: start_column,
                    max_length: MAX_TOKEN_LENGTH,
                });
            }

            // Check for comment start
            if ch == '/' && (self.peek(1) == Some('/') || self.peek(1) == Some('*')) {
                break;
            }

            // Stop at whitespace, quotes, or braces
            if Self::is_whitespace(ch) || ch == '"' || ch == '{' || ch == '}' {
                break;
            }

            value.push(ch);
            self.advance();
        }

        Ok(Token {
            token_type: TokenType::String,
            value: value.clone(),
            line: start_line,
            column: start_column,
            offset: start_offset,
            raw: value,
            metadata: Some(TokenMetadata {
                quoted: Some(false),
                quote_char: None,
                comment_style: None,
            }),
        })
    }

    fn read_conditional(&mut self) -> Token {
        let start_line = self.line;
        let start_column = self.column;
        let start_offset = self.pos;

        let mut value = String::from("[");
        self.advance(); // Skip [

        while let Some(ch) = self.current_char() {
            value.push(ch);
            self.advance();
            if ch == ']' {
                break;
            }
        }

        Token {
            token_type: TokenType::Conditional,
            value: value.clone(),
            line: start_line,
            column: start_column,
            offset: start_offset,
            raw: value,
            metadata: None,
        }
    }

    fn read_directive(&mut self) -> Result<Token> {
        let start_line = self.line;
        let start_column = self.column;
        let start_offset = self.pos;
        let raw_start = self.pos;

        self.advance(); // Skip #

        let mut directive = String::new();
        while let Some(ch) = self.current_char() {
            if Self::is_whitespace(ch) || ch == '"' {
                break;
            }
            directive.push(ch);
            self.advance();
        }

        let token_type = match directive.to_lowercase().as_str() {
            "include" => TokenType::Include,
            "base" => TokenType::Base,
            _ => {
                return Err(KvError::UnknownDirective {
                    directive,
                    line: start_line,
                    column: start_column,
                });
            }
        };

        // Skip whitespace
        while let Some(ch) = self.current_char() {
            if !Self::is_whitespace(ch) {
                break;
            }
            self.advance();
        }

        // Read file path
        let file_path = if self.current_char() == Some('"') {
            self.read_quoted_string()?.value
        } else {
            self.read_unquoted_string()?.value
        };

        let mut raw = String::new();
        for i in raw_start..self.pos {
            raw.push(self.input[i]);
        }

        Ok(Token {
            token_type,
            value: file_path,
            line: start_line,
            column: start_column,
            offset: start_offset,
            raw,
            metadata: None,
        })
    }

    pub fn next_token(&mut self) -> Result<Token> {
        // Handle whitespace
        if let Some(ch) = self.current_char()
            && Self::is_whitespace(ch)
        {
            return Ok(self.read_whitespace());
        }

        if self.current_char().is_none() {
            return Ok(Token {
                token_type: TokenType::Eof,
                value: String::new(),
                line: self.line,
                column: self.column,
                offset: self.pos,
                raw: String::new(),
                metadata: None,
            });
        }

        let line = self.line;
        let column = self.column;
        let offset = self.pos;
        let ch = self.current_char().unwrap();

        // Handle comments
        if ch == '/' {
            if self.peek(1) == Some('/') {
                return Ok(self.read_single_line_comment());
            }
            if self.peek(1) == Some('*') {
                return self.read_multi_line_comment();
            }
        }

        // Handle conditionals
        if ch == '[' && self.allow_conditionals {
            return Ok(self.read_conditional());
        }

        // Handle directives
        if ch == '#' && self.allow_includes {
            return self.read_directive();
        }

        // Handle braces
        if ch == '{' {
            self.advance();
            return Ok(Token {
                token_type: TokenType::OpenBrace,
                value: "{".to_string(),
                line,
                column,
                offset,
                raw: "{".to_string(),
                metadata: None,
            });
        }

        if ch == '}' {
            self.advance();
            return Ok(Token {
                token_type: TokenType::CloseBrace,
                value: "}".to_string(),
                line,
                column,
                offset,
                raw: "}".to_string(),
                metadata: None,
            });
        }

        // Handle quoted strings
        if ch == '"' {
            return self.read_quoted_string();
        }

        // Handle unquoted strings
        let token = self.read_unquoted_string()?;
        if token.value.is_empty() {
            return Err(KvError::UnexpectedCharacter {
                character: ch,
                line,
                column,
            });
        }

        Ok(token)
    }

    pub fn tokenize(&mut self) -> Result<Vec<Token>> {
        let mut tokens = Vec::new();

        loop {
            let token = self.next_token()?;
            let is_eof = token.token_type == TokenType::Eof;
            tokens.push(token);
            if is_eof {
                break;
            }
        }

        Ok(tokens)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tokenize_simple() {
        let input = r#""Key" "Value""#;
        let mut tokenizer = Tokenizer::new(input);
        let tokens = tokenizer.tokenize().unwrap();

        assert_eq!(tokens.len(), 4); // "Key", whitespace, "Value", EOF
        assert_eq!(tokens[0].token_type, TokenType::String);
        assert_eq!(tokens[0].value, "Key");
        assert_eq!(tokens[1].token_type, TokenType::Whitespace);
        assert_eq!(tokens[2].token_type, TokenType::String);
        assert_eq!(tokens[2].value, "Value");
    }

    #[test]
    fn test_tokenize_unquoted() {
        let input = "Key Value";
        let mut tokenizer = Tokenizer::new(input);
        let tokens = tokenizer.tokenize().unwrap();

        assert_eq!(tokens[0].value, "Key");
        assert!(tokens[0].metadata.as_ref().unwrap().quoted == Some(false));
    }

    #[test]
    fn test_tokenize_braces() {
        let input = "{ }";
        let mut tokenizer = Tokenizer::new(input);
        let tokens = tokenizer.tokenize().unwrap();

        assert_eq!(tokens[0].token_type, TokenType::OpenBrace);
        assert_eq!(tokens[2].token_type, TokenType::CloseBrace);
    }

    #[test]
    fn test_single_line_comment() {
        let input = "// This is a comment\nKey";
        let mut tokenizer = Tokenizer::new(input);
        let tokens = tokenizer.tokenize().unwrap();

        assert_eq!(tokens[0].token_type, TokenType::Comment);
        assert_eq!(tokens[0].value, " This is a comment");
        assert_eq!(
            tokens[0].metadata.as_ref().unwrap().comment_style,
            Some(CommentStyle::Line)
        );
    }

    #[test]
    fn test_multi_line_comment() {
        let input = "/* Multi\nline\ncomment */Key";
        let mut tokenizer = Tokenizer::new(input);
        let tokens = tokenizer.tokenize().unwrap();

        assert_eq!(tokens[0].token_type, TokenType::Comment);
        assert_eq!(tokens[0].value, " Multi\nline\ncomment ");
        assert_eq!(
            tokens[0].metadata.as_ref().unwrap().comment_style,
            Some(CommentStyle::Block)
        );
    }

    #[test]
    fn test_escape_sequences() {
        let input = r#""Value with\nnewline\ttab\"quote\\"""#;
        let mut tokenizer = Tokenizer::new(input);
        let tokens = tokenizer.tokenize().unwrap();

        assert_eq!(tokens[0].value, "Value with\nnewline\ttab\"quote\\");
    }

    #[test]
    fn test_conditional() {
        let input = "[$WIN32]";
        let mut tokenizer = Tokenizer::new(input);
        let tokens = tokenizer.tokenize().unwrap();

        assert_eq!(tokens[0].token_type, TokenType::Conditional);
        assert_eq!(tokens[0].value, "[$WIN32]");
    }

    #[test]
    fn test_directive() {
        let input = r#"#include "file.txt""#;
        let mut tokenizer = Tokenizer::new(input);
        let tokens = tokenizer.tokenize().unwrap();

        assert_eq!(tokens[0].token_type, TokenType::Include);
        assert_eq!(tokens[0].value, "file.txt");
    }

    #[test]
    fn test_position_tracking() {
        let input = "A\nB\nC";
        let mut tokenizer = Tokenizer::new(input);
        let tokens = tokenizer.tokenize().unwrap();

        assert_eq!(tokens[0].line, 1);
        assert_eq!(tokens[2].line, 2); // After newline
        assert_eq!(tokens[4].line, 3); // After second newline
    }

    #[test]
    fn test_unterminated_string() {
        let input = r#""Unterminated"#;
        let mut tokenizer = Tokenizer::new(input);
        let result = tokenizer.tokenize();

        assert!(result.is_err());
        match result.unwrap_err() {
            KvError::UnterminatedString { .. } => {}
            _ => panic!("Expected UnterminatedString error"),
        }
    }

    #[test]
    fn test_token_too_long() {
        let long_string = "a".repeat(MAX_TOKEN_LENGTH + 1);
        let mut tokenizer = Tokenizer::new(&long_string);
        let result = tokenizer.tokenize();

        assert!(result.is_err());
        match result.unwrap_err() {
            KvError::TokenTooLong { .. } => {}
            _ => panic!("Expected TokenTooLong error"),
        }
    }
}
