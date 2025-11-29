use crate::ast::*;
use crate::error::{KvError, Result};
use crate::types::{
    DiffEntry, DiffOp, DiffStats, DocumentDiff, KeyValuesObject, KeyValuesValue, NodeType,
};

pub struct DiffGenerator;

impl DiffGenerator {
    /// Generate diff between two data objects
    pub fn generate_diff(source: &KeyValuesObject, target: &KeyValuesObject) -> DocumentDiff {
        let mut changes = Vec::new();
        Self::compare_objects(
            &KeyValuesValue::Object(source.clone()),
            &KeyValuesValue::Object(target.clone()),
            "",
            &mut changes,
        );
        DocumentDiff { changes }
    }

    fn compare_objects(
        source: &KeyValuesValue,
        target: &KeyValuesValue,
        path: &str,
        changes: &mut Vec<DiffEntry>,
    ) {
        match (source, target) {
            (KeyValuesValue::Object(src_obj), KeyValuesValue::Object(tgt_obj)) => {
                // Check for removed keys
                for key in src_obj.keys() {
                    if !tgt_obj.contains_key(key) {
                        let full_path = if path.is_empty() {
                            key.clone()
                        } else {
                            format!("{}.{}", path, key)
                        };
                        changes.push(DiffEntry {
                            op: DiffOp::Remove,
                            path: full_path,
                            old_value: Some(src_obj[key].clone()),
                            new_value: None,
                        });
                    }
                }

                // Check for added or modified keys
                for (key, tgt_value) in tgt_obj {
                    let full_path = if path.is_empty() {
                        key.clone()
                    } else {
                        format!("{}.{}", path, key)
                    };

                    if let Some(src_value) = src_obj.get(key) {
                        // Key exists in both - check if modified
                        if !Self::values_equal(src_value, tgt_value) {
                            if matches!(src_value, KeyValuesValue::Object(_))
                                && matches!(tgt_value, KeyValuesValue::Object(_))
                            {
                                // Recursively compare objects
                                Self::compare_objects(src_value, tgt_value, &full_path, changes);
                            } else {
                                // Values differ
                                changes.push(DiffEntry {
                                    op: DiffOp::Replace,
                                    path: full_path,
                                    old_value: Some(src_value.clone()),
                                    new_value: Some(tgt_value.clone()),
                                });
                            }
                        }
                    } else {
                        // Key added
                        changes.push(DiffEntry {
                            op: DiffOp::Add,
                            path: full_path,
                            old_value: None,
                            new_value: Some(tgt_value.clone()),
                        });
                    }
                }
            }
            _ => {
                // Values are different types or primitives
                if !Self::values_equal(source, target) {
                    changes.push(DiffEntry {
                        op: DiffOp::Replace,
                        path: path.to_string(),
                        old_value: Some(source.clone()),
                        new_value: Some(target.clone()),
                    });
                }
            }
        }
    }

    fn values_equal(a: &KeyValuesValue, b: &KeyValuesValue) -> bool {
        match (a, b) {
            (KeyValuesValue::String(s1), KeyValuesValue::String(s2)) => s1 == s2,
            (KeyValuesValue::Number(n1), KeyValuesValue::Number(n2)) => {
                (n1 - n2).abs() < f64::EPSILON
            }
            (KeyValuesValue::Array(a1), KeyValuesValue::Array(a2)) => {
                a1.len() == a2.len()
                    && a1
                        .iter()
                        .zip(a2.iter())
                        .all(|(v1, v2)| Self::values_equal(v1, v2))
            }
            (KeyValuesValue::Object(o1), KeyValuesValue::Object(o2)) => {
                if o1.len() != o2.len() {
                    return false;
                }
                o1.iter()
                    .all(|(k, v1)| o2.get(k).is_some_and(|v2| Self::values_equal(v1, v2)))
            }
            _ => false,
        }
    }

    /// Get statistics about a diff
    pub fn get_stats(diff: &DocumentDiff) -> DiffStats {
        let mut stats = DiffStats {
            total: diff.changes.len(),
            added: 0,
            removed: 0,
            modified: 0,
        };

        for change in &diff.changes {
            match change.op {
                DiffOp::Add => stats.added += 1,
                DiffOp::Remove => stats.removed += 1,
                DiffOp::Replace => stats.modified += 1,
            }
        }

        stats
    }

