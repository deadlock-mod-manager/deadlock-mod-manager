use std::collections::{BTreeMap, HashMap};

use super::binary::{Element, Value, invalid};
use crate::Result;

#[derive(Debug, PartialEq)]
enum Token {
    String(String),
    Punctuation(char),
}

struct Parser<'a> {
    source: &'a str,
    length: usize,
    last_range: std::ops::Range<usize>,
    spans: Vec<(usize, String, Vec<std::ops::Range<usize>>)>,
    elements: Vec<Element>,
    ids: HashMap<String, usize>,
    references: Vec<(usize, String, Vec<String>, bool)>,
}

impl Parser<'_> {
    fn token(&mut self) -> Result<Option<Token>> {
        loop {
            self.source = self.source.trim_start();
            if let Some(comment) = self.source.strip_prefix("//") {
                self.source = comment.split_once('\n').map_or("", |(_, rest)| rest);
            } else if let Some(comment) = self.source.strip_prefix("/*") {
                self.source = comment
                    .split_once("*/")
                    .ok_or_else(|| invalid("unterminated text comment"))?
                    .1;
            } else if let Some(rest) = self.source.strip_prefix(',') {
                self.source = rest;
            } else {
                break;
            }
        }
        let Some(first) = self.source.chars().next() else {
            return Ok(None);
        };
        if "{}[]".contains(first) {
            self.source = &self.source[1..];
            return Ok(Some(Token::Punctuation(first)));
        }
        if first != '"' {
            return Err(invalid("expected a quoted text value"));
        }
        let start = self.length - self.source.len();
        let mut value = String::new();
        let mut chars = self.source[1..].char_indices();
        while let Some((offset, ch)) = chars.next() {
            if ch == '"' {
                self.last_range = start..start + offset + 2;
                self.source = &self.source[offset + 2..];
                return Ok(Some(Token::String(value)));
            }
            if ch == '\\' {
                let (_, escaped) = chars
                    .next()
                    .ok_or_else(|| invalid("truncated text escape"))?;
                match escaped {
                    'n' => value.push('\n'),
                    'r' => value.push('\r'),
                    't' => value.push('\t'),
                    '\\' | '"' => value.push(escaped),
                    _ => {
                        value.push('\\');
                        value.push(escaped);
                    }
                }
            } else {
                value.push(ch);
            }
        }
        Err(invalid("unterminated text string"))
    }

    fn string(&mut self) -> Result<String> {
        match self.token()? {
            Some(Token::String(value)) => Ok(value),
            _ => Err(invalid("expected a quoted text value")),
        }
    }

    fn punctuation(&mut self, expected: char) -> Result<()> {
        if self.token()? != Some(Token::Punctuation(expected)) {
            return Err(invalid("unexpected text delimiter"));
        }
        Ok(())
    }

    fn element(&mut self, kind: String, depth: usize) -> Result<usize> {
        if depth >= 128 || self.elements.len() >= 100_000 {
            return Err(invalid("text element limits exceeded"));
        }
        self.punctuation('{')?;
        let index = self.elements.len();
        self.elements.push(Element {
            kind,
            attributes: BTreeMap::new(),
        });
        loop {
            let name = match self.token()? {
                Some(Token::Punctuation('}')) => break,
                Some(Token::String(name)) => name,
                _ => return Err(invalid("unterminated text element")),
            };
            let kind = self.string()?;
            let value = if kind == "elementid" {
                let id = self.string()?.to_ascii_lowercase();
                if self.ids.insert(id, index).is_some() {
                    return Err(invalid("duplicate text element ID"));
                }
                Value::Other
            } else if kind == "element" {
                let id = self.string()?;
                self.references.push((index, name.clone(), vec![id], false));
                Value::Other
            } else if kind == "element_array" {
                self.punctuation('[')?;
                let mut references = Vec::new();
                let mut ids = Vec::new();
                loop {
                    match self.token()? {
                        Some(Token::Punctuation(']')) => break,
                        Some(Token::String(kind)) => {
                            if references.len() >= 100_000 {
                                return Err(invalid("text reference limits exceeded"));
                            }
                            if kind == "element" {
                                ids.push(self.string()?);
                                references.push(None);
                            } else {
                                references.push(Some(self.element(kind, depth + 1)?));
                                ids.push(String::new());
                            }
                        }
                        _ => return Err(invalid("invalid text element array")),
                    }
                }
                self.references.push((index, name.clone(), ids, true));
                Value::References(references)
            } else if let Some(kind) = kind.strip_suffix("_array") {
                self.punctuation('[')?;
                let mut values = Vec::new();
                let mut ranges = Vec::new();
                let mut numbers = 0;
                loop {
                    match self.token()? {
                        Some(Token::Punctuation(']')) => break,
                        Some(Token::String(value)) => {
                            numbers += value.split_whitespace().count().max(1);
                            if numbers > 4_000_000 {
                                return Err(invalid("text array limits exceeded"));
                            }
                            ranges.push(self.last_range.clone());
                            values.push(value);
                        }
                        _ => return Err(invalid("invalid text value array")),
                    }
                }
                if kind == "vector3" {
                    self.spans.push((index, name.clone(), ranges));
                }
                scalar(kind, &values, true)?
            } else if matches!(
                kind.as_str(),
                "int"
                    | "uint8"
                    | "uint64"
                    | "float"
                    | "bool"
                    | "time"
                    | "string"
                    | "binary"
                    | "vector2"
                    | "vector3"
                    | "vector4"
                    | "angle"
                    | "quaternion"
                    | "matrix"
                    | "color"
            ) {
                scalar(&kind, &[self.string()?], false)?
            } else {
                Value::Reference(Some(self.element(kind, depth + 1)?))
            };
            if self.elements[index]
                .attributes
                .insert(name, value)
                .is_some()
            {
                return Err(invalid("duplicate text attribute"));
            }
        }
        Ok(index)
    }

    fn resolve(mut self) -> Result<Vec<Element>> {
        for (owner, name, ids, array) in self.references {
            let existing = self.elements[owner].attributes.remove(&name);
            let mut references = match existing {
                Some(Value::References(values)) => values,
                _ => vec![None; ids.len()],
            };
            for (reference, id) in references.iter_mut().zip(ids) {
                if !id.is_empty() {
                    *reference = Some(
                        *self
                            .ids
                            .get(&id.to_ascii_lowercase())
                            .ok_or_else(|| invalid("unresolved text element reference"))?,
                    );
                }
            }
            self.elements[owner].attributes.insert(
                name,
                if array {
                    Value::References(references)
                } else {
                    Value::Reference(references[0])
                },
            );
        }
        // KV2 v4 can put metadata before the actual document root.
        let root = self
            .elements
            .iter()
            .position(|element| element.kind != "$prefix_element$")
            .ok_or_else(|| invalid("no text document root"))?;
        if root != 0 {
            self.elements.swap(0, root);
            let remap = |reference: &mut Option<usize>| {
                *reference = reference.map(|index| {
                    if index == 0 {
                        root
                    } else if index == root {
                        0
                    } else {
                        index
                    }
                });
            };
            for element in &mut self.elements {
                for value in element.attributes.values_mut() {
                    match value {
                        Value::Reference(reference) => remap(reference),
                        Value::References(references) => references.iter_mut().for_each(remap),
                        _ => {}
                    }
                }
            }
        }
        Ok(self.elements)
    }
}

