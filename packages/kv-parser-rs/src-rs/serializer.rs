use crate::ast::*;
use crate::types::{KeyValuesObject, KeyValuesValue, SerializeOptions};

pub struct Serializer {
    options: SerializeOptions,
}

impl Serializer {
    pub fn new(options: SerializeOptions) -> Self {
        Self { options }
    }

    /// Serialize AST to string (perfect preservation)
    pub fn serialize_ast(ast: &DocumentNode) -> String {
        Self::serialize_children(&ast.children)
    }

    fn serialize_children(children: &[AstNode]) -> String {
        let mut result = String::new();
        for child in children {
            result.push_str(&Self::serialize_node(child));
        }
        result
    }

    fn serialize_node(node: &AstNode) -> String {
        match node {
            AstNode::KeyValue(kv) => Self::serialize_keyvalue(kv),
            AstNode::Comment(c) => c.raw.clone(),
            AstNode::Whitespace(w) => w.raw.clone(),
            AstNode::Conditional(c) => c.raw.clone(),
        }
    }

    fn serialize_keyvalue(kv: &KeyValueNode) -> String {
        let mut result = String::new();

        // Serialize key
        result.push_str(&kv.key.raw);

        // Serialize separator
        if let Some(sep) = &kv.separator {
            result.push_str(&sep.raw);
        }

        // Serialize value
        result.push_str(&Self::serialize_value_node(&kv.value));

        // Serialize conditional separator
        if let Some(sep) = &kv.conditional_separator {
            result.push_str(&sep.raw);
        }

        // Serialize conditional
        if let Some(cond) = &kv.conditional {
            result.push_str(&cond.raw);
        }

        result
    }

    fn serialize_value_node(value: &ValueNode) -> String {
        match value {
            ValueNode::String(s) => s.raw.clone(),
            ValueNode::Number(n) => n.raw.clone(),
            ValueNode::Object(o) => Self::serialize_object(o),
        }
    }

    fn serialize_object(obj: &ObjectNode) -> String {
        let mut result = String::new();
        result.push_str(&obj.open_brace.raw);
        result.push_str(&Self::serialize_children(&obj.children));
        result.push_str(&obj.close_brace.raw);
        result
    }

    /// Serialize data object to KV string
    pub fn serialize_data(&self, data: &KeyValuesObject) -> String {
        let keys: Vec<_> = data.keys().collect();

        if keys.len() == 1 {
            let root_key = keys[0];
            if let Some(KeyValuesValue::Object(_)) = data.get(root_key) {
                // Standard format with root key
                let formatted_key = self.format_value(root_key);
                return format!(
                    "{}\n{}\n",
                    formatted_key,
                    self.serialize_kv_value(data.get(root_key).unwrap(), 0)
                );
            }
        }

        // Multiple root keys or non-object root value
        self.serialize_object_data(data, 0)
    }

    fn serialize_object_data(&self, obj: &KeyValuesObject, indent: usize) -> String {
        let indent_str = self.get_indent(indent);
        let next_indent_str = self.get_indent(indent + 1);
        let mut result = String::from("{\n");

        for (key, value) in obj {
            let formatted_key = self.format_value(key);

            match value {
                KeyValuesValue::Array(arr) => {
                    // Handle duplicate keys
                    for item in arr {
                        if matches!(item, KeyValuesValue::Object(_)) {
                            result.push_str(&format!("{}{}\n", next_indent_str, formatted_key));
                            result.push_str(&format!(
                                "{}{}\n",
                                next_indent_str,
                                self.serialize_kv_value(item, indent + 1)
                            ));
                        } else {
                            result.push_str(&format!(
                                "{}{}    {}\n",
                                next_indent_str,
                                formatted_key,
                                self.serialize_kv_value(item, indent + 1)
                            ));
                        }
                    }
                }
                KeyValuesValue::Object(_) => {
                    result.push_str(&format!("{}{}\n", next_indent_str, formatted_key));
                    result.push_str(&format!(
                        "{}{}\n",
                        next_indent_str,
                        self.serialize_kv_value(value, indent + 1)
                    ));
                }
                _ => {
                    result.push_str(&format!(
                        "{}{}    {}\n",
                        next_indent_str,
                        formatted_key,
                        self.serialize_kv_value(value, indent + 1)
                    ));
                }
            }
        }

        result.push_str(&format!("{}}}", indent_str));
        result
    }

    fn serialize_kv_value(&self, value: &KeyValuesValue, indent: usize) -> String {
        match value {
            KeyValuesValue::String(s) => self.format_value(s),
            KeyValuesValue::Number(n) => self.format_number(*n),
            KeyValuesValue::Object(o) => self.serialize_object_data(o, indent),
            KeyValuesValue::Array(_) => {
                panic!("Arrays should be handled as duplicate keys, not serialized directly")
            }
        }
    }

    fn get_indent(&self, level: usize) -> String {
        if self.options.use_tabs {
            "\t".repeat(level)
        } else {
            " ".repeat(level * self.options.indent_size)
        }
    }