    /// Format diff as human-readable string
    pub fn format_diff(diff: &DocumentDiff) -> String {
        if diff.changes.is_empty() {
            return "No changes".to_string();
        }

        let mut output = format!("{} change(s):\n\n", diff.changes.len());

        for change in &diff.changes {
            match change.op {
                DiffOp::Add => {
                    if let Some(new_val) = &change.new_value {
                        output.push_str(&format!(
                            "+ Add {} = {}\n",
                            change.path,
                            Self::format_value(new_val)
                        ));
                    } else {
                        output.push_str(&format!("+ Add {} = <missing value>\n", change.path));
                    }
                }
                DiffOp::Remove => {
                    if let Some(old_val) = &change.old_value {
                        output.push_str(&format!(
                            "- Remove {} (was: {})\n",
                            change.path,
                            Self::format_value(old_val)
                        ));
                    } else {
                        output.push_str(&format!(
                            "- Remove {} (was: <missing value>)\n",
                            change.path
                        ));
                    }
                }
                DiffOp::Replace => {
                    output.push_str(&format!("~ Replace {}\n", change.path));
                    if let Some(old_val) = &change.old_value {
                        output.push_str(&format!("  - Old: {}\n", Self::format_value(old_val)));
                    } else {
                        output.push_str(&format!("  - Old: <missing value>\n"));
                    }
                    if let Some(new_val) = &change.new_value {
                        output.push_str(&format!("  + New: {}\n", Self::format_value(new_val)));
                    } else {
                        output.push_str(&format!("  + New: <missing value>\n"));
                    }
                }
            }
        }

        output
    }

    fn format_value(value: &KeyValuesValue) -> String {
        serde_json::to_string(value).unwrap_or_else(|_| "???".to_string())
    }
}

pub struct DiffApplicator;

impl DiffApplicator {
    /// Apply diff to data object (creates a new object)
    pub fn apply_to_data(source: &KeyValuesObject, diff: &DocumentDiff) -> Result<KeyValuesObject> {
        let mut result = source.clone();

        for change in &diff.changes {
            Self::apply_change(&mut result, change)?;
        }

        Ok(result)
    }

    fn apply_change(data: &mut KeyValuesObject, change: &DiffEntry) -> Result<()> {
        let path_parts: Vec<&str> = change.path.split('.').collect();
        let last_key = path_parts.last().ok_or_else(|| KvError::InvalidPath {
            path: change.path.clone(),
        })?;

        // Navigate to parent object
        let mut current = data;
        for part in &path_parts[..path_parts.len() - 1] {
            if !current.contains_key(*part) {
                current.insert(
                    part.to_string(),
                    KeyValuesValue::Object(KeyValuesObject::new()),
                );
            }

            match current.get_mut(*part) {
                Some(KeyValuesValue::Object(obj)) => {
                    current = obj;
                }
                _ => {
                    return Err(KvError::PathNotObject {
                        path: change.path.clone(),
                        part: part.to_string(),
                    });
                }
            }
        }

        // Apply operation
        match change.op {
            DiffOp::Add | DiffOp::Replace => {
                if let Some(new_value) = &change.new_value {
                    current.insert(last_key.to_string(), new_value.clone());
                }
            }
            DiffOp::Remove => {
                current.remove(*last_key);
            }
        }

        Ok(())
    }

    /// Apply diff to AST (creates a modified AST)
    pub fn apply_to_ast(source: &DocumentNode, diff: &DocumentDiff) -> Result<DocumentNode> {
        let mut result = source.clone();

        for change in &diff.changes {
            Self::apply_change_to_ast(&mut result, change)?;
        }

        Ok(result)
    }

    fn apply_change_to_ast(ast: &mut DocumentNode, change: &DiffEntry) -> Result<()> {
        let path_parts: Vec<&str> = change.path.split('.').collect();

        match change.op {
            DiffOp::Replace => {
                Self::update_keyvalue_in_ast_path(ast, &path_parts, change.new_value.as_ref())?;
            }
            DiffOp::Add => {
                Self::add_keyvalue_to_ast_path(ast, &path_parts, change.new_value.as_ref())?;
            }
            DiffOp::Remove => {
                Self::remove_keyvalue_from_ast_path(ast, &path_parts)?;
            }
        }

        Ok(())
    }