fn scalar(kind: &str, values: &[String], array: bool) -> Result<Value> {
    match kind {
        "int" | "uint8" => {
            let values = values
                .iter()
                .map(|value| {
                    value
                        .parse::<i32>()
                        .map_err(|_| invalid("invalid text integer"))
                })
                .collect::<Result<Vec<_>>>()?;
            Ok(if array {
                Value::Integers(values)
            } else {
                Value::Integer(values[0])
            })
        }
        "float" | "time" | "vector2" | "vector3" | "vector4" | "angle" | "quaternion"
        | "matrix" | "color" => {
            let width = match kind {
                "vector2" => 2,
                "vector3" | "angle" => 3,
                "vector4" | "quaternion" | "color" => 4,
                "matrix" => 16,
                _ => 1,
            };
            let mut numbers = Vec::new();
            for value in values {
                let start = numbers.len();
                for word in value.split_whitespace() {
                    let value = word
                        .parse::<f32>()
                        .map_err(|_| invalid("invalid text number"))?;
                    if !value.is_finite() {
                        return Err(invalid("non-finite text number"));
                    }
                    numbers.push(value);
                }
                if numbers.len() - start != width {
                    return Err(invalid("invalid text vector width"));
                }
            }
            Ok(Value::Numbers(numbers))
        }
        "string" if !array => Ok(Value::String(values[0].clone())),
        "bool" if !array => match values[0].as_str() {
            "1" | "true" => Ok(Value::Boolean(true)),
            "0" | "false" => Ok(Value::Boolean(false)),
            _ => Err(invalid("invalid text boolean")),
        },
        _ => Ok(Value::Other),
    }
}

pub(super) fn parse(bytes: &[u8]) -> Result<Vec<Element>> {
    parse_with_spans(bytes).map(|(elements, _)| elements)
}

pub(super) fn parse_with_spans(
    bytes: &[u8],
) -> Result<(
    Vec<Element>,
    Vec<(usize, String, Vec<std::ops::Range<usize>>)>,
)> {
    let text = std::str::from_utf8(bytes).map_err(|_| invalid("text source is not UTF-8"))?;
    let (header, source) = text
        .trim_start_matches('\u{feff}')
        .split_once("-->")
        .ok_or_else(|| invalid("missing text header"))?;
    let words = header.split_whitespace().collect::<Vec<_>>();
    if words.len() != 8
        || words[..4] != ["<!--", "dmx", "encoding", "keyvalues2"]
        || !matches!(words[4], "1" | "2" | "3" | "4")
        || words[5] != "format"
    {
        return Err(invalid("unsupported text header"));
    }
    let mut parser = Parser {
        source,
        length: text.len(),
        last_range: 0..0,
        spans: Vec::new(),
        elements: Vec::new(),
        ids: HashMap::new(),
        references: Vec::new(),
    };
    while let Some(token) = parser.token()? {
        let Token::String(kind) = token else {
            return Err(invalid("expected text element type"));
        };
        parser.element(kind, 0)?;
    }
    if parser.elements.is_empty() {
        return Err(invalid("no text elements"));
    }
    let spans = std::mem::take(&mut parser.spans);
    Ok((parser.resolve()?, spans))
}