    fn needs_quotes(&self, value: &str) -> bool {
        if self.options.quote_all_strings {
            return true;
        }

        if self.options.minimize_quotes {
            // Only quote if contains special characters
            value.is_empty()
                || value.contains(|c: char| c.is_whitespace() || c == '{' || c == '}' || c == '"')
                || value.contains("://")
                || value.starts_with('#')
                || value.starts_with('[')
                || value.parse::<f64>().is_ok() // Looks like a number
        } else {
            // More conservative: quote if contains special chars
            value.is_empty()
                || value.contains(|c: char| {
                    c.is_whitespace() || c == '{' || c == '}' || c == '"' || c == '/' || c == '\\'
                })
                || value.starts_with('#')
                || value.starts_with('[')
                || value.parse::<f64>().is_ok()
        }
    }

    fn escape_string(&self, value: &str) -> String {
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\t', "\\t")
    }

    fn format_value(&self, value: &str) -> String {
        if self.needs_quotes(value) {
            format!("\"{}\"", self.escape_string(value))
        } else {
            value.to_string()
        }
    }

    fn format_number(&self, value: f64) -> String {
        if value.fract() == 0.0 && value.abs() < 1e15 {
            format!("{}", value as i64)
        } else {
            value.to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::Parser;
    use crate::types::ParseOptions;

    #[test]
    fn test_serialize_ast() {
        let input = r#""Key"    "Value""#;
        let result = Parser::parse(input, ParseOptions::default()).unwrap();
        let serialized = Serializer::serialize_ast(&result.ast);

        // Should preserve exact spacing
        assert_eq!(serialized, input);
    }

    #[test]
    fn test_serialize_ast_with_comments() {
        let input = r#"// Comment
"Key" "Value"
"#;
        let result = Parser::parse(input, ParseOptions::default()).unwrap();
        let serialized = Serializer::serialize_ast(&result.ast);

        assert!(serialized.contains("// Comment"));
        assert!(serialized.contains("\"Key\""));
    }

    #[test]
    fn test_serialize_data_simple() {
        let mut data = KeyValuesObject::new();
        let mut root = KeyValuesObject::new();
        root.insert(
            "Key".to_string(),
            KeyValuesValue::String("Value".to_string()),
        );
        data.insert("Root".to_string(), KeyValuesValue::Object(root));

        let serializer = Serializer::new(SerializeOptions::default());
        let result = serializer.serialize_data(&data);

        assert!(result.contains("Root"));
        assert!(result.contains("Key"));
        assert!(result.contains("Value"));
    }

    #[test]
    fn test_serialize_numbers() {
        let mut data = KeyValuesObject::new();
        let mut root = KeyValuesObject::new();
        root.insert("Int".to_string(), KeyValuesValue::Number(123.0));
        root.insert("Float".to_string(), KeyValuesValue::Number(45.67));
        data.insert("Root".to_string(), KeyValuesValue::Object(root));

        let serializer = Serializer::new(SerializeOptions::default());
        let result = serializer.serialize_data(&data);

        assert!(result.contains("123"));
        assert!(result.contains("45.67"));
    }

    #[test]
    fn test_serialize_with_tabs() {
        let mut data = KeyValuesObject::new();
        let mut root = KeyValuesObject::new();
        root.insert(
            "Key".to_string(),
            KeyValuesValue::String("Value".to_string()),
        );
        data.insert("Root".to_string(), KeyValuesValue::Object(root));

        let serializer = Serializer::new(SerializeOptions {
            use_tabs: true,
            ..Default::default()
        });
        let result = serializer.serialize_data(&data);

        assert!(result.contains('\t'));
    }

    #[test]
    fn test_serialize_quote_all() {
        let mut data = KeyValuesObject::new();
        data.insert(
            "Key".to_string(),
            KeyValuesValue::String("Value".to_string()),
        );

        let serializer = Serializer::new(SerializeOptions {
            quote_all_strings: true,
            ..Default::default()
        });
        let result = serializer.serialize_data(&data);

        // Both key and value should be quoted
        assert!(result.contains("\"Key\""));
        assert!(result.contains("\"Value\""));
    }

    #[test]
    fn test_round_trip() {
        let input = r#"
"Root"
{
    "Key1" "Value1"
    "Key2" "Value2"
}
"#;
        let result = Parser::parse(input, ParseOptions::default()).unwrap();
        let serialized = Serializer::serialize_ast(&result.ast);
        let reparsed = Parser::parse(&serialized, ParseOptions::default()).unwrap();

        // Data should be identical
        assert_eq!(result.data, reparsed.data);
    }

    #[test]
    fn test_escape_sequences() {
        let mut data = KeyValuesObject::new();
        data.insert(
            "Key".to_string(),
            KeyValuesValue::String("Value with\nnewline\ttab\"quote".to_string()),
        );

        let serializer = Serializer::new(SerializeOptions::default());
        let result = serializer.serialize_data(&data);

        assert!(result.contains("\\n"));
        assert!(result.contains("\\t"));
        assert!(result.contains("\\\""));
    }
}