    fn update_keyvalue_in_ast_path(
        ast: &mut DocumentNode,
        path_parts: &[&str],
        new_value: Option<&KeyValuesValue>,
    ) -> Result<()> {
        if path_parts.is_empty() {
            return Err(KvError::InvalidPath {
                path: String::new(),
            });
        }

        if path_parts.len() == 1 {
            Self::update_keyvalue_in_children(&mut ast.children, path_parts[0], new_value)
        } else {
            Self::update_in_nested_path(&mut ast.children, path_parts, new_value)
        }
    }

    fn update_in_nested_path(
        children: &mut [AstNode],
        path_parts: &[&str],
        new_value: Option<&KeyValuesValue>,
    ) -> Result<()> {
        let key = path_parts[0];

        for child in children.iter_mut() {
            if let AstNode::KeyValue(kv) = child
                && kv.key.value == key
                && let ValueNode::Object(obj) = &mut kv.value
            {
                if path_parts.len() == 2 {
                    return Self::update_keyvalue_in_children(
                        &mut obj.children,
                        path_parts[1],
                        new_value,
                    );
                } else {
                    return Self::update_in_nested_path(
                        &mut obj.children,
                        &path_parts[1..],
                        new_value,
                    );
                }
            }
        }

        Err(KvError::PathNotFound {
            path: path_parts.join("."),
        })
    }

    fn update_keyvalue_in_children(
        children: &mut [AstNode],
        key: &str,
        new_value: Option<&KeyValuesValue>,
    ) -> Result<()> {
        for child in children.iter_mut() {
            if let AstNode::KeyValue(kv) = child
                && kv.key.value == key
            {
                if let Some(value) = new_value {
                    kv.value = Self::create_value_node(value)?;
                }
                return Ok(());
            }
        }
        Err(KvError::PathNotFound {
            path: key.to_string(),
        })
    }

    fn add_keyvalue_to_ast_path(
        ast: &mut DocumentNode,
        path_parts: &[&str],
        new_value: Option<&KeyValuesValue>,
    ) -> Result<()> {
        if path_parts.is_empty() {
            return Err(KvError::InvalidPath {
                path: String::new(),
            });
        }

        if path_parts.len() == 1 {
            Self::add_keyvalue_to_children(&mut ast.children, path_parts[0], new_value)
        } else {
            Self::add_in_nested_path(&mut ast.children, path_parts, new_value)
        }
    }

    fn add_in_nested_path(
        children: &mut [AstNode],
        path_parts: &[&str],
        new_value: Option<&KeyValuesValue>,
    ) -> Result<()> {
        let key = path_parts[0];

        for child in children.iter_mut() {
            if let AstNode::KeyValue(kv) = child
                && kv.key.value == key
                && let ValueNode::Object(obj) = &mut kv.value
            {
                if path_parts.len() == 2 {
                    return Self::add_keyvalue_to_children(
                        &mut obj.children,
                        path_parts[1],
                        new_value,
                    );
                } else {
                    return Self::add_in_nested_path(
                        &mut obj.children,
                        &path_parts[1..],
                        new_value,
                    );
                }
            }
        }

        Err(KvError::PathNotFound {
            path: path_parts.join("."),
        })
    }

    fn add_keyvalue_to_children(
        children: &mut Vec<AstNode>,
        key: &str,
        new_value: Option<&KeyValuesValue>,
    ) -> Result<()> {
        if let Some(value) = new_value {
            let kv_node = KeyValueNode {
                node_type: NodeType::KeyValue,
                start: Position {
                    offset: 0,
                    line: 0,
                    column: 0,
                },
                end: Position {
                    offset: 0,
                    line: 0,
                    column: 0,
                },
                raw: String::new(),
                key: StringNode {
                    node_type: NodeType::String,
                    start: Position {
                        offset: 0,
                        line: 0,
                        column: 0,
                    },
                    end: Position {
                        offset: 0,
                        line: 0,
                        column: 0,
                    },
                    raw: format!("\"{}\"", key),
                    value: key.to_string(),
                    quoted: true,
                    quote_char: Some("\"".to_string()),
                },
                value: Self::create_value_node(value)?,
                separator: Some(WhitespaceNode {
                    node_type: NodeType::Whitespace,
                    start: Position {
                        offset: 0,
                        line: 0,
                        column: 0,
                    },
                    end: Position {
                        offset: 0,
                        line: 0,
                        column: 0,
                    },
                    raw: "    ".to_string(),
                    value: "    ".to_string(),
                }),
                conditional_separator: None,
                conditional: None,
            };
            children.push(AstNode::KeyValue(Box::new(kv_node)));
        }
        Ok(())
    }

