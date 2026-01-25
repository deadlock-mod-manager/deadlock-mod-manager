use crate::ast::*;
use crate::error::{KvError, Result};
use crate::types::{
    CommentNode, CommentPosition, CommentStyle, DiffEntry, DiffOp, DiffStats, DocumentDiff,
    KeyValuesObject, KeyValuesValue, NodeType, Position, WhitespaceNode,
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
                            comment: None,
                            comment_position: None,
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
                                    comment: None,
                                    comment_position: None,
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
                            comment: None,
                            comment_position: None,
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
                        comment: None,
                        comment_position: None,
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
        // Handle comment operations
        if let Some(comment_text) = &change.comment {
            let path_parts: Vec<&str> = change.path.split('.').collect();
            let position = change.comment_position.unwrap_or(CommentPosition::Before);

            match change.op {
                DiffOp::Add => {
                    Self::add_comment_to_ast_path(ast, &path_parts, comment_text, position)?;
                }
                DiffOp::Remove => {
                    Self::remove_comment_from_ast_path(ast, &path_parts, comment_text)?;
                }
                DiffOp::Replace => {
                    // For replace, remove old comment and add new one
                    Self::remove_comment_from_ast_path(ast, &path_parts, comment_text)?;
                    Self::add_comment_to_ast_path(ast, &path_parts, comment_text, position)?;
                }
            }
            return Ok(());
        }

        // Handle regular data operations
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

        // Special handling for arrays at the top level
        if path_parts.len() == 1 {
            if let Some(KeyValuesValue::Array(arr)) = new_value {
                return Self::replace_array_keyvalues(&mut ast.children, path_parts[0], arr);
            }
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
                    // Check if new_value is an array and handle it specially
                    if let Some(KeyValuesValue::Array(arr)) = new_value {
                        return Self::replace_array_keyvalues(
                            &mut obj.children,
                            path_parts[1],
                            arr,
                        );
                    }
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

    /// Replace all KeyValue nodes with the given key with nodes from an array.
    /// This handles the case where duplicate keys need to be replaced with a new array of values.
    fn replace_array_keyvalues(
        children: &mut Vec<AstNode>,
        key: &str,
        array_values: &[KeyValuesValue],
    ) -> Result<()> {
        // Find the position of the first occurrence
        let first_pos = children.iter().position(|child| {
            if let AstNode::KeyValue(kv) = child {
                kv.key.value == key
            } else {
                false
            }
        });

        if first_pos.is_none() {
            return Err(KvError::PathNotFound {
                path: key.to_string(),
            });
        }

        let first_pos = first_pos.unwrap();

        // Capture the formatting from the preceding whitespace node and the KeyValue separator
        // Indentation is in the whitespace node BEFORE the KeyValue, not in the key's raw string
        let (indentation, separator_raw) = {
            // Get indentation from whitespace before first KeyValue
            let indent = if first_pos > 0 {
                if let AstNode::Whitespace(ws) = &children[first_pos - 1] {
                    // Extract tabs after the last newline
                    let tabs: String = ws
                        .raw
                        .chars()
                        .rev()
                        .take_while(|c| *c == '\t' || *c == ' ')
                        .collect::<String>()
                        .chars()
                        .rev()
                        .collect();
                    if tabs.is_empty() {
                        "\t\t\t".to_string()
                    } else {
                        tabs
                    }
                } else {
                    "\t\t\t".to_string()
                }
            } else {
                "\t\t\t".to_string()
            };

            // Get separator from the KeyValue node
            let sep = if let AstNode::KeyValue(kv) = &children[first_pos] {
                kv.separator
                    .as_ref()
                    .map(|s| s.raw.clone())
                    .unwrap_or_else(|| "\t\t\t\t".to_string())
            } else {
                "\t\t\t\t".to_string()
            };

            (indent, sep)
        };

        // Find positions of all KeyValue nodes with this key
        // IMPORTANT: Preserve whitespace before the FIRST occurrence (it separates from previous content)
        // Remove whitespace before subsequent occurrences (they're just separators between duplicate keys)
        let mut positions_to_remove: Vec<usize> = Vec::new();
        let mut is_first = true;
        for (i, child) in children.iter().enumerate() {
            if let AstNode::KeyValue(kv) = child {
                if kv.key.value == key {
                    // For non-first occurrences, remove preceding whitespace
                    if !is_first && i > 0 && matches!(&children[i - 1], AstNode::Whitespace(_)) {
                        if positions_to_remove.last() != Some(&(i - 1)) {
                            positions_to_remove.push(i - 1);
                        }
                    }
                    positions_to_remove.push(i);
                    is_first = false;
                }
            }
        }

        // Remove in reverse order to preserve indices
        for pos in positions_to_remove.into_iter().rev() {
            children.remove(pos);
        }

        // Find where to insert: after the last KeyValue, but before any trailing whitespace
        // Trailing whitespace (before closing brace) should remain at the end
        let mut insert_base = if let Some((last_kv_pos, _)) = children
            .iter()
            .enumerate()
            .rev()
            .find(|(_, child)| matches!(child, AstNode::KeyValue(_)))
        {
            // Found last KeyValue - check what comes after it
            if last_kv_pos + 1 < children.len() {
                // There's something after the last KeyValue
                if matches!(&children[last_kv_pos + 1], AstNode::Whitespace(_)) {
                    // There's whitespace after - check if it's trailing (last node) or separator
                    if last_kv_pos + 1 == children.len() - 1 {
                        // This whitespace is the last node (trailing whitespace before closing brace)
                        // Insert BEFORE it, not after
                        last_kv_pos + 1
                    } else {
                        // Whitespace is a separator between entries, insert after it
                        last_kv_pos + 2
                    }
                } else {
                    // No whitespace after KeyValue, insert right after it
                    last_kv_pos + 1
                }
            } else {
                // Last KeyValue is the last node, insert after it
                last_kv_pos + 1
            }
        } else {
            // No KeyValue found, insert at start
            0
        };

        // Ensure there's whitespace before inserting the first entry
        if insert_base == 0
            || !matches!(
                children.get(insert_base.saturating_sub(1)),
                Some(AstNode::Whitespace(_))
            )
        {
            // Need to add whitespace before first entry
            let ws_raw = format!("\r\n{}", indentation);
            let ws_node = AstNode::Whitespace(WhitespaceNode {
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
                raw: ws_raw.clone(),
                value: ws_raw,
            });
            children.insert(insert_base, ws_node);
            insert_base += 1;
        }

        // Create new KeyValue nodes for each array element
        // Track the current insertion position
        let mut current_pos = insert_base;

        for (i, value) in array_values.iter().enumerate() {
            // Add whitespace before each key EXCEPT the first one (which uses preserved/added whitespace)
            if i > 0 {
                let ws_raw = format!("\r\n{}", indentation);
                children.insert(
                    current_pos,
                    AstNode::Whitespace(WhitespaceNode {
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
                        raw: ws_raw.clone(),
                        value: ws_raw,
                    }),
                );
                current_pos += 1;
            }

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
                    raw: separator_raw.clone(),
                    value: separator_raw.clone(),
                }),
                conditional_separator: None,
                conditional: None,
            };

            children.insert(current_pos, AstNode::KeyValue(Box::new(kv_node)));
            current_pos += 1;
        }

        // Always ensure trailing whitespace exists after the last entry (for closing brace)
        // This is critical because comment removal may have removed the original trailing whitespace
        // For SearchPaths entries (3 tabs indentation), trailing whitespace is newline + 2 tabs
        // This ensures the closing brace is on its own line with proper indentation
        let trailing_ws = "\r\n\t\t".to_string();

        // Remove any existing trailing whitespace (it might be wrong format)
        while matches!(children.last(), Some(AstNode::Whitespace(_))) {
            children.pop();
        }

        // Add correct trailing whitespace
        children.push(AstNode::Whitespace(WhitespaceNode {
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
            raw: trailing_ws.clone(),
            value: trailing_ws,
        }));

        Ok(())
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
                    // Check if new_value is an array and handle it specially
                    if let Some(KeyValuesValue::Array(arr)) = new_value {
                        return Self::add_multiple_keyvalues(&mut obj.children, path_parts[1], arr);
                    }
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

    /// Add multiple KeyValue nodes with the same key (for array values).
    /// This handles the case where we're adding new entries that should be duplicate keys.
    fn add_multiple_keyvalues(
        children: &mut Vec<AstNode>,
        key: &str,
        array_values: &[KeyValuesValue],
    ) -> Result<()> {
        // Check if there's trailing whitespace that should be preserved at the end
        // This whitespace typically contains the newline + indentation before the closing brace
        let trailing_ws = if let Some(last) = children.last() {
            if matches!(last, AstNode::Whitespace(_)) {
                children.pop()
            } else {
                None
            }
        } else {
            None
        };

        // Add each array element as a separate KeyValue node
        for (i, value) in array_values.iter().enumerate() {
            // Only add whitespace if the last node is not already whitespace (or if it's the first entry)
            if i == 0
                || !children
                    .last()
                    .map(|c| matches!(c, AstNode::Whitespace(_)))
                    .unwrap_or(false)
            {
                let ws_node = AstNode::Whitespace(WhitespaceNode {
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
                    raw: "\r\n\t\t\t".to_string(),
                    value: "\r\n\t\t\t".to_string(),
                });
                children.push(ws_node);
            }

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

        // Restore trailing whitespace at the end
        if let Some(ws) = trailing_ws {
            children.push(ws);
        }

        Ok(())
    }

    fn add_keyvalue_to_children(
        children: &mut Vec<AstNode>,
        key: &str,
        new_value: Option<&KeyValuesValue>,
    ) -> Result<()> {
        if let Some(value) = new_value {
            // Check if value is an array - handle like replace_array_keyvalues
            if let KeyValuesValue::Array(arr) = value {
                return Self::add_multiple_keyvalues(children, key, arr);
            }

            // Single value - existing logic
            // Detect indentation from existing whitespace, or use default
            let indent = if let Some(last) = children.last() {
                if let AstNode::Whitespace(ws) = last {
                    // Extract indentation (tabs) from existing whitespace
                    let tabs: String = ws
                        .raw
                        .chars()
                        .skip_while(|c| *c != '\n' && *c != '\r')
                        .skip_while(|c| *c == '\n' || *c == '\r')
                        .take_while(|c| *c == '\t')
                        .collect();
                    if !tabs.is_empty() {
                        format!("\n{}", tabs)
                    } else {
                        "\n\t\t\t".to_string()
                    }
                } else {
                    // Look backwards for whitespace to detect indentation
                    let mut found_indent = None;
                    for child in children.iter().rev() {
                        if let AstNode::Whitespace(ws) = child {
                            let tabs: String = ws
                                .raw
                                .chars()
                                .skip_while(|c| *c != '\n' && *c != '\r')
                                .skip_while(|c| *c == '\n' || *c == '\r')
                                .take_while(|c| *c == '\t')
                                .collect();
                            if !tabs.is_empty() {
                                found_indent = Some(format!("\n{}", tabs));
                                break;
                            }
                        } else if let AstNode::KeyValue(_) = child {
                            break;
                        }
                    }
                    found_indent.unwrap_or_else(|| "\n\t\t\t".to_string())
                }
            } else {
                "\n\t\t\t".to_string()
            };

            // Only add whitespace if the last node is not already whitespace
            if !children
                .last()
                .map(|c| matches!(c, AstNode::Whitespace(_)))
                .unwrap_or(false)
            {
                let ws_node = AstNode::Whitespace(WhitespaceNode {
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
                    raw: indent.clone(),
                    value: indent.clone(),
                });
                children.push(ws_node);
            }

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
        // Find all positions with this key, along with their preceding whitespace positions
        let mut positions_to_remove: Vec<usize> = Vec::new();

        for (i, child) in children.iter().enumerate() {
            if let AstNode::KeyValue(kv) = child {
                if kv.key.value == key {
                    // Check if previous node is whitespace - if so, mark it for removal too
                    if i > 0 {
                        if let AstNode::Whitespace(_) = &children[i - 1] {
                            // Only remove whitespace if it's not already marked for removal
                            if !positions_to_remove.contains(&(i - 1)) {
                                positions_to_remove.push(i - 1);
                            }
                        }
                    }
                    positions_to_remove.push(i);
                }
            }
        }

        if positions_to_remove.is_empty() {
            return Err(KvError::PathNotFound {
                path: key.to_string(),
            });
        }

        // Remove all occurrences (in reverse order to maintain indices)
        positions_to_remove.sort();
        for &pos in positions_to_remove.iter().rev() {
            children.remove(pos);
        }

        Ok(())
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

    /// Add a comment to the AST at the specified path
    fn add_comment_to_ast_path(
        ast: &mut DocumentNode,
        path_parts: &[&str],
        comment_text: &str,
        position: CommentPosition,
    ) -> Result<()> {
        if path_parts.is_empty() {
            return Err(KvError::InvalidPath {
                path: String::new(),
            });
        }

        if path_parts.len() == 1 {
            Self::add_comment_to_children(&mut ast.children, path_parts[0], comment_text, position)
        } else {
            Self::add_comment_in_nested_path(&mut ast.children, path_parts, comment_text, position)
        }
    }

    fn add_comment_in_nested_path(
        children: &mut Vec<AstNode>,
        path_parts: &[&str],
        comment_text: &str,
        position: CommentPosition,
    ) -> Result<()> {
        let key = path_parts[0];

        for child in children.iter_mut() {
            if let AstNode::KeyValue(kv) = child
                && kv.key.value == key
                && let ValueNode::Object(obj) = &mut kv.value
            {
                if path_parts.len() == 2 {
                    return Self::add_comment_to_children(
                        &mut obj.children,
                        path_parts[1],
                        comment_text,
                        position,
                    );
                } else {
                    return Self::add_comment_in_nested_path(
                        &mut obj.children,
                        &path_parts[1..],
                        comment_text,
                        position,
                    );
                }
            }
        }

        Err(KvError::PathNotFound {
            path: path_parts.join("."),
        })
    }

    fn add_comment_to_children(
        children: &mut Vec<AstNode>,
        target_key: &str,
        comment_text: &str,
        position: CommentPosition,
    ) -> Result<()> {
        // Find the position of the target key-value node (first occurrence)
        let target_pos = children.iter().position(|child| {
            if let AstNode::KeyValue(kv) = child {
                kv.key.value == target_key
            } else {
                false
            }
        });

        if let Some(pos) = target_pos {
            // Get indentation from the target KeyValue node
            let tabs = if let AstNode::KeyValue(target_kv) = &children[pos] {
                let t: String = target_kv
                    .key
                    .raw
                    .chars()
                    .take_while(|c| *c == '\t' || *c == ' ')
                    .collect();
                if t.is_empty() {
                    "\t\t\t".to_string()
                } else {
                    t
                }
            } else {
                "\t\t\t".to_string()
            };

            // Create comment node with proper indentation
            // Note: Comment raw includes leading tabs but NOT trailing newline
            // The trailing newline will be handled by the whitespace node after it
            let comment_raw = format!("// {}", comment_text);
            let comment_node = AstNode::Comment(CommentNode {
                node_type: NodeType::Comment,
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
                raw: comment_raw.clone(),
                value: comment_text.to_string(),
                style: CommentStyle::Line,
            });

            // Insert comment based on position
            match position {
                CommentPosition::Before => {
                    // Insert comment before the target node
                    // Structure: [existing content] [ws: \r\n + tabs] [comment: // text] [ws: \r\n + tabs] [target]
                    let ws_before_comment = format!("\r\n{}", tabs);
                    let ws_after_comment = format!("\r\n{}", tabs);

                    // Create whitespace node before comment
                    let ws_before_node = AstNode::Whitespace(WhitespaceNode {
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
                        raw: ws_before_comment.clone(),
                        value: ws_before_comment,
                    });

                    // Create whitespace node after comment (before target)
                    let ws_after_node = AstNode::Whitespace(WhitespaceNode {
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
                        raw: ws_after_comment.clone(),
                        value: ws_after_comment,
                    });

                    // Insert in order: ws_before, comment, ws_after (before target at pos)
                    // After insertion, target will be at pos + 3
                    children.insert(pos, ws_before_node);
                    children.insert(pos + 1, comment_node);
                    children.insert(pos + 2, ws_after_node);
                }
                CommentPosition::After => {
                    // For "After" position, place the comment at the very end of all entries
                    // This ensures the comment appears after ALL key-value entries (Game, Mod, Write, etc.)

                    // Find the last KeyValue node in children
                    let last_kv_pos = children
                        .iter()
                        .enumerate()
                        .rev()
                        .find_map(|(i, child)| {
                            if matches!(child, AstNode::KeyValue(_)) {
                                Some(i)
                            } else {
                                None
                            }
                        })
                        .unwrap_or(pos);

                    let insert_pos = last_kv_pos + 1;
                    let ws_content = format!("\r\n{}", tabs);

                    // Insert whitespace before comment
                    let ws_before_node = AstNode::Whitespace(WhitespaceNode {
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
                        raw: ws_content.clone(),
                        value: ws_content,
                    });

                    // Insert: ws_before, comment
                    children.insert(insert_pos, ws_before_node);
                    children.insert(insert_pos + 1, comment_node);
                }
            }
            Ok(())
        } else {
            Err(KvError::PathNotFound {
                path: target_key.to_string(),
            })
        }
    }

    /// Remove a comment from the AST at the specified path
    fn remove_comment_from_ast_path(
        ast: &mut DocumentNode,
        path_parts: &[&str],
        comment_text: &str,
    ) -> Result<()> {
        if path_parts.is_empty() {
            return Err(KvError::InvalidPath {
                path: String::new(),
            });
        }

        if path_parts.len() == 1 {
            Self::remove_comment_from_children(&mut ast.children, comment_text)
        } else {
            Self::remove_comment_in_nested_path(&mut ast.children, path_parts, comment_text)
        }
    }

    fn remove_comment_in_nested_path(
        children: &mut Vec<AstNode>,
        path_parts: &[&str],
        comment_text: &str,
    ) -> Result<()> {
        let key = path_parts[0];

        for child in children.iter_mut() {
            if let AstNode::KeyValue(kv) = child
                && kv.key.value == key
                && let ValueNode::Object(obj) = &mut kv.value
            {
                if path_parts.len() == 2 {
                    return Self::remove_comment_from_children(&mut obj.children, comment_text);
                } else {
                    return Self::remove_comment_in_nested_path(
                        &mut obj.children,
                        &path_parts[1..],
                        comment_text,
                    );
                }
            }
        }

        Err(KvError::PathNotFound {
            path: path_parts.join("."),
        })
    }

    fn remove_comment_from_children(children: &mut Vec<AstNode>, comment_text: &str) -> Result<()> {
        // Find positions of comments to remove, along with their surrounding whitespace
        let mut positions_to_remove: Vec<usize> = Vec::new();

        for (i, child) in children.iter().enumerate() {
            if let AstNode::Comment(comment) = child {
                if comment.value.contains(comment_text) {
                    // Check if previous node is whitespace - if so, mark it for removal too
                    if i > 0 {
                        if let AstNode::Whitespace(_) = &children[i - 1] {
                            // Only remove whitespace if it's not already marked for removal
                            if !positions_to_remove.contains(&(i - 1)) {
                                positions_to_remove.push(i - 1);
                            }
                        }
                    }
                    // Check if next node is whitespace - if so, mark it for removal too
                    if i + 1 < children.len() {
                        if let AstNode::Whitespace(_) = &children[i + 1] {
                            // Only remove whitespace if it's not already marked for removal
                            if !positions_to_remove.contains(&(i + 1)) {
                                positions_to_remove.push(i + 1);
                            }
                        }
                    }
                    positions_to_remove.push(i);
                }
            }
        }

        if positions_to_remove.is_empty() {
            return Ok(());
        }

        // Remove all occurrences (in reverse order to maintain indices)
        positions_to_remove.sort();
        for &pos in positions_to_remove.iter().rev() {
            children.remove(pos);
        }

        Ok(())
    }
}

/// Check if a patch has already been applied to the content
pub fn is_patch_already_applied(content: &str, diff: &DocumentDiff) -> Result<bool> {
    use crate::parser::Parser;
    use crate::types::ParseOptions;

    let parse_result = Parser::parse(content, ParseOptions::default())?;

    for change in &diff.changes {
        let is_applied = match change.op {
            DiffOp::Add => check_add_already_applied(&parse_result.data, change)?,
            DiffOp::Replace => check_replace_already_applied(&parse_result.data, change)?,
            DiffOp::Remove => check_remove_already_applied(&parse_result.data, change)?,
        };

        if !is_applied {
            return Ok(false);
        }
    }

    Ok(true)
}

fn check_add_already_applied(data: &KeyValuesObject, change: &DiffEntry) -> Result<bool> {
    if change.comment.is_some() {
        return Ok(true);
    }

    let path_parts: Vec<&str> = change.path.split('.').collect();
    if path_parts.is_empty() {
        return Ok(false);
    }

    let mut current = data;
    for part in &path_parts[..path_parts.len() - 1] {
        match current.get(*part) {
            Some(KeyValuesValue::Object(obj)) => {
                current = obj;
            }
            _ => return Ok(false),
        }
    }

    let last_key = path_parts[path_parts.len() - 1];

    if let Some(new_value) = &change.new_value {
        if let Some(existing_value) = current.get(last_key) {
            match (new_value, existing_value) {
                (KeyValuesValue::Array(expected_arr), _) => {
                    let actual_values = get_all_values_for_key(current, last_key);
                    return Ok(arrays_match(expected_arr, &actual_values));
                }
                _ => {
                    return Ok(values_equal(existing_value, new_value));
                }
            }
        }
    }

    Ok(false)
}

fn check_replace_already_applied(data: &KeyValuesObject, change: &DiffEntry) -> Result<bool> {
    if change.comment.is_some() {
        return Ok(true);
    }

    let path_parts: Vec<&str> = change.path.split('.').collect();
    if path_parts.is_empty() {
        return Ok(false);
    }

    let mut current = data;
    for part in &path_parts[..path_parts.len() - 1] {
        match current.get(*part) {
            Some(KeyValuesValue::Object(obj)) => {
                current = obj;
            }
            _ => return Ok(false),
        }
    }

    let last_key = path_parts[path_parts.len() - 1];

    if let Some(new_value) = &change.new_value {
        if let Some(existing_value) = current.get(last_key) {
            match (new_value, existing_value) {
                (KeyValuesValue::Array(expected_arr), _) => {
                    let actual_values = get_all_values_for_key(current, last_key);
                    return Ok(arrays_match(expected_arr, &actual_values));
                }
                _ => {
                    return Ok(values_equal(existing_value, new_value));
                }
            }
        }
    }

    Ok(false)
}

fn check_remove_already_applied(data: &KeyValuesObject, change: &DiffEntry) -> Result<bool> {
    if change.comment.is_some() {
        return Ok(true);
    }

    let path_parts: Vec<&str> = change.path.split('.').collect();
    if path_parts.is_empty() {
        return Ok(true);
    }

    let mut current = data;
    for part in &path_parts[..path_parts.len() - 1] {
        match current.get(*part) {
            Some(KeyValuesValue::Object(obj)) => {
                current = obj;
            }
            _ => return Ok(true),
        }
    }

    let last_key = path_parts[path_parts.len() - 1];
    Ok(!current.contains_key(last_key))
}

fn get_all_values_for_key(obj: &KeyValuesObject, key: &str) -> Vec<KeyValuesValue> {
    obj.get(key)
        .map(|v| match v {
            KeyValuesValue::Array(arr) => arr.clone(),
            other => vec![other.clone()],
        })
        .unwrap_or_default()
}

fn arrays_match(expected: &[KeyValuesValue], actual: &[KeyValuesValue]) -> bool {
    if expected.len() != actual.len() {
        return false;
    }

    for (exp, act) in expected.iter().zip(actual.iter()) {
        if !values_equal(exp, act) {
            return false;
        }
    }

    true
}

fn values_equal(a: &KeyValuesValue, b: &KeyValuesValue) -> bool {
    match (a, b) {
        (KeyValuesValue::String(s1), KeyValuesValue::String(s2)) => s1 == s2,
        (KeyValuesValue::Number(n1), KeyValuesValue::Number(n2)) => (n1 - n2).abs() < f64::EPSILON,
        (KeyValuesValue::Object(o1), KeyValuesValue::Object(o2)) => {
            if o1.len() != o2.len() {
                return false;
            }
            for (key, val1) in o1 {
                match o2.get(key) {
                    Some(val2) => {
                        if !values_equal(val1, val2) {
                            return false;
                        }
                    }
                    None => return false,
                }
            }
            true
        }
        (KeyValuesValue::Array(a1), KeyValuesValue::Array(a2)) => {
            if a1.len() != a2.len() {
                return false;
            }
            for (v1, v2) in a1.iter().zip(a2.iter()) {
                if !values_equal(v1, v2) {
                    return false;
                }
            }
            true
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::Parser;
    use crate::serializer::Serializer;
    use crate::types::{ParseOptions, SerializeOptions};

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
                comment: None,
                comment_position: None,
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
                    comment: None,
                    comment_position: None,
                },
                DiffEntry {
                    op: DiffOp::Remove,
                    path: "Key2".to_string(),
                    old_value: Some(KeyValuesValue::String("Value".to_string())),
                    new_value: None,
                    comment: None,
                    comment_position: None,
                },
                DiffEntry {
                    op: DiffOp::Replace,
                    path: "Key3".to_string(),
                    old_value: Some(KeyValuesValue::String("Old".to_string())),
                    new_value: Some(KeyValuesValue::String("New".to_string())),
                    comment: None,
                    comment_position: None,
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
                comment: None,
                comment_position: None,
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
    fn test_apply_diff_with_array_value() {
        let diff = DocumentDiff {
            changes: vec![DiffEntry {
                op: DiffOp::Add,
                path: "array_key".to_string(),
                old_value: None,
                new_value: Some(KeyValuesValue::Array(vec![
                    KeyValuesValue::String("item1".to_string()),
                    KeyValuesValue::String("item2".to_string()),
                ])),
                comment: None,
                comment_position: None,
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
            "Should successfully apply diff with array value"
        );

        let ast = result.unwrap();
        let serialized = crate::serializer::Serializer::serialize_ast(&ast);

        // Verify both items appear as separate entries
        assert!(
            serialized.contains("\"array_key\"") && serialized.contains("\"item1\""),
            "Should contain first array item"
        );
        assert!(
            serialized.contains("\"array_key\"") && serialized.contains("\"item2\""),
            "Should contain second array item"
        );
    }

    #[test]
    fn test_add_comment_before_array_key() {
        // Create an AST with multiple "Game" entries (array representation)
        let input = r#"
"GameInfo"
{
    "FileSystem"
    {
        "SearchPaths"
        {
            "Game"    "citadel"
            "Game"    "core"
        }
    }
}
"#;
        let parse_result = Parser::parse(input, ParseOptions::default()).unwrap();
        let ast = parse_result.ast;

        // Create a diff entry to add comment before "Game"
        let diff = DocumentDiff {
            changes: vec![DiffEntry {
                op: DiffOp::Add,
                path: "GameInfo.FileSystem.SearchPaths.Game".to_string(),
                old_value: None,
                new_value: None,
                comment: Some("Deadlock Mod Manager - Start".to_string()),
                comment_position: Some(CommentPosition::Before),
            }],
        };

        // Apply the diff
        let result = DiffApplicator::apply_to_ast(&ast, &diff);
        assert!(
            result.is_ok(),
            "Should successfully add comment before array key"
        );

        let patched_ast = result.unwrap();
        let serialized = Serializer::serialize_ast(&patched_ast);

        // Verify comment appears before the first "Game" entry
        assert!(
            serialized.contains("// Deadlock Mod Manager - Start"),
            "Comment should appear in serialized output"
        );

        // Find the position of comment relative to Game entries
        let lines: Vec<&str> = serialized.lines().collect();
        let mut comment_line = None;
        let mut first_game_line = None;

        for (i, line) in lines.iter().enumerate() {
            if line.contains("// Deadlock Mod Manager - Start") {
                comment_line = Some(i);
            }
            if line.contains("\"Game\"") && first_game_line.is_none() {
                first_game_line = Some(i);
            }
        }

        assert!(comment_line.is_some(), "Comment should be found in output");
        assert!(
            first_game_line.is_some(),
            "First Game entry should be found"
        );
        assert!(
            comment_line.unwrap() < first_game_line.unwrap(),
            "Comment should appear before first Game entry"
        );
    }

    #[test]
    fn test_add_comment_after_array_key() {
        // Create an AST with multiple "Game" entries
        let input = r#"
"GameInfo"
{
    "FileSystem"
    {
        "SearchPaths"
        {
            "Game"    "citadel"
            "Game"    "core"
        }
    }
}
"#;
        let parse_result = Parser::parse(input, ParseOptions::default()).unwrap();
        let ast = parse_result.ast;

        // Create a diff entry to add comment after "Game"
        let diff = DocumentDiff {
            changes: vec![DiffEntry {
                op: DiffOp::Add,
                path: "GameInfo.FileSystem.SearchPaths.Game".to_string(),
                old_value: None,
                new_value: None,
                comment: Some("Deadlock Mod Manager - End".to_string()),
                comment_position: Some(CommentPosition::After),
            }],
        };

        // Apply the diff
        let result = DiffApplicator::apply_to_ast(&ast, &diff);
        assert!(
            result.is_ok(),
            "Should successfully add comment after array key"
        );

        let patched_ast = result.unwrap();
        let serialized = Serializer::serialize_ast(&patched_ast);

        // Verify comment appears after the last "Game" entry
        assert!(
            serialized.contains("// Deadlock Mod Manager - End"),
            "Comment should appear in serialized output"
        );

        // Find the position of comment relative to Game entries
        let lines: Vec<&str> = serialized.lines().collect();
        let mut comment_line = None;
        let mut last_game_line = None;

        for (i, line) in lines.iter().enumerate() {
            if line.contains("// Deadlock Mod Manager - End") {
                comment_line = Some(i);
            }
            if line.contains("\"Game\"") {
                last_game_line = Some(i);
            }
        }

        assert!(comment_line.is_some(), "Comment should be found in output");
        assert!(last_game_line.is_some(), "Last Game entry should be found");
        assert!(
            comment_line.unwrap() > last_game_line.unwrap(),
            "Comment should appear after last Game entry"
        );
    }

    #[test]
    fn test_add_keyvalue_with_whitespace() {
        // Create an AST with existing entries
        let input = r#"
"GameInfo"
{
    "FileSystem"
    {
        "SearchPaths"
        {
            "Game"    "citadel"
        }
    }
}
"#;
        let parse_result = Parser::parse(input, ParseOptions::default()).unwrap();
        let ast = parse_result.ast;

        // Create a diff entry to add "Mod" key
        let diff = DocumentDiff {
            changes: vec![DiffEntry {
                op: DiffOp::Add,
                path: "GameInfo.FileSystem.SearchPaths.Mod".to_string(),
                old_value: None,
                new_value: Some(KeyValuesValue::String("citadel".to_string())),
                comment: None,
                comment_position: None,
            }],
        };

        // Apply the diff
        let result = DiffApplicator::apply_to_ast(&ast, &diff);
        assert!(result.is_ok(), "Should successfully add new KeyValue");

        let patched_ast = result.unwrap();
        let serialized = Serializer::serialize_ast(&patched_ast);

        // Verify "Mod" appears on a new line (not concatenated with previous entry)
        let lines: Vec<&str> = serialized.lines().collect();
        let mut game_line = None;
        let mut mod_line = None;

        for (i, line) in lines.iter().enumerate() {
            if line.contains("\"Game\"") && game_line.is_none() {
                game_line = Some(i);
            }
            if line.contains("\"Mod\"") {
                mod_line = Some(i);
            }
        }

        assert!(mod_line.is_some(), "Mod entry should be found in output");
        assert!(game_line.is_some(), "Game entry should be found");
        assert!(
            mod_line.unwrap() > game_line.unwrap(),
            "Mod should appear after Game"
        );

        // Verify they're on separate lines (not concatenated)
        assert_ne!(
            mod_line.unwrap(),
            game_line.unwrap(),
            "Mod and Game should be on different lines"
        );
    }

    #[test]
    fn test_end_to_end_patch_with_comments() {
        // Create a sample gameinfo.gi structure
        let input = r#"
"GameInfo"
{
    "FileSystem"
    {
        "SearchPaths"
        {
            "Game_Language"    "citadel_*LANGUAGE*"
            "Game"    "citadel"
            "Game"    "core"
        }
    }
}
"#;
        let parse_result = Parser::parse(input, ParseOptions::default()).unwrap();
        let ast = parse_result.ast;

        // Create a patch similar to enable-mods.patch.json
        let diff = DocumentDiff {
            changes: vec![
                // Add comment before Game
                DiffEntry {
                    op: DiffOp::Add,
                    path: "GameInfo.FileSystem.SearchPaths.Game".to_string(),
                    old_value: None,
                    new_value: None,
                    comment: Some("Deadlock Mod Manager - Start".to_string()),
                    comment_position: Some(CommentPosition::Before),
                },
                // Replace Game array
                DiffEntry {
                    op: DiffOp::Replace,
                    path: "GameInfo.FileSystem.SearchPaths.Game".to_string(),
                    old_value: Some(KeyValuesValue::Array(vec![
                        KeyValuesValue::String("citadel".to_string()),
                        KeyValuesValue::String("core".to_string()),
                    ])),
                    new_value: Some(KeyValuesValue::Array(vec![
                        KeyValuesValue::String("citadel/addons".to_string()),
                        KeyValuesValue::String("citadel".to_string()),
                        KeyValuesValue::String("core".to_string()),
                    ])),
                    comment: None,
                    comment_position: None,
                },
                // Add Mod
                DiffEntry {
                    op: DiffOp::Add,
                    path: "GameInfo.FileSystem.SearchPaths.Mod".to_string(),
                    old_value: None,
                    new_value: Some(KeyValuesValue::String("citadel".to_string())),
                    comment: None,
                    comment_position: None,
                },
                // Add Write
                DiffEntry {
                    op: DiffOp::Add,
                    path: "GameInfo.FileSystem.SearchPaths.Write".to_string(),
                    old_value: None,
                    new_value: Some(KeyValuesValue::String("citadel".to_string())),
                    comment: None,
                    comment_position: None,
                },
                // Add comment after Game
                DiffEntry {
                    op: DiffOp::Add,
                    path: "GameInfo.FileSystem.SearchPaths.Game".to_string(),
                    old_value: None,
                    new_value: None,
                    comment: Some("Deadlock Mod Manager - End".to_string()),
                    comment_position: Some(CommentPosition::After),
                },
            ],
        };

        // Apply the diff
        let result = DiffApplicator::apply_to_ast(&ast, &diff);
        assert!(
            result.is_ok(),
            "Should successfully apply patch with comments"
        );

        let patched_ast = result.unwrap();
        let serialized = Serializer::serialize_ast(&patched_ast);

        // Verify comments appear
        assert!(
            serialized.contains("// Deadlock Mod Manager - Start"),
            "Start comment should appear"
        );
        assert!(
            serialized.contains("// Deadlock Mod Manager - End"),
            "End comment should appear"
        );

        // Verify new entries appear
        assert!(serialized.contains("\"Mod\""), "Mod entry should appear");
        assert!(
            serialized.contains("\"Write\""),
            "Write entry should appear"
        );

        // Verify formatting - each entry should be on its own line
        let lines: Vec<&str> = serialized.lines().collect();
        let mut has_start_comment = false;
        let mut has_end_comment = false;
        let mut game_count = 0;
        let mut has_mod = false;
        let mut has_write = false;

        for line in &lines {
            if line.contains("// Deadlock Mod Manager - Start") {
                has_start_comment = true;
            }
            if line.contains("// Deadlock Mod Manager - End") {
                has_end_comment = true;
            }
            if line.contains("\"Game\"") {
                game_count += 1;
            }
            if line.contains("\"Mod\"") {
                has_mod = true;
            }
            if line.contains("\"Write\"") {
                has_write = true;
            }
        }

        assert!(has_start_comment, "Start comment should be present");
        assert!(has_end_comment, "End comment should be present");
        assert!(game_count >= 2, "Should have multiple Game entries");
        assert!(has_mod, "Mod should be present");
        assert!(has_write, "Write should be present");
    }

    /// Extract the SearchPaths section from serialized gameinfo.gi output
    fn extract_search_paths(serialized: &str) -> String {
        let lines: Vec<&str> = serialized.lines().collect();
        let mut in_search_paths = false;
        let mut brace_depth = 0;
        let mut start_idx = None;
        let mut end_idx = None;

        for (i, line) in lines.iter().enumerate() {
            if line.trim().starts_with("SearchPaths") {
                in_search_paths = true;
                start_idx = Some(i);
                brace_depth = 0;
                // Count opening braces on the same line
                for ch in line.chars() {
                    if ch == '{' {
                        brace_depth += 1;
                    }
                }
                continue;
            }

            if in_search_paths {
                // Count braces to track when SearchPaths block ends
                for ch in line.chars() {
                    if ch == '{' {
                        brace_depth += 1;
                    } else if ch == '}' {
                        brace_depth -= 1;
                        if brace_depth == 0 {
                            end_idx = Some(i + 1);
                            break;
                        }
                    }
                }

                if end_idx.is_some() {
                    break;
                }
            }
        }

        if let (Some(start), Some(end)) = (start_idx, end_idx) {
            lines[start..end].join("\n")
        } else {
            String::new()
        }
    }

    #[test]
    fn test_is_patch_already_applied_simple_add() {
        let mut original = KeyValuesObject::new();
        original.insert(
            "Key1".to_string(),
            KeyValuesValue::String("Value1".to_string()),
        );

        let mut target = original.clone();
        target.insert(
            "Key2".to_string(),
            KeyValuesValue::String("Value2".to_string()),
        );

        let diff = DiffGenerator::generate_diff(&original, &target);

        let serializer = Serializer::new(SerializeOptions::default());
        let original_serialized = serializer.serialize_data(&original).unwrap();
        let target_serialized = serializer.serialize_data(&target).unwrap();

        assert!(
            !is_patch_already_applied(&original_serialized, &diff).unwrap(),
            "Patch should not be applied to original"
        );
        assert!(
            is_patch_already_applied(&target_serialized, &diff).unwrap(),
            "Patch should be applied to target"
        );
    }

    #[test]
    fn test_is_patch_already_applied_replace() {
        let mut original = KeyValuesObject::new();
        original.insert(
            "Key".to_string(),
            KeyValuesValue::String("OldValue".to_string()),
        );

        let mut target = original.clone();
        target.insert(
            "Key".to_string(),
            KeyValuesValue::String("NewValue".to_string()),
        );

        let diff = DiffGenerator::generate_diff(&original, &target);

        let serializer = Serializer::new(SerializeOptions::default());
        let original_serialized = serializer.serialize_data(&original).unwrap();
        let target_serialized = serializer.serialize_data(&target).unwrap();

        assert!(
            !is_patch_already_applied(&original_serialized, &diff).unwrap(),
            "Patch should not be applied to original"
        );
        assert!(
            is_patch_already_applied(&target_serialized, &diff).unwrap(),
            "Patch should be applied to target"
        );
    }

    #[test]
    fn test_is_patch_already_applied_remove() {
        let mut original = KeyValuesObject::new();
        original.insert(
            "Key1".to_string(),
            KeyValuesValue::String("Value1".to_string()),
        );
        original.insert(
            "Key2".to_string(),
            KeyValuesValue::String("Value2".to_string()),
        );

        let mut target = KeyValuesObject::new();
        target.insert(
            "Key1".to_string(),
            KeyValuesValue::String("Value1".to_string()),
        );

        let diff = DiffGenerator::generate_diff(&original, &target);

        let serializer = Serializer::new(SerializeOptions::default());
        let original_serialized = serializer.serialize_data(&original).unwrap();
        let target_serialized = serializer.serialize_data(&target).unwrap();

        assert!(
            !is_patch_already_applied(&original_serialized, &diff).unwrap(),
            "Patch should not be applied to original"
        );
        assert!(
            is_patch_already_applied(&target_serialized, &diff).unwrap(),
            "Patch should be applied to target"
        );
    }
 
    #[test]
    fn test_replace_array_keyvalues_preserves_indentation() {
        // Test that replacing array values preserves proper indentation (3 tabs for SearchPaths)
        let input = r#""GameInfo"
{
	"FileSystem"
	{
		"SearchPaths"
		{
			"Game"			"citadel"
			"Game"			"core"
		}
	}
}"#;

        let parse_result = Parser::parse(input, ParseOptions::default()).unwrap();

        let diff = DocumentDiff {
            changes: vec![DiffEntry {
                op: DiffOp::Replace,
                path: "GameInfo.FileSystem.SearchPaths.Game".to_string(),
                old_value: Some(KeyValuesValue::Array(vec![
                    KeyValuesValue::String("citadel".to_string()),
                    KeyValuesValue::String("core".to_string()),
                ])),
                new_value: Some(KeyValuesValue::Array(vec![
                    KeyValuesValue::String("citadel/addons/profile".to_string()),
                    KeyValuesValue::String("citadel".to_string()),
                    KeyValuesValue::String("core".to_string()),
                ])),
                comment: None,
                comment_position: None,
            }],
        };

        let patched_ast = DiffApplicator::apply_to_ast(&parse_result.ast, &diff).unwrap();
        let result = Serializer::serialize_ast(&patched_ast);

        // Check that Game entries are on separate lines
        assert!(
            result.contains("\"Game\"") && result.contains("citadel/addons/profile"),
            "Should contain new Game entry"
        );

        // Verify no double newlines between entries
        assert!(
            !result.contains("\n\n\t\t\t\"Game\""),
            "Should not have double newlines before Game entries"
        );
        assert!(
            !result.contains("\r\n\r\n\t\t\t\"Game\""),
            "Should not have double CRLF before Game entries"
        );

        // Count Game entries
        let game_count = result.matches("\"Game\"").count();
        assert_eq!(game_count, 3, "Should have exactly 3 Game entries");
    }

    #[test]
    fn test_comment_insertion_preserves_indentation() {
        // Test that adding comments before/after entries preserves proper indentation
        let input = r#""GameInfo"
{
	"FileSystem"
	{
		"SearchPaths"
		{
			"Game"			"citadel"
			"Game"			"core"
		}
	}
}"#;

        let parse_result = Parser::parse(input, ParseOptions::default()).unwrap();

        let diff = DocumentDiff {
            changes: vec![
                DiffEntry {
                    op: DiffOp::Add,
                    path: "GameInfo.FileSystem.SearchPaths.Game".to_string(),
                    old_value: None,
                    new_value: None,
                    comment: Some("Test Start Marker".to_string()),
                    comment_position: Some(CommentPosition::Before),
                },
                DiffEntry {
                    op: DiffOp::Add,
                    path: "GameInfo.FileSystem.SearchPaths.Game".to_string(),
                    old_value: None,
                    new_value: None,
                    comment: Some("Test End Marker".to_string()),
                    comment_position: Some(CommentPosition::After),
                },
            ],
        };

        let patched_ast = DiffApplicator::apply_to_ast(&parse_result.ast, &diff).unwrap();
        let result = Serializer::serialize_ast(&patched_ast);

        // Check comments are present
        assert!(
            result.contains("// Test Start Marker"),
            "Should contain start marker comment"
        );
        assert!(
            result.contains("// Test End Marker"),
            "Should contain end marker comment"
        );

        // Check that comments have proper indentation (tabs before //)
        assert!(
            result.contains("\t// Test Start Marker")
                || result.contains("\t\t\t// Test Start Marker"),
            "Start marker should have tab indentation"
        );
    }
 
 
    #[test]
    fn test_no_orphaned_whitespace_after_removal() {
        // Test that removing KeyValue nodes also removes their associated whitespace
        let input = r#""SearchPaths"
{
	"Game"		"value1"
	"Game"		"value2"
	"Other"		"keep"
}"#;

        let parse_result = Parser::parse(input, ParseOptions::default()).unwrap();

        // Remove all Game entries
        let diff = DocumentDiff {
            changes: vec![DiffEntry {
                op: DiffOp::Remove,
                path: "SearchPaths.Game".to_string(),
                old_value: Some(KeyValuesValue::Array(vec![
                    KeyValuesValue::String("value1".to_string()),
                    KeyValuesValue::String("value2".to_string()),
                ])),
                new_value: None,
                comment: None,
                comment_position: None,
            }],
        };

        let patched_ast = DiffApplicator::apply_to_ast(&parse_result.ast, &diff).unwrap();
        let result = Serializer::serialize_ast(&patched_ast);

        // Should not have Game entries
        assert!(
            !result.contains("\"Game\""),
            "Should not contain Game entries after removal"
        );

        // Should still have Other entry
        assert!(
            result.contains("\"Other\""),
            "Should still contain Other entry"
        );

        // Should not have excessive whitespace (orphaned newlines)
        assert!(
            !result.contains("\n\n\n"),
            "Should not have 3+ consecutive newlines after removal"
        );
    }
}
