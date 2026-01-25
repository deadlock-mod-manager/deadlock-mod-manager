use crate::ast::*;
use crate::error::{KvError, Result};
use crate::tokenizer::Tokenizer;
use crate::types::{KeyValuesObject, KeyValuesValue, ParseOptions, ParseResult, Token, TokenType};

pub struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    pub fn new(tokens: Vec<Token>) -> Self {
        Self { tokens, pos: 0 }
    }

    pub fn parse(input: &str, options: ParseOptions) -> Result<ParseResult> {
        let mut tokenizer = Tokenizer::with_options(
            input,
            options.allow_escape_sequences,
            options.allow_conditionals,
            options.allow_includes,
        );
        let tokens = tokenizer.tokenize()?;
        let mut parser = Parser::new(tokens);
        let ast = parser.parse_document()?;
        let data = parser.ast_to_data(&ast);

        Ok(ParseResult { data, ast })
    }

    fn current_token(&self) -> &Token {
        if self.pos < self.tokens.len() {
            &self.tokens[self.pos]
        } else {
            &self.tokens[self.tokens.len() - 1]
        }
    }

    fn advance(&mut self) {
        if self.pos < self.tokens.len() - 1 {
            self.pos += 1;
        }
    }

    fn make_position(&self, token: &Token) -> Position {
        Position {
            offset: token.offset,
            line: token.line,
            column: token.column,
        }
    }

    fn is_eof(&self) -> bool {
        self.current_token().token_type == TokenType::Eof
    }

    pub fn parse_document(&mut self) -> Result<DocumentNode> {
        let start_token = self.current_token().clone();
        let mut children = Vec::new();

        while !self.is_eof() {
            let token = self.current_token();

            match token.token_type {
                TokenType::Whitespace => {
                    children.push(AstNode::Whitespace(self.parse_whitespace()?));
                }
                TokenType::Comment => {
                    children.push(AstNode::Comment(self.parse_comment()?));
                }
                TokenType::String => {
                    children.push(AstNode::KeyValue(Box::new(self.parse_keyvalue()?)));
                }
                TokenType::Conditional => {
                    children.push(AstNode::Conditional(self.parse_conditional()?));
                }
                TokenType::Include | TokenType::Base => {
                    // Skip includes for now
                    self.advance();
                }
                _ => {
                    self.advance();
                }
            }
        }

        let end_token = self.current_token().clone();

        Ok(DocumentNode {
            node_type: NodeType::Document,
            start: self.make_position(&start_token),
            end: self.make_position(&end_token),
            raw: String::new(),
            children,
        })
    }

    fn parse_keyvalue(&mut self) -> Result<KeyValueNode> {
        let start_token = self.current_token().clone();

        // Parse key
        let key = self.parse_string()?;

        // Parse separator (whitespace between key and value)
        let separator = if self.current_token().token_type == TokenType::Whitespace {
            Some(self.parse_whitespace()?)
        } else {
            None
        };

        // Parse value
        let value = if self.current_token().token_type == TokenType::OpenBrace {
            ValueNode::Object(Box::new(self.parse_object()?))
        } else if self.current_token().token_type == TokenType::String {
            // Try to parse as number
            let token = self.current_token();
            let is_quoted = token
                .metadata
                .as_ref()
                .and_then(|m| m.quoted)
                .unwrap_or(false);

            if !is_quoted && token.value.parse::<f64>().is_ok() && !token.value.trim().is_empty() {
                ValueNode::Number(self.parse_number()?)
            } else {
                ValueNode::String(self.parse_string()?)
            }
        } else {
            return Err(KvError::ExpectedToken {
                expected: "value".to_string(),
                line: self.current_token().line,
                column: self.current_token().column,
            });
        };

        // Look ahead for conditional on same line
        let mut temp_pos = self.pos;
        let mut conditional_separator = None;
        let mut conditional = None;

        while temp_pos < self.tokens.len() {
            let token = &self.tokens[temp_pos];
            match token.token_type {
                TokenType::Whitespace => {
                    // Check if contains newline
                    if token.value.contains('\n') {
                        break;
                    }
                    temp_pos += 1;
                    continue;
                }
                TokenType::Conditional => {
                    // Found conditional on same line
                    if self.current_token().token_type == TokenType::Whitespace {
                        conditional_separator = Some(self.parse_whitespace()?);
                    }
                    conditional = Some(self.parse_conditional()?);
                    break;
                }
                TokenType::Comment => {
                    // Comments can appear after conditionals on same line, skip
                    break;
                }
                _ => break,
            }
        }

        let end_pos = if self.pos > 0 { self.pos - 1 } else { 0 };
        let end_token = if end_pos < self.tokens.len() {
            &self.tokens[end_pos]
        } else {
            self.current_token()
        };

        Ok(KeyValueNode {
            node_type: NodeType::KeyValue,
            start: self.make_position(&start_token),
            end: self.make_position(end_token),
            raw: String::new(),
            key,
            value,
            separator,
            conditional_separator,
            conditional,
        })
    }

    fn parse_object(&mut self) -> Result<ObjectNode> {
        let start_token = self.current_token().clone();

        if start_token.token_type != TokenType::OpenBrace {
            return Err(KvError::ExpectedToken {
                expected: "{".to_string(),
                line: start_token.line,
                column: start_token.column,
            });
        }

        let open_brace = TokenNode {
            node_type: NodeType::Token,
            start: self.make_position(&start_token),
            end: self.make_position(&start_token),
            raw: start_token.raw.clone(),
            token_type: "OPEN_BRACE".to_string(),
            value: "{".to_string(),
        };

        self.advance(); // Skip {

        let mut children = Vec::new();

        while !self.is_eof() && self.current_token().token_type != TokenType::CloseBrace {
            let token = self.current_token();

            match token.token_type {
                TokenType::Whitespace => {
                    children.push(AstNode::Whitespace(self.parse_whitespace()?));
                }
                TokenType::Comment => {
                    children.push(AstNode::Comment(self.parse_comment()?));
                }
                TokenType::String => {
                    children.push(AstNode::KeyValue(Box::new(self.parse_keyvalue()?)));
                }
                TokenType::Conditional => {
                    children.push(AstNode::Conditional(self.parse_conditional()?));
                }
                _ => {
                    self.advance();
                }
            }
        }

        if self.current_token().token_type != TokenType::CloseBrace {
            return Err(KvError::ExpectedToken {
                expected: "}".to_string(),
                line: self.current_token().line,
                column: self.current_token().column,
            });
        }

        let close_token = self.current_token().clone();
        let close_brace = TokenNode {
            node_type: NodeType::Token,
            start: self.make_position(&close_token),
            end: self.make_position(&close_token),
            raw: close_token.raw.clone(),
            token_type: "CLOSE_BRACE".to_string(),
            value: "}".to_string(),
        };

        self.advance(); // Skip }

        Ok(ObjectNode {
            node_type: NodeType::Object,
            start: self.make_position(&start_token),
            end: self.make_position(&close_token),
            raw: String::new(),
            open_brace,
            children,
            close_brace,
        })
    }

    fn parse_string(&mut self) -> Result<StringNode> {
        let token = self.current_token();

        if token.token_type != TokenType::String {
            return Err(KvError::ExpectedToken {
                expected: "string".to_string(),
                line: token.line,
                column: token.column,
            });
        }

        let node = StringNode {
            node_type: NodeType::String,
            start: self.make_position(token),
            end: self.make_position(token),
            raw: token.raw.clone(),
            value: token.value.clone(),
            quoted: token
                .metadata
                .as_ref()
                .and_then(|m| m.quoted)
                .unwrap_or(false),
            quote_char: token.metadata.as_ref().and_then(|m| m.quote_char.clone()),
        };

        self.advance();
        Ok(node)
    }

    fn parse_number(&mut self) -> Result<NumberNode> {
        let token = self.current_token();

        if token.token_type != TokenType::String {
            return Err(KvError::ExpectedToken {
                expected: "number".to_string(),
                line: token.line,
                column: token.column,
            });
        }

        let value = token
            .value
            .parse::<f64>()
            .map_err(|_| KvError::ParseError {
                line: token.line,
                column: token.column,
                message: format!("Invalid number: {}", token.value),
            })?;

        let is_float = token.value.contains('.');

        let node = NumberNode {
            node_type: NodeType::Number,
            start: self.make_position(token),
            end: self.make_position(token),
            raw: token.raw.clone(),
            value,
            is_float,
        };

        self.advance();
        Ok(node)
    }

    fn parse_comment(&mut self) -> Result<CommentNode> {
        let token = self.current_token();

        if token.token_type != TokenType::Comment {
            return Err(KvError::ExpectedToken {
                expected: "comment".to_string(),
                line: token.line,
                column: token.column,
            });
        }

        let style = token
            .metadata
            .as_ref()
            .and_then(|m| m.comment_style)
            .unwrap_or(crate::types::CommentStyle::Line);

        let node = CommentNode {
            node_type: NodeType::Comment,
            start: self.make_position(token),
            end: self.make_position(token),
            raw: token.raw.clone(),
            value: token.value.clone(),
            style,
        };

        self.advance();
        Ok(node)
    }

    fn parse_whitespace(&mut self) -> Result<WhitespaceNode> {
        let token = self.current_token();

        if token.token_type != TokenType::Whitespace {
            return Err(KvError::ExpectedToken {
                expected: "whitespace".to_string(),
                line: token.line,
                column: token.column,
            });
        }

        let node = WhitespaceNode {
            node_type: NodeType::Whitespace,
            start: self.make_position(token),
            end: self.make_position(token),
            raw: token.raw.clone(),
            value: token.value.clone(),
        };

        self.advance();
        Ok(node)
    }

    fn parse_conditional(&mut self) -> Result<ConditionalNode> {
        let token = self.current_token();

        if token.token_type != TokenType::Conditional {
            return Err(KvError::ExpectedToken {
                expected: "conditional".to_string(),
                line: token.line,
                column: token.column,
            });
        }

        let mut condition = token.value.clone();
        let mut negated = false;

        // Strip outer brackets
        if condition.starts_with('[') && condition.ends_with(']') {
            condition = condition[1..condition.len() - 1].trim().to_string();
        }

        // Check for negation
        if condition.starts_with('!') {
            negated = true;
            condition = condition[1..].trim().to_string();
        }

        // Remove $ prefix if present
        if condition.starts_with('$') {
            condition = condition[1..].to_string();
        }

        let node = ConditionalNode {
            node_type: NodeType::Conditional,
            start: self.make_position(token),
            end: self.make_position(token),
            raw: token.raw.clone(),
            condition,
            negated,
        };

        self.advance();
        Ok(node)
    }

    fn ast_to_data(&self, doc: &DocumentNode) -> KeyValuesObject {
        self.extract_data_from_children(&doc.children)
    }

    fn extract_data_from_children(&self, children: &[AstNode]) -> KeyValuesObject {
        let mut result = KeyValuesObject::new();

        for child in children {
            if let AstNode::KeyValue(kv) = child {
                let key = kv.key.value.clone();
                let value = self.extract_value(&kv.value);

                // Handle duplicate keys
                if let Some(existing) = result.get_mut(&key) {
                    match existing {
                        KeyValuesValue::Array(arr) => {
                            arr.push(value);
                        }
                        _ => {
                            let old_value = existing.clone();
                            *existing = KeyValuesValue::Array(vec![old_value, value]);
                        }
                    }
                } else {
                    result.insert(key, value);
                }
            }
        }

        result
    }

    fn extract_value(&self, value: &ValueNode) -> KeyValuesValue {
        match value {
            ValueNode::String(s) => KeyValuesValue::String(s.value.clone()),
            ValueNode::Number(n) => KeyValuesValue::Number(n.value),
            ValueNode::Object(o) => {
                KeyValuesValue::Object(self.extract_data_from_children(&o.children))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_keyvalue() {
        let input = r#""Key" "Value""#;
        let result = Parser::parse(input, ParseOptions::default()).unwrap();

        assert_eq!(result.data.len(), 1);
        assert!(matches!(
            result.data.get("Key"),
            Some(KeyValuesValue::String(s)) if s == "Value"
        ));
    }

    #[test]
    fn test_parse_nested_object() {
        let input = r#"
"Root"
{
    "Key" "Value"
}
"#;
        let result = Parser::parse(input, ParseOptions::default()).unwrap();

        assert_eq!(result.data.len(), 1);
        if let Some(KeyValuesValue::Object(obj)) = result.data.get("Root") {
            assert!(matches!(
                obj.get("Key"),
                Some(KeyValuesValue::String(s)) if s == "Value"
            ));
        } else {
            panic!("Expected Root to be an object");
        }
    }

    #[test]
    fn test_parse_numbers() {
        let input = r#"
"Root"
{
    "Int" 123
    "Float" 45.67
}
"#;
        let result = Parser::parse(input, ParseOptions::default()).unwrap();

        if let Some(KeyValuesValue::Object(obj)) = result.data.get("Root") {
            assert!(matches!(
                obj.get("Int"),
                Some(KeyValuesValue::Number(n)) if *n == 123.0
            ));
            assert!(matches!(
                obj.get("Float"),
                Some(KeyValuesValue::Number(n)) if *n == 45.67
            ));
        } else {
            panic!("Expected Root to be an object");
        }
    }

    #[test]
    fn test_parse_duplicate_keys() {
        let input = r#"
"Root"
{
    "Item" "First"
    "Item" "Second"
    "Item" "Third"
}
"#;
        let result = Parser::parse(input, ParseOptions::default()).unwrap();

        if let Some(KeyValuesValue::Object(obj)) = result.data.get("Root") {
            if let Some(KeyValuesValue::Array(arr)) = obj.get("Item") {
                assert_eq!(arr.len(), 3);
                assert!(matches!(&arr[0], KeyValuesValue::String(s) if s == "First"));
                assert!(matches!(&arr[1], KeyValuesValue::String(s) if s == "Second"));
                assert!(matches!(&arr[2], KeyValuesValue::String(s) if s == "Third"));
            } else {
                panic!("Expected Item to be an array");
            }
        } else {
            panic!("Expected Root to be an object");
        }
    }

    #[test]
    fn test_parse_conditional_with_or_operator() {
        let input = r#""VulkanOnly"								"1"	[ $LINUX || $OSX ] // No OpenGL or D3D9/11 fallback on Linux or OSX, only Vulkan is supported."#;

        // First test tokenization
        use crate::tokenizer::Tokenizer;
        let mut tokenizer = Tokenizer::new(input);
        let _ = tokenizer.tokenize();

        let result = Parser::parse(input, ParseOptions::default());

        assert!(result.is_ok(), "Should parse conditional with OR operator");
    }

    #[test]
    fn test_parse_with_comments() {
        let input = r#"
// Line comment
"Root"
{
    /* Block comment */
    "Key" "Value"
}
"#;
        let result = Parser::parse(input, ParseOptions::default()).unwrap();

        // Verify AST has comments
        let comment_count = result
            .ast
            .children
            .iter()
            .filter(|c| matches!(c, AstNode::Comment(_)))
            .count();
        assert!(comment_count > 0);

        // Verify data extraction works despite comments
        assert!(result.data.contains_key("Root"));
    }

    #[test]
    fn test_parse_unquoted_strings() {
        let input = r#"
Root
{
    Key Value
}
"#;
        let result = Parser::parse(input, ParseOptions::default()).unwrap();

        if let Some(KeyValuesValue::Object(obj)) = result.data.get("Root") {
            assert!(matches!(
                obj.get("Key"),
                Some(KeyValuesValue::String(s)) if s == "Value"
            ));
        } else {
            panic!("Expected Root to be an object");
        }
    }

    #[test]
    fn test_ast_preservation() {
        let input = r#""Key"    "Value""#;
        let result = Parser::parse(input, ParseOptions::default()).unwrap();

        // AST should preserve the exact spacing
        if let AstNode::KeyValue(kv) = &result.ast.children[0] {
            assert!(kv.separator.is_some());
            if let Some(ws) = &kv.separator {
                assert_eq!(ws.value, "    ");
            }
        } else {
            panic!("Expected first child to be KeyValue");
        }
    }
}