    fn remove_keyvalue_from_ast_path(ast: &mut DocumentNode, path_parts: &[&str]) -> Result<()> {
        if path_parts.is_empty() {
            return Err(KvError::InvalidPath {
                path: String::new(),
            });
        }

        if path_parts.len() == 1 {
            Self::remove_keyvalue_from_children(&mut ast.children, path_parts[0])
        } else {
            Self::remove_in_nested_path(&mut ast.children, path_parts)
        }
    }

    fn remove_in_nested_path(children: &mut [AstNode], path_parts: &[&str]) -> Result<()> {
        let key = path_parts[0];

        for child in children.iter_mut() {
            if let AstNode::KeyValue(kv) = child
                && kv.key.value == key
                && let ValueNode::Object(obj) = &mut kv.value
            {
                if path_parts.len() == 2 {
                    return Self::remove_keyvalue_from_children(&mut obj.children, path_parts[1]);
                } else {
                    return Self::remove_in_nested_path(&mut obj.children, &path_parts[1..]);
                }
            }
        }

        Err(KvError::PathNotFound {
            path: path_parts.join("."),
        })
    }

    fn remove_keyvalue_from_children(children: &mut Vec<AstNode>, key: &str) -> Result<()> {
        if let Some(pos) = children.iter().position(|child| {
            if let AstNode::KeyValue(kv) = child {
                kv.key.value == key
            } else {
                false
            }
        }) {
            children.remove(pos);
            Ok(())
        } else {
            Err(KvError::PathNotFound {
                path: key.to_string(),
            })
        }
    }

