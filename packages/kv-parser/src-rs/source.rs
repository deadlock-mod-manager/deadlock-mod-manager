use std::ops::Range;

use crate::evaluate_condition;
use crate::{AstNode, ParseOptions, Parser, Result, TokenType, Tokenizer, ValueNode};

/// A line comment with its UTF-8 byte position in the original input.
#[derive(Debug)]
pub struct LineComment {
    pub start: usize,
    pub text: String,
}

/// One entry in source order, retaining duplicate keys and ancestor conditions.
#[derive(Debug)]
pub struct SourceSite {
    pub path: Vec<String>,
    /// UTF-8 byte position of the key's first character, including its quote.
    pub key_start: usize,
    pub conditions: Vec<String>,
    pub kind: SourceKind,
}

impl SourceSite {
    /// Resolve this entry and its ancestors using caller-provided symbols.
    pub fn applies(&self, mut resolve: impl FnMut(&str) -> Option<bool>) -> Result<bool> {
        for condition in &self.conditions {
            if !evaluate_condition(condition, &mut resolve)? {
                return Ok(false);
            }
        }
        Ok(true)
    }

    pub fn is_unconditional(&self) -> bool {
        self.conditions.is_empty()
    }
}

/// Source ranges are UTF-8 bytes, including an optional leading BOM.
#[derive(Debug)]
pub enum SourceKind {
    Scalar {
        value: String,
        /// The complete value token, including quotes when present.
        value_range: Range<usize>,
    },
    Object {
        /// UTF-8 byte positions of the opening and closing braces themselves.
        open: usize,
        close: usize,
    },
}

/// A strictly parsed, lossless view for source edits. Paths include root keys.
/// The original text stays with the caller; ranges address that exact input.
#[derive(Debug)]
pub struct SourceDocument {
    pub sites: Vec<SourceSite>,
    pub comments: Vec<LineComment>,
}

impl SourceDocument {
    pub fn parse(text: &str, options: ParseOptions) -> Result<Self> {
        let shift = text
            .strip_prefix('\u{feff}')
            .map_or(0, |_| '\u{feff}'.len_utf8());
        let source = &text[shift..];
        let offsets = CharOffsets::new(source, shift);
        let tokens = Tokenizer::with_options(
            source,
            options.allow_escape_sequences,
            options.allow_conditionals,
            options.allow_includes,
        )
        .tokenize()?;
        let comments = tokens
            .iter()
            .filter(|token| token.token_type == TokenType::Comment && token.raw.starts_with("//"))
            .map(|token| LineComment {
                start: offsets.byte(token.offset),
                text: token.raw.trim_end().to_string(),
            })
            .collect();
        let ast = Parser::new(tokens).parse_document_strict()?;
        let mut sites = Vec::new();
        collect_sites(
            &ast.children,
            &mut Vec::new(),
            &mut Vec::new(),
            &offsets,
            &mut sites,
        );
        Ok(Self { sites, comments })
    }
}

fn collect_sites(
    children: &[AstNode],
    path: &mut Vec<String>,
    conditions: &mut Vec<String>,
    offsets: &CharOffsets,
    sites: &mut Vec<SourceSite>,
) {
    for child in children {
        let AstNode::KeyValue(pair) = child else {
            continue;
        };
        let inherited = conditions.len();
        conditions.extend(
            pair.conditional
                .iter()
                .map(|condition| condition.raw.clone()),
        );
        path.push(pair.key.value.clone());
        let scalar = |value: String, start: usize, raw: &str| SourceKind::Scalar {
            value,
            value_range: offsets.byte(start)..offsets.byte(start + raw.chars().count()),
        };
        let kind = match &pair.value {
            ValueNode::Object(object) => SourceKind::Object {
                open: offsets.byte(object.open_brace.start.offset),
                close: offsets.byte(object.close_brace.start.offset),
            },
            ValueNode::String(node) => scalar(node.value.clone(), node.start.offset, &node.raw),
            ValueNode::Number(node) => scalar(node.raw.clone(), node.start.offset, &node.raw),
        };
        sites.push(SourceSite {
            path: path.clone(),
            key_start: offsets.byte(pair.key.start.offset),
            conditions: conditions.clone(),
            kind,
        });
        if let ValueNode::Object(object) = &pair.value {
            collect_sites(&object.children, path, conditions, offsets, sites);
        }
        path.pop();
        conditions.truncate(inherited);
    }
}

// Legacy AST positions count Unicode scalar values; source edits need UTF-8 bytes.
struct CharOffsets {
    bytes: Option<Vec<usize>>,
    shift: usize,
}

