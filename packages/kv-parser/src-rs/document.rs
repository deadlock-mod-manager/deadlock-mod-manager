use std::fmt;

use crate::ast::DocumentNode;
use crate::diff::{DiffApplicator, DiffGenerator};
use crate::error::{KvError, Result};
use crate::parser::Parser;
use crate::serializer::Serializer;
use crate::types::{
    DiffStats, DocumentDiff, KeyValuesObject, KeyValuesValue, ParseOptions, SerializeOptions,
};

/// Document API for load → modify → save workflows
pub struct KvDocument {
    data: KeyValuesObject,
    ast: Option<DocumentNode>,
    options: SerializeOptions,
}

impl KvDocument {
    /// Create a new empty document
    pub fn new() -> Self {
        Self::with_options(SerializeOptions::default())
    }

    /// Create a new document with custom serialization options
    pub fn with_options(options: SerializeOptions) -> Self {
        Self {
            data: KeyValuesObject::new(),
            ast: None,
            options,
        }
    }

    /// Load from a string
    pub fn load_from_string(&mut self, content: &str) -> Result<()> {
        let result = Parser::parse(content, ParseOptions::default())?;
        self.data = result.data;
        self.ast = Some(result.ast);
        Ok(())
    }

    /// Get a value by path (e.g., "GameInfo.game")
    pub fn get(&self, path: &str) -> Option<&KeyValuesValue> {
        let parts: Vec<&str> = path.split('.').collect();
        let mut current_value: Option<&KeyValuesValue> = None;

        for part in parts {
            let obj = if current_value.is_none() {
                &self.data
            } else if let Some(KeyValuesValue::Object(o)) = current_value {
                o
            } else {
                return None;
            };

            current_value = obj.get(part);
            current_value?;
        }

        current_value
    }

    /// Set a value by path (creates intermediate objects if needed)
    pub fn set(&mut self, path: &str, value: KeyValuesValue) -> Result<()> {
        let parts: Vec<&str> = path.split('.').collect();
        let last_part = parts.last().ok_or_else(|| KvError::InvalidPath {
            path: path.to_string(),
        })?;

        let mut current = &mut self.data;

        // Navigate/create path
        for part in &parts[..parts.len() - 1] {
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
                    return Err(KvError::CannotSetOnNonObject {
                        path: parts[..parts.len() - 1].join("."),
                    });
                }
            }
        }

        current.insert(last_part.to_string(), value);
        self.ast = None; // Clear AST since data was modified
        Ok(())
    }

    /// Delete a value by path
    pub fn delete(&mut self, path: &str) -> Result<bool> {
        let parts: Vec<&str> = path.split('.').collect();
        let last_part = parts.last().ok_or_else(|| KvError::InvalidPath {
            path: path.to_string(),
        })?;

        let mut current = &mut self.data;

        // Navigate to parent
        for part in &parts[..parts.len() - 1] {
            match current.get_mut(*part) {
                Some(KeyValuesValue::Object(obj)) => {
                    current = obj;
                }
                _ => return Ok(false),
            }
        }

        let removed = current.remove(*last_part).is_some();
        if removed {
            self.ast = None; // Clear AST since data was modified
        }
        Ok(removed)
    }

    /// Check if a path exists
    pub fn has(&self, path: &str) -> bool {
        self.get(path).is_some()
    }

    /// Get all keys at a given path
    pub fn keys(&self, path: Option<&str>) -> Vec<String> {
        match path {
            None => self.data.keys().cloned().collect(),
            Some(p) => {
                if let Some(KeyValuesValue::Object(obj)) = self.get(p) {
                    obj.keys().cloned().collect()
                } else {
                    Vec::new()
                }
            }
        }
    }

    /// Get all values at a given path
    pub fn values(&self, path: Option<&str>) -> Vec<&KeyValuesValue> {
        match path {
            None => self.data.values().collect(),
            Some(p) => {
                if let Some(KeyValuesValue::Object(obj)) = self.get(p) {
                    obj.values().collect()
                } else {
                    Vec::new()
                }
            }
        }
    }

    /// Get the entire data object
    pub fn get_data(&self) -> &KeyValuesObject {
        &self.data
    }

    /// Get the AST if available
    pub fn get_ast(&self) -> Option<&DocumentNode> {
        self.ast.as_ref()
    }

    /// Clone the document
    pub fn clone_doc(&self) -> Self {
        Self {
            data: self.data.clone(),
            ast: self.ast.clone(),
            options: self.options.clone(),
        }
    }

    /// Clear the document
    pub fn clear(&mut self) {
        self.data.clear();
        self.ast = None;
    }

    /// Merge another object into the document at a given path
    pub fn merge(&mut self, path: Option<&str>, obj: KeyValuesObject) -> Result<()> {
        match path {
            None => {
                // Merge at root
                for (key, value) in obj {
                    self.data.insert(key, value);
                }
            }
            Some(p) => {
                // Get the target object
                let parts: Vec<&str> = p.split('.').collect();
                let mut current = &mut self.data;

                for part in &parts {
                    if !current.contains_key(*part) {
                        current.insert(
                            part.to_string(),
                            KeyValuesValue::Object(KeyValuesObject::new()),
                        );
                    }

                    match current.get_mut(*part) {
                        Some(KeyValuesValue::Object(target)) => {
                            current = target;
                        }
                        _ => {
                            return Err(KvError::CannotSetOnNonObject {
                                path: p.to_string(),
                            });
                        }
                    }
                }

                // Merge into the target
                for (key, value) in obj {
                    current.insert(key, value);
                }
            }
        }

        self.ast = None; // Clear AST since data was modified
        Ok(())
    }

    /// Generate a diff between this document and another
    pub fn diff(&self, other: &KvDocument) -> DocumentDiff {
        DiffGenerator::generate_diff(&self.data, &other.data)
    }

    /// Apply a diff to this document
    pub fn apply_diff(&mut self, diff: &DocumentDiff) -> Result<()> {
        let updated_data = DiffApplicator::apply_to_data(&self.data, diff)?;
        let updated_ast = if let Some(ast) = &self.ast {
            Some(DiffApplicator::apply_to_ast(ast, diff)?)
        } else {
            None
        };

        self.data = updated_data;
        self.ast = updated_ast; // AST is updated by apply_to_ast, or None if no AST existed
        Ok(())
    }

    /// Compare with another document
    pub fn equals(&self, other: &KvDocument) -> bool {
        let diff = self.diff(other);
        diff.changes.is_empty()
    }

    /// Get diff statistics
    pub fn diff_stats(&self, other: &KvDocument) -> DiffStats {
        let diff = self.diff(other);
        DiffGenerator::get_stats(&diff)
    }

    /// Get a human-readable diff summary
    pub fn diff_summary(&self, other: &KvDocument) -> String {
        let diff = self.diff(other);
        DiffGenerator::format_diff(&diff)
    }

    /// Serialize the document to a string
    pub fn serialize(&self) -> Result<String> {
        if let Some(ast) = &self.ast {
            Ok(Serializer::serialize_ast(ast))
        } else {
            let serializer = Serializer::new(self.options.clone());
            serializer.serialize_data(&self.data)
        }
    }
}