    /// Create a ValueNode from a KeyValuesValue.
    ///
    /// Note: Arrays are not supported in the AST representation and will return an error.
    /// KeyValues format does not natively support arrays, and arrays are only used
    /// internally when duplicate keys are encountered during parsing.
    fn create_value_node(value: &KeyValuesValue) -> Result<ValueNode> {
        match value {
            KeyValuesValue::String(s) => Ok(ValueNode::String(StringNode {
                node_type: NodeType::String,
                start: Position {
                    offset: 0,
                    line: 0,
                    column: 0,
                },
                end: Position {
                    offset: 0,
                    line: 0,
                    column: 0,
                },
                raw: format!("\"{}\"", s),
                value: s.clone(),
                quoted: true,
                quote_char: Some("\"".to_string()),
            })),
            KeyValuesValue::Number(n) => Ok(ValueNode::Number(NumberNode {
                node_type: NodeType::Number,
                start: Position {
                    offset: 0,
                    line: 0,
                    column: 0,
                },
                end: Position {
                    offset: 0,
                    line: 0,
                    column: 0,
                },
                raw: n.to_string(),
                value: *n,
                is_float: n.fract() != 0.0,
            })),
            KeyValuesValue::Object(obj) => {
                let mut children = Vec::new();
                let mut raw_parts = Vec::new();

                for (key, val) in obj {
                    let key_node = StringNode {
                        node_type: NodeType::String,
                        start: Position {
                            offset: 0,
                            line: 0,
                            column: 0,
                        },
                        end: Position {
                            offset: 0,
                            line: 0,
                            column: 0,
                        },
                        raw: format!("\"{}\"", key),
                        value: key.clone(),
                        quoted: true,
                        quote_char: Some("\"".to_string()),
                    };

                    let value_node = Self::create_value_node(val)?;

                    let kv_node = KeyValueNode {
                        node_type: NodeType::KeyValue,
                        start: Position {
                            offset: 0,
                            line: 0,
                            column: 0,
                        },
                        end: Position {
                            offset: 0,
                            line: 0,
                            column: 0,
                        },
                        raw: String::new(),
                        key: key_node.clone(),
                        value: value_node.clone(),
                        separator: Some(WhitespaceNode {
                            node_type: NodeType::Whitespace,
                            start: Position {
                                offset: 0,
                                line: 0,
                                column: 0,
                            },
                            end: Position {
                                offset: 0,
                                line: 0,
                                column: 0,
                            },
                            raw: "    ".to_string(),
                            value: "    ".to_string(),
                        }),
                        conditional_separator: None,
                        conditional: None,
                    };

                    raw_parts.push(format!(
                        "{}{}{}",
                        key_node.raw,
                        kv_node.separator.as_ref().unwrap().raw,
                        match &value_node {
                            ValueNode::String(s) => s.raw.clone(),
                            ValueNode::Number(n) => n.raw.clone(),
                            ValueNode::Object(o) => o.raw.clone(),
                        }
                    ));

                    children.push(AstNode::KeyValue(Box::new(kv_node)));
                }

                let raw = if children.is_empty() {
                    "{}".to_string()
                } else {
                    format!("{{\n{}\n}}", raw_parts.join("\n"))
                };

                Ok(ValueNode::Object(Box::new(ObjectNode {
                    node_type: NodeType::Object,
                    start: Position {
                        offset: 0,
                        line: 0,
                        column: 0,
                    },
                    end: Position {
                        offset: 0,
                        line: 0,
                        column: 0,
                    },
                    raw,
                    open_brace: TokenNode {
                        node_type: NodeType::Token,
                        start: Position {
                            offset: 0,
                            line: 0,
                            column: 0,
                        },
                        end: Position {
                            offset: 0,
                            line: 0,
                            column: 0,
                        },
                        raw: "{".to_string(),
                        token_type: "OPEN_BRACE".to_string(),
                        value: "{".to_string(),
                    },
                    children,
                    close_brace: TokenNode {
                        node_type: NodeType::Token,
                        start: Position {
                            offset: 0,
                            line: 0,
                            column: 0,
                        },
                        end: Position {
                            offset: 0,
                            line: 0,
                            column: 0,
                        },
                        raw: "}".to_string(),
                        token_type: "CLOSE_BRACE".to_string(),
                        value: "}".to_string(),
                    },
                })))
            }
            KeyValuesValue::Array(_) => {
                Err(KvError::Other(
                    "Arrays are not supported in AST representation. KeyValues format does not natively support arrays.".to_string()
                ))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diff_no_changes() {
        let mut data1 = KeyValuesObject::new();
        data1.insert(
            "Key".to_string(),
            KeyValuesValue::String("Value".to_string()),
        );

        let diff = DiffGenerator::generate_diff(&data1, &data1);
        assert_eq!(diff.changes.len(), 0);
    }

    #[test]
    fn test_diff_add() {
        let data1 = KeyValuesObject::new();
        let mut data2 = KeyValuesObject::new();
        data2.insert(
            "NewKey".to_string(),
            KeyValuesValue::String("NewValue".to_string()),
        );

        let diff = DiffGenerator::generate_diff(&data1, &data2);
        assert_eq!(diff.changes.len(), 1);
        assert_eq!(diff.changes[0].op, DiffOp::Add);
        assert_eq!(diff.changes[0].path, "NewKey");
    }

    #[test]
    fn test_diff_remove() {
        let mut data1 = KeyValuesObject::new();
        data1.insert(
            "Key".to_string(),
            KeyValuesValue::String("Value".to_string()),
        );
        let data2 = KeyValuesObject::new();

        let diff = DiffGenerator::generate_diff(&data1, &data2);
        assert_eq!(diff.changes.len(), 1);
        assert_eq!(diff.changes[0].op, DiffOp::Remove);
        assert_eq!(diff.changes[0].path, "Key");
    }

    #[test]
    fn test_diff_replace() {
        let mut data1 = KeyValuesObject::new();
        data1.insert(
            "Key".to_string(),
            KeyValuesValue::String("OldValue".to_string()),
        );

        let mut data2 = KeyValuesObject::new();
        data2.insert(
            "Key".to_string(),
            KeyValuesValue::String("NewValue".to_string()),
        );

        let diff = DiffGenerator::generate_diff(&data1, &data2);
        assert_eq!(diff.changes.len(), 1);
        assert_eq!(diff.changes[0].op, DiffOp::Replace);
        assert_eq!(diff.changes[0].path, "Key");
    }

    #[test]
    fn test_diff_nested() {
        let mut inner1 = KeyValuesObject::new();
        inner1.insert(
            "InnerKey".to_string(),
            KeyValuesValue::String("OldValue".to_string()),
        );
        let mut data1 = KeyValuesObject::new();
        data1.insert("Outer".to_string(), KeyValuesValue::Object(inner1));

        let mut inner2 = KeyValuesObject::new();
        inner2.insert(
            "InnerKey".to_string(),
            KeyValuesValue::String("NewValue".to_string()),
        );
        let mut data2 = KeyValuesObject::new();
        data2.insert("Outer".to_string(), KeyValuesValue::Object(inner2));

        let diff = DiffGenerator::generate_diff(&data1, &data2);
        assert_eq!(diff.changes.len(), 1);
        assert_eq!(diff.changes[0].path, "Outer.InnerKey");
    }

    #[test]
    fn test_apply_diff() {
        let mut data = KeyValuesObject::new();
        data.insert(
            "Key".to_string(),
            KeyValuesValue::String("OldValue".to_string()),
        );

        let diff = DocumentDiff {
            changes: vec![DiffEntry {
                op: DiffOp::Replace,
                path: "Key".to_string(),
                old_value: Some(KeyValuesValue::String("OldValue".to_string())),
                new_value: Some(KeyValuesValue::String("NewValue".to_string())),
            }],
        };

        let result = DiffApplicator::apply_to_data(&data, &diff).unwrap();
        assert_eq!(
            result.get("Key"),
            Some(&KeyValuesValue::String("NewValue".to_string()))
        );
    }

    #[test]
    fn test_diff_stats() {
        let diff = DocumentDiff {
            changes: vec![
                DiffEntry {
                    op: DiffOp::Add,
                    path: "Key1".to_string(),
                    old_value: None,
                    new_value: Some(KeyValuesValue::String("Value".to_string())),
                },
                DiffEntry {
                    op: DiffOp::Remove,
                    path: "Key2".to_string(),
                    old_value: Some(KeyValuesValue::String("Value".to_string())),
                    new_value: None,
                },
                DiffEntry {
                    op: DiffOp::Replace,
                    path: "Key3".to_string(),
                    old_value: Some(KeyValuesValue::String("Old".to_string())),
                    new_value: Some(KeyValuesValue::String("New".to_string())),
                },
            ],
        };

        let stats = DiffGenerator::get_stats(&diff);
        assert_eq!(stats.total, 3);
        assert_eq!(stats.added, 1);
        assert_eq!(stats.removed, 1);
        assert_eq!(stats.modified, 1);
    }

    #[test]
    fn test_create_value_node_object_with_children() {
        let mut inner_obj = KeyValuesObject::new();
        inner_obj.insert(
            "inner_key".to_string(),
            KeyValuesValue::String("inner_value".to_string()),
        );
        inner_obj.insert("inner_number".to_string(), KeyValuesValue::Number(42.0));

        let mut outer_obj = KeyValuesObject::new();
        outer_obj.insert(
            "outer_key".to_string(),
            KeyValuesValue::String("outer_value".to_string()),
        );
        outer_obj.insert("nested".to_string(), KeyValuesValue::Object(inner_obj));

        let value_node =
            DiffApplicator::create_value_node(&KeyValuesValue::Object(outer_obj)).unwrap();

        match value_node {
            ValueNode::Object(obj) => {
                assert_eq!(obj.children.len(), 2);

                let mut found_outer = false;
                let mut found_nested = false;

                for child in &obj.children {
                    if let AstNode::KeyValue(kv) = child {
                        match &kv.value {
                            ValueNode::String(s) => {
                                if kv.key.value == "outer_key" && s.value == "outer_value" {
                                    found_outer = true;
                                }
                            }
                            ValueNode::Object(nested_obj) => {
                                if kv.key.value == "nested" {
                                    assert_eq!(nested_obj.children.len(), 2);
                                    found_nested = true;

                                    let mut found_inner_key = false;
                                    let mut found_inner_number = false;

                                    for nested_child in &nested_obj.children {
                                        if let AstNode::KeyValue(nested_kv) = nested_child {
                                            match &nested_kv.value {
                                                ValueNode::String(nested_s) => {
                                                    if nested_kv.key.value == "inner_key"
                                                        && nested_s.value == "inner_value"
                                                    {
                                                        found_inner_key = true;
                                                    }
                                                }
                                                ValueNode::Number(n) => {
                                                    if nested_kv.key.value == "inner_number"
                                                        && n.value == 42.0
                                                    {
                                                        found_inner_number = true;
                                                    }
                                                }
                                                _ => {}
                                            }
                                        }
                                    }

                                    assert!(
                                        found_inner_key,
                                        "Should have inner_key in nested object"
                                    );
                                    assert!(
                                        found_inner_number,
                                        "Should have inner_number in nested object"
                                    );
                                }
                            }
                            _ => {}
                        }
                    }
                }

                assert!(found_outer, "Should have outer_key in object");
                assert!(found_nested, "Should have nested object");
            }
            _ => panic!("Expected Object node"),
        }
    }

    #[test]
    fn test_create_value_node_empty_object() {
        let empty_obj = KeyValuesObject::new();
        let value_node =
            DiffApplicator::create_value_node(&KeyValuesValue::Object(empty_obj)).unwrap();

        match value_node {
            ValueNode::Object(obj) => {
                assert_eq!(obj.children.len(), 0);
                assert_eq!(obj.raw, "{}");
            }
            _ => panic!("Expected Object node"),
        }
    }

    #[test]
    fn test_create_value_node_array_returns_error() {
        let array_value = KeyValuesValue::Array(vec![
            KeyValuesValue::String("item1".to_string()),
            KeyValuesValue::String("item2".to_string()),
        ]);

        let result = DiffApplicator::create_value_node(&array_value);

        assert!(result.is_err(), "Array should return an error");
        match result {
            Err(KvError::Other(msg)) => {
                assert!(
                    msg.contains("Arrays are not supported"),
                    "Error message should mention arrays are not supported"
                );
            }
            _ => panic!("Expected Other error variant"),
        }
    }

    #[test]
    fn test_apply_diff_with_object_value() {
        let mut new_nested = KeyValuesObject::new();
        new_nested.insert(
            "nested_key".to_string(),
            KeyValuesValue::String("new_value".to_string()),
        );
        new_nested.insert("another_key".to_string(), KeyValuesValue::Number(123.0));

        let diff = DocumentDiff {
            changes: vec![DiffEntry {
                op: DiffOp::Add,
                path: "key".to_string(),
                old_value: None,
                new_value: Some(KeyValuesValue::Object(new_nested)),
            }],
        };

        let result = DiffApplicator::apply_to_ast(
            &crate::parser::Parser::parse("", crate::types::ParseOptions::default())
                .unwrap()
                .ast,
            &diff,
        );

        assert!(
            result.is_ok(),
            "Should successfully apply diff with object value"
        );

        let updated_ast = result.unwrap();
        let mut found_key = false;
        for child in &updated_ast.children {
            if let AstNode::KeyValue(kv) = child {
                if kv.key.value == "key" {
                    if let ValueNode::Object(obj) = &kv.value {
                        assert_eq!(
                            obj.children.len(),
                            2,
                            "Nested object should have 2 children"
                        );
                        found_key = true;
                    }
                }
            }
        }
        assert!(found_key, "Should have added key with object value");
    }

    #[test]
    fn test_apply_diff_with_array_value_returns_error() {
        let diff = DocumentDiff {
            changes: vec![DiffEntry {
                op: DiffOp::Add,
                path: "array_key".to_string(),
                old_value: None,
                new_value: Some(KeyValuesValue::Array(vec![KeyValuesValue::String(
                    "item".to_string(),
                )])),
            }],
        };

        let result = DiffApplicator::apply_to_ast(
            &crate::parser::Parser::parse("", crate::types::ParseOptions::default())
                .unwrap()
                .ast,
            &diff,
        );

        assert!(
            result.is_err(),
            "Should return error when trying to apply diff with array value"
        );
    }
}
