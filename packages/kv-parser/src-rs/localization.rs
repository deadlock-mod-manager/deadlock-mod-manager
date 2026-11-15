//! Strict localization tables with lossless, source-positioned edits.

use std::ops::Range;

use thiserror::Error;

use crate::{KvError, SourceDocument, SourceKind, TokenType, Tokenizer, line_start};

#[derive(Debug, Error, PartialEq, Eq)]
pub enum LocalizationError {
    #[error("Invalid localization syntax at line {line}")]
    Syntax { line: usize },
    #[error("Unsupported localization directive at line {line}")]
    UnsupportedDirective { line: usize },
    #[error("Not a localization table")]
    NotLocalization,
}

/// Decode UTF-8 (retaining its optional BOM) or BOM-marked UTF-16 LE/BE.
/// Invalid encoding is a syntax error at line 1, before source positions exist.
pub fn decode(bytes: &[u8]) -> Result<String, LocalizationError> {
    let utf16 = |units: &[u8], unit: fn([u8; 2]) -> u16| {
        let (pairs, []) = units.as_chunks::<2>() else {
            return Err(LocalizationError::Syntax { line: 1 });
        };
        char::decode_utf16(pairs.iter().map(|pair| unit(*pair)))
            .collect::<Result<String, _>>()
            .map_err(|_| LocalizationError::Syntax { line: 1 })
    };
    match bytes {
        [0xFF, 0xFE, units @ ..] => utf16(units, u16::from_le_bytes),
        [0xFE, 0xFF, units @ ..] => utf16(units, u16::from_be_bytes),
        _ => String::from_utf8(bytes.to_vec()).map_err(|_| LocalizationError::Syntax { line: 1 }),
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum LocalizationShape {
    Lang { language: Option<String> },
    Flat { root: String },
}

/// A wrapper scalar outside `Tokens`, available for inspection but not editing.
#[derive(Debug)]
pub struct LocalizationMetadata {
    pub key: String,
    pub value: String,
    pub conditions: Vec<String>,
    pub line: usize,
}

/// A scalar declaration, retaining duplicates and all ancestor conditions.
#[derive(Debug)]
pub struct LocalizationEntry {
    pub key: String,
    pub conditions: Vec<String>,
    /// Exact value-token contents, without surrounding quotes.
    pub raw_value: String,
    pub value: String,
    pub line: usize,
    /// UTF-8 bytes of the value contents in the original text, excluding quotes.
    pub value_range: Range<usize>,
    entry_range: Range<usize>,
    quoted: bool,
}

/// Edits address entries by their source-order index, not by key, so duplicates
/// can be edited independently. Raw values must be valid quoted-token contents;
/// conditions must be complete bracketed KeyValues expressions.
#[derive(Debug)]
pub enum LocalizationEdit<'a> {
    Replace {
        entry: usize,
        raw_value: &'a str,
    },
    Remove {
        entry: usize,
    },
    Append {
        key: &'a str,
        raw_value: &'a str,
        condition: Option<&'a str>,
    },
}

#[derive(Debug)]
pub struct LocalizationDocument {
    pub shape: LocalizationShape,
    pub entries: Vec<LocalizationEntry>,
    metadata: Vec<LocalizationMetadata>,
    insertion: usize,
    close_on_own_line: bool,
    newline: &'static str,
    entry_indent: String,
    block_indent: String,
    create_tokens: bool,
}

impl LocalizationDocument {
    /// Parse the complete input without a token-length cap or symbol evaluation.
    /// Accept one `lang` wrapper with optional `Language`/`Tokens` and scalar
    /// metadata, or one flat root object of scalar pairs. Other shapes are not
    /// localization; wrapper metadata never becomes a token entry.
    pub fn parse(text: &str) -> Result<Self, LocalizationError> {
        let tokens = Tokenizer::new(text.strip_prefix('\u{feff}').unwrap_or(text))
            .with_max_token_length(None)
            .with_strict_termination()
            .tokenize()
            .map_err(syntax_error)?;
        for token in &tokens {
            match token.token_type {
                TokenType::Include | TokenType::Base => {
                    return Err(LocalizationError::UnsupportedDirective { line: token.line });
                }
                TokenType::Conditional => {
                    crate::evaluate_condition(&token.raw, |_| Some(false))
                        .map_err(|_| LocalizationError::Syntax { line: token.line })?;
                }
                _ => {}
            }
        }
        let source = SourceDocument::from_tokens(text, tokens).map_err(syntax_error)?;
        let mut roots = source.sites.iter().filter(|site| site.path.len() == 1);
        let root = roots.next().ok_or(LocalizationError::NotLocalization)?;
        if roots.next().is_some() {
            return Err(LocalizationError::NotLocalization);
        }
        let SourceKind::Object {
            close: root_close, ..
        } = root.kind
        else {
            return Err(LocalizationError::NotLocalization);
        };
        let is_lang = root.path[0].eq_ignore_ascii_case("lang");
        let children: Vec<_> = source
            .sites
            .iter()
            .filter(|site| site.path.len() == 2)
            .collect();
        let mut language = None;
        let mut metadata = Vec::new();
        let mut block = None;
        if is_lang {
            let mut saw_language = false;
            for child in &children {
                match (&child.kind, child.path[1].as_str()) {
                    (SourceKind::Scalar { value, .. }, key)
                        if key.eq_ignore_ascii_case("Language") && !saw_language =>
                    {
                        language = Some(value.clone());
                        saw_language = true;
                    }
                    (SourceKind::Scalar { value, .. }, key)
                        if !key.eq_ignore_ascii_case("Language") =>
                    {
                        metadata.push(LocalizationMetadata {
                            key: key.to_string(),
                            value: value.clone(),
                            conditions: child.conditions.clone(),
                            line: child.line,
                        });
                    }
                    (SourceKind::Object { .. }, key)
                        if key.eq_ignore_ascii_case("Tokens") && block.is_none() =>
                    {
                        block = Some(*child);
                    }
                    _ => return Err(LocalizationError::NotLocalization),
                }
            }
        }
        let (depth, close) = if let Some(block) = block {
            let SourceKind::Object { close, .. } = block.kind else {
                unreachable!()
            };
            (3, close)
        } else {
            (2, root_close)
        };
        let mut entries = Vec::new();
        for site in &source.sites {
            if site.path.len() < depth || (is_lang && block.is_none()) {
                continue;
            }
            let SourceKind::Scalar { value, value_range } = &site.kind else {
                return Err(LocalizationError::NotLocalization);
            };
            if site.path.len() != depth {
                return Err(LocalizationError::NotLocalization);
            }
            let quoted = text[value_range.clone()].starts_with('"');
            let contents = if quoted {
                value_range.start + 1..value_range.end - 1
            } else {
                value_range.clone()
            };
            entries.push(LocalizationEntry {
                key: site.path.last().unwrap().clone(),
                conditions: site.conditions.clone(),
                raw_value: text[contents.clone()].to_string(),
                value: value.clone(),
                line: site.line,
                value_range: contents,
                entry_range: site.entry_range.clone(),
                quoted,
            });
        }
        let root_indent = indentation(text, root.key_start).unwrap_or("");
        let unit = children
            .iter()
            .filter_map(|site| indentation(text, site.key_start))
            .filter_map(|indent| indent.strip_prefix(root_indent))
            .find(|indent| !indent.is_empty())
            .unwrap_or("\t");
        let block_indent = block
            .and_then(|site| indentation(text, site.key_start))
            .map(str::to_string)
            .unwrap_or_else(|| {
                if is_lang {
                    format!("{root_indent}{unit}")
                } else {
                    root_indent.to_string()
                }
            });
        let entry_indent = entries
            .first()
            .and_then(|entry| indentation(text, entry.entry_range.start))
            .map(str::to_string)
            .unwrap_or_else(|| format!("{block_indent}{unit}"));
        let close_on_own_line = indentation(text, close).is_some();
        let insertion = if close_on_own_line {
            line_start(text, close)
        } else {
            close
        };
        Ok(Self {
            shape: if is_lang {
                LocalizationShape::Lang { language }
            } else {
                LocalizationShape::Flat {
                    root: root.path[0].clone(),
                }
            },
            entries,
            metadata,
            insertion,
            close_on_own_line,
            newline: if text.contains("\r\n") { "\r\n" } else { "\n" },
            entry_indent,
            block_indent,
            create_tokens: is_lang && block.is_none(),
        })
    }

    /// Read-only wrapper fields in source order, excluding `Language` and tokens.
    pub fn metadata(&self) -> &[LocalizationMetadata] {
        &self.metadata
    }

    /// Apply nonoverlapping edits to the exact text used to parse this document.
    /// Unedited bytes, including comments and line endings, are copied verbatim.
    /// Replacements of unquoted values become quoted; appends are always quoted.
    ///
    /// # Panics
    /// Panics for out-of-range entry indices, overlapping edits, or invalid source
    /// ranges. Supply at most one replacement/removal for each entry.
    pub fn edit(&self, text: &str, edits: &[LocalizationEdit<'_>]) -> String {
        let mut replacements = Vec::new();
        let mut appended = String::new();
        for edit in edits {
            match edit {
                LocalizationEdit::Replace { entry, raw_value } => {
                    let entry = &self.entries[*entry];
                    replacements.push((
                        entry.value_range.clone(),
                        if entry.quoted {
                            raw_value.to_string()
                        } else {
                            format!("\"{raw_value}\"")
                        },
                    ));
                }
                LocalizationEdit::Remove { entry } => {
                    replacements.push((self.entries[*entry].entry_range.clone(), String::new()));
                }
                LocalizationEdit::Append {
                    key,
                    raw_value,
                    condition,
                } => {
                    appended.push_str(&self.entry_indent);
                    appended.push('"');
                    for ch in key.chars() {
                        match ch {
                            '\\' => appended.push_str("\\\\"),
                            '"' => appended.push_str("\\\""),
                            '\n' => appended.push_str("\\n"),
                            '\t' => appended.push_str("\\t"),
                            _ => appended.push(ch),
                        }
                    }
                    appended.push_str("\"\t\"");
                    appended.push_str(raw_value);
                    appended.push('"');
                    if let Some(condition) = condition {
                        appended.push(' ');
                        appended.push_str(condition);
                    }
                    appended.push_str(self.newline);
                }
            }
        }
        if !appended.is_empty() {
            if self.create_tokens {
                appended = format!(
                    "{indent}\"Tokens\"{nl}{indent}{{{nl}{appended}{indent}}}{nl}",
                    indent = self.block_indent,
                    nl = self.newline,
                );
            }
            if !self.close_on_own_line {
                appended.insert_str(0, self.newline);
            }
            replacements.push((self.insertion..self.insertion, appended));
        }
        replacements.sort_by_key(|(range, _)| range.start);
        let mut result = String::with_capacity(text.len());
        let mut at = 0;
        for (range, replacement) in replacements {
            assert!(range.start >= at, "overlapping localization edits");
            result.push_str(&text[at..range.start]);
            result.push_str(&replacement);
            at = range.end;
        }
        result.push_str(&text[at..]);
        result
    }
}

fn indentation(text: &str, at: usize) -> Option<&str> {
    let prefix = text[line_start(text, at)..at].trim_start_matches('\u{feff}');
    prefix
        .chars()
        .all(|ch| ch == ' ' || ch == '\t')
        .then_some(prefix)
}

fn syntax_error(error: KvError) -> LocalizationError {
    let line = match error {
        KvError::ParseError { line, .. }
        | KvError::TokenError { line, .. }
        | KvError::UnexpectedEof { line, .. }
        | KvError::UnterminatedString { line, .. }
        | KvError::InvalidEscapeSequence { line, .. }
        | KvError::TokenTooLong { line, .. }
        | KvError::UnknownDirective { line, .. }
        | KvError::UnexpectedCharacter { line, .. }
        | KvError::ExpectedToken { line, .. } => line,
        _ => 1,
    };
    LocalizationError::Syntax { line }
}