impl fmt::Display for KvDocument {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let serialized = if let Some(ast) = &self.ast {
            Serializer::serialize_ast(ast)
        } else {
            let serializer = Serializer::new(self.options.clone());
            serializer
                .serialize_data(&self.data)
                .unwrap_or_else(|e| format!("[Serialization error: {}]", e))
        };
        write!(f, "{}", serialized)
    }
}

impl Default for KvDocument {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_document_load() {
        let mut doc = KvDocument::new();
        let input = r#""Root" { "Key" "Value" }"#;
        doc.load_from_string(input).unwrap();

        assert!(doc.has("Root"));
        assert!(doc.has("Root.Key"));
    }

    #[test]
    fn test_document_get_set() {
        let mut doc = KvDocument::new();

        doc.set("Root.Key", KeyValuesValue::String("Value".to_string()))
            .unwrap();

        assert_eq!(
            doc.get("Root.Key"),
            Some(&KeyValuesValue::String("Value".to_string()))
        );
    }

    #[test]
    fn test_document_delete() {
        let mut doc = KvDocument::new();

        doc.set("Root.Key", KeyValuesValue::String("Value".to_string()))
            .unwrap();

        assert!(doc.has("Root.Key"));

        let deleted = doc.delete("Root.Key").unwrap();
        assert!(deleted);
        assert!(!doc.has("Root.Key"));
    }

    #[test]
    fn test_document_keys_values() {
        let mut doc = KvDocument::new();

        doc.set("Key1", KeyValuesValue::String("Value1".to_string()))
            .unwrap();
        doc.set("Key2", KeyValuesValue::String("Value2".to_string()))
            .unwrap();

        let keys = doc.keys(None);
        assert_eq!(keys.len(), 2);
        assert!(keys.contains(&"Key1".to_string()));
        assert!(keys.contains(&"Key2".to_string()));
    }

    #[test]
    fn test_document_merge() {
        let mut doc = KvDocument::new();

        doc.set("Root.Key1", KeyValuesValue::String("Value1".to_string()))
            .unwrap();

        let mut merge_obj = KeyValuesObject::new();
        merge_obj.insert(
            "Key2".to_string(),
            KeyValuesValue::String("Value2".to_string()),
        );

        doc.merge(Some("Root"), merge_obj).unwrap();

        assert!(doc.has("Root.Key1"));
        assert!(doc.has("Root.Key2"));
    }

    #[test]
    fn test_document_diff() {
        let mut doc1 = KvDocument::new();
        doc1.set("Key", KeyValuesValue::String("Value1".to_string()))
            .unwrap();

        let mut doc2 = KvDocument::new();
        doc2.set("Key", KeyValuesValue::String("Value2".to_string()))
            .unwrap();

        let diff = doc1.diff(&doc2);
        assert_eq!(diff.changes.len(), 1);
    }

    #[test]
    fn test_document_apply_diff() {
        let mut doc1 = KvDocument::new();
        doc1.set("Key", KeyValuesValue::String("Value1".to_string()))
            .unwrap();

        let mut doc2 = KvDocument::new();
        doc2.set("Key", KeyValuesValue::String("Value2".to_string()))
            .unwrap();

        let diff = doc1.diff(&doc2);
        doc1.apply_diff(&diff).unwrap();

        assert!(doc1.equals(&doc2));
    }

    #[test]
    fn test_document_serialize() {
        let mut doc = KvDocument::new();
        doc.set("Root.Key", KeyValuesValue::String("Value".to_string()))
            .unwrap();

        let output = doc.to_string();
        assert!(output.contains("Root"));
        assert!(output.contains("Key"));
        assert!(output.contains("Value"));
    }

    #[test]
    fn test_document_clone() {
        let mut doc = KvDocument::new();
        doc.set("Key", KeyValuesValue::String("Value".to_string()))
            .unwrap();

        let cloned = doc.clone_doc();
        assert!(cloned.has("Key"));
        assert_eq!(doc.get("Key"), cloned.get("Key"));
    }
}