impl CharOffsets {
    fn new(parsed: &str, shift: usize) -> Self {
        let bytes = (!parsed.is_ascii()).then(|| {
            let mut bytes: Vec<usize> = parsed.char_indices().map(|(byte, _)| byte).collect();
            bytes.push(parsed.len());
            bytes
        });
        Self { bytes, shift }
    }

    fn byte(&self, offset: usize) -> usize {
        self.bytes.as_ref().map_or(offset, |bytes| bytes[offset]) + self.shift
    }
}

/// Start of the line containing `at`, which must be a UTF-8 character boundary.
pub fn line_start(text: &str, at: usize) -> usize {
    text[..at].rfind('\n').map_or(0, |previous| previous + 1)
}

/// End of the line containing `at`, including its newline when present.
/// `at` must be a UTF-8 character boundary in `text`.
pub fn line_end(text: &str, at: usize) -> usize {
    text[at..]
        .find('\n')
        .map_or(text.len(), |next| at + next + 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_spans_preserve_unicode_bom_trivia_and_duplicate_entries() {
        for newline in ["\n", "\r\n"] {
            for bom in ["", "\u{feff}"] {
                let text = format!(
                    "{bom}Root // café 🦀{newline}{{ Group // trivia{newline}{{ Item /* value */ \"déjà 🦀\"{newline}Item 7 }} [$DESKTOP] }}"
                );
                let doc = SourceDocument::parse(&text, ParseOptions::default()).unwrap();
                let items: Vec<_> = doc
                    .sites
                    .iter()
                    .filter(|site| site.path == ["Root", "Group", "Item"])
                    .collect();
                assert_eq!(items.len(), 2);
                for (site, raw) in items.iter().zip(["\"déjà 🦀\"", "7"]) {
                    let SourceKind::Scalar { value_range, .. } = &site.kind else {
                        panic!("expected scalar")
                    };
                    assert_eq!(&text[value_range.clone()], raw);
                    assert!(text[site.key_start..].starts_with("Item"));
                    assert_eq!(site.conditions, ["[$DESKTOP]"]);
                }
                let root = &doc.sites[0];
                let SourceKind::Object { open, close } = root.kind else {
                    panic!("expected object")
                };
                assert_eq!(&text[open..open + 1], "{");
                assert_eq!(&text[close..close + 1], "}");
                assert!(text[doc.comments[0].start..].starts_with("// café 🦀"));
                assert!(
                    items[0]
                        .applies(|name| (name == "DESKTOP").then_some(true))
                        .unwrap()
                );
                assert!(!items[0].applies(|_| Some(false)).unwrap());
            }
        }
    }

    #[test]
    fn malformed_source_is_not_available_for_edits() {
        let valid = "Root { Group { Item value } }";
        for tail in [" /*", " { }", " [", " }", " [$ON ||]", " #include \"x\""] {
            assert!(
                SourceDocument::parse(&format!("{valid}{tail}"), ParseOptions::default()).is_err(),
                "accepted {tail:?}"
            );
        }
        assert!(SourceDocument::parse("Root { /*", ParseOptions::default()).is_err());
    }

    #[test]
    fn parsing_preserves_unknown_conditions_without_evaluating_them() {
        let doc = SourceDocument::parse("Root { Item value [$CUSTOM] }", ParseOptions::default())
            .unwrap();
        let item = &doc.sites[1];
        assert_eq!(item.conditions, ["[$CUSTOM]"]);
        assert!(item.applies(|_| None).is_err());
        assert!(item.applies(|_| Some(true)).unwrap());
    }

    #[test]
    fn legacy_ast_offsets_stay_compatible_while_source_ranges_are_bytes() {
        let text = "// 🦀 café\nRoot { Item value }";
        let parsed = Parser::parse(text, ParseOptions::default()).unwrap();
        let pair = parsed
            .ast
            .children
            .iter()
            .find_map(|node| match node {
                AstNode::KeyValue(pair) => Some(pair),
                _ => None,
            })
            .unwrap();
        let byte = text.find("Root").unwrap();
        assert_eq!(pair.key.start.offset, text[..byte].chars().count());
        let source = SourceDocument::parse(text, ParseOptions::default()).unwrap();
        assert_eq!(source.sites[0].key_start, byte);
    }

    #[test]
    fn source_options_preserve_literal_backslashes_when_requested() {
        let options = ParseOptions {
            allow_escape_sequences: false,
            ..ParseOptions::default()
        };
        let doc = SourceDocument::parse(r#"Root { Item "c:\new\test" }"#, options).unwrap();
        let SourceKind::Scalar { value, .. } = &doc.sites[1].kind else {
            panic!("expected scalar")
        };
        assert_eq!(value, r"c:\new\test");
    }
}
