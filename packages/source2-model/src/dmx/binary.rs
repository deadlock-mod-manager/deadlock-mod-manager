use std::collections::BTreeMap;

use crate::{Result, Source2Error};

pub(super) fn invalid(message: &str) -> Source2Error {
    Source2Error::DmxDecode(message.into())
}

#[derive(Debug)]
pub(super) enum Value {
    Reference(Option<usize>),
    References(Vec<Option<usize>>),
    Integer(i32),
    Integers(Vec<i32>),
    Numbers(Vec<f32>),
    Boolean(bool),
    String(String),
    Other,
}

pub(super) struct Element {
    pub kind: String,
    pub attributes: BTreeMap<String, Value>,
}

impl Element {
    pub fn string(&self, name: &str) -> Option<&str> {
        match self.attributes.get(name)? {
            Value::String(value) => Some(value),
            _ => None,
        }
    }
    pub fn reference(&self, name: &str) -> Option<usize> {
        match self.attributes.get(name)? {
            Value::Reference(value) => *value,
            _ => None,
        }
    }
    pub fn references(&self, name: &str) -> &[Option<usize>] {
        match self.attributes.get(name) {
            Some(Value::References(values)) => values,
            _ => &[],
        }
    }
    pub fn numbers(&self, name: &str) -> Option<&[f32]> {
        match self.attributes.get(name)? {
            Value::Numbers(values) => Some(values),
            _ => None,
        }
    }
    pub fn integers(&self, name: &str) -> Option<&[i32]> {
        match self.attributes.get(name)? {
            Value::Integers(values) => Some(values),
            _ => None,
        }
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
    version: u32,
    strings: Vec<String>,
}

impl Reader<'_> {
    fn take(&mut self, length: usize) -> Result<&[u8]> {
        let end = self
            .offset
            .checked_add(length)
            .ok_or_else(|| invalid("length overflow"))?;
        let value = self
            .bytes
            .get(self.offset..end)
            .ok_or_else(|| invalid("truncated data"))?;
        self.offset = end;
        Ok(value)
    }
    fn int(&mut self) -> Result<i32> {
        Ok(i32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }
    fn count(&mut self) -> Result<usize> {
        let count = usize::try_from(self.int()?).map_err(|_| invalid("negative count"))?;
        if count > 4_000_000 || count > self.bytes.len() - self.offset {
            return Err(invalid("count exceeds input limits"));
        }
        Ok(count)
    }
    fn inline_string(&mut self) -> Result<String> {
        let remaining = &self.bytes[self.offset..];
        let length = remaining
            .iter()
            .position(|byte| *byte == 0)
            .ok_or_else(|| invalid("unterminated string"))?;
        let value = std::str::from_utf8(self.take(length)?)
            .map_err(|_| invalid("invalid UTF-8 string"))?
            .to_owned();
        self.take(1)?;
        Ok(value)
    }
    fn string(&mut self, inline: bool) -> Result<String> {
        if inline || self.version == 1 {
            return self.inline_string();
        }
        let index = if matches!(self.version, 2..=4) {
            i16::from_le_bytes(self.take(2)?.try_into().unwrap()) as i32
        } else {
            self.int()?
        };
        if index == -1 {
            return Ok(String::new());
        }
        self.strings
            .get(usize::try_from(index).map_err(|_| invalid("invalid string index"))?)
            .cloned()
            .ok_or_else(|| invalid("string index out of range"))
    }
    fn reference(&mut self) -> Result<Option<usize>> {
        match self.int()? {
            -1 => Ok(None),
            -2 => {
                self.inline_string()?;
                Ok(None)
            }
            index => usize::try_from(index)
                .map(Some)
                .map_err(|_| invalid("invalid element index")),
        }
    }
    fn value(&mut self, tag: u8, inline: bool) -> Result<Value> {
        let array_offset = if self.version >= 9 { 32 } else { 14 };
        let array = tag > array_offset;
        let kind = if array { tag - array_offset } else { tag };
        let count = if array { self.count()? } else { 1 };
        match kind {
            1 => {
                let values = (0..count)
                    .map(|_| self.reference())
                    .collect::<Result<Vec<_>>>()?;
                Ok(if array {
                    Value::References(values)
                } else {
                    Value::Reference(values[0])
                })
            }
            2 => {
                let values = (0..count).map(|_| self.int()).collect::<Result<Vec<_>>>()?;
                Ok(if array {
                    Value::Integers(values)
                } else {
                    Value::Integer(values[0])
                })
            }
            3 | 9..=14 => {
                let width = match kind {
                    9 => 2,
                    10 | 12 => 3,
                    11 | 13 => 4,
                    14 => 16,
                    _ => 1,
                };
                let bytes = self.take(
                    count
                        .checked_mul(width * 4)
                        .ok_or_else(|| invalid("array size overflow"))?,
                )?;
                let values = bytes
                    .as_chunks::<4>()
                    .0
                    .iter()
                    .map(|value| f32::from_le_bytes(*value))
                    .collect::<Vec<_>>();
                if values.iter().any(|value| !value.is_finite()) {
                    return Err(invalid("non-finite value"));
                }
                Ok(Value::Numbers(values))
            }
            4 => {
                let bytes = self.take(count)?;
                Ok(if array {
                    Value::Other
                } else {
                    Value::Boolean(bytes[0] != 0)
                })
            }
            5 => {
                let mut scalar = None;
                for _ in 0..count {
                    let value = self.string(inline || array || self.version < 4)?;
                    if !array {
                        scalar = Some(value);
                    }
                }
                Ok(scalar.map_or(Value::Other, Value::String))
            }
            6 => {
                for _ in 0..count {
                    let size = self.count()?;
                    self.take(size)?;
                }
                Ok(Value::Other)
            }
            7 | 8 | 15 | 16 => {
                let width = match kind {
                    7 if self.version <= 2 => 16,
                    15 if self.version >= 9 => 8,
                    16 if self.version >= 9 => 1,
                    7 | 8 => 4,
                    _ => return Err(invalid("unknown attribute type")),
                };
                self.take(
                    count
                        .checked_mul(width)
                        .ok_or_else(|| invalid("array size overflow"))?,
                )?;
                Ok(Value::Other)
            }
            _ => Err(invalid("unknown attribute type")),
        }
    }
    fn attributes(&mut self, inline: bool) -> Result<BTreeMap<String, Value>> {
        let count = self.count()?;
        let mut values = BTreeMap::new();
        for _ in 0..count {
            let name = self.string(inline)?;
            let tag = self.take(1)?[0];
            let value = self.value(tag, inline)?;
            if values.insert(name, value).is_some() {
                return Err(invalid("duplicate attribute"));
            }
        }
        Ok(values)
    }
}

pub(super) fn parse(bytes: &[u8]) -> Result<Vec<Element>> {
    parse_with_ids(bytes, None, None)
}

pub(super) fn canonical_export(bytes: &[u8]) -> Result<Vec<u8>> {
    let mut ids = Vec::new();
    parse_with_ids(bytes, Some(&mut ids), None)?;
    let mut output = bytes.to_vec();
    for id in ids {
        output[id].fill(0);
    }
    Ok(output)
}

fn parse_with_ids(
    bytes: &[u8],
    mut ids: Option<&mut Vec<std::ops::Range<usize>>>,
    mut spans: Option<&mut Vec<(usize, String, std::ops::Range<usize>)>>,
) -> Result<Vec<Element>> {
    let end = bytes
        .iter()
        .take(512)
        .position(|byte| *byte == 0)
        .ok_or_else(|| invalid("missing binary header"))?;
    let header = std::str::from_utf8(&bytes[..end]).map_err(|_| invalid("invalid header"))?;
    let words = header.split_whitespace().collect::<Vec<_>>();
    if words.len() != 9
        || words[..4] != ["<!--", "dmx", "encoding", "binary"]
        || words[5] != "format"
        || words[8] != "-->"
    {
        return Err(invalid("expected a binary DMX header"));
    }
    let version = words[4]
        .parse::<u32>()
        .map_err(|_| invalid("invalid binary version"))?;
    if !matches!(version, 1..=5 | 9) {
        return Err(invalid("supported binary encodings are 1–5 and 9"));
    }
    let mut reader = Reader {
        bytes,
        offset: end + 1,
        version,
        strings: Vec::new(),
    };
    if version >= 9 {
        for _ in 0..reader.count()? {
            reader.attributes(true)?;
        }
    }
    if version != 1 {
        let count = if matches!(version, 2 | 3) {
            usize::try_from(i16::from_le_bytes(reader.take(2)?.try_into().unwrap()))
                .map_err(|_| invalid("negative string count"))?
        } else {
            reader.count()?
        };
        if count > bytes.len() - reader.offset {
            return Err(invalid("invalid string table size"));
        }
        for _ in 0..count {
            let value = reader.inline_string()?;
            reader.strings.push(value);
        }
    }
    let count = reader.count()?;
    if count == 0 || count > 100_000 {
        return Err(invalid("element count must be between 1 and 100000"));
    }
    let mut elements = Vec::with_capacity(count);
    for _ in 0..count {
        let kind = reader.string(false)?;
        reader.string(version < 4)?;
        if let Some(ids) = &mut ids {
            ids.push(reader.offset..reader.offset + 16);
        }
        reader.take(16)?;
        elements.push(Element {
            kind,
            attributes: BTreeMap::new(),
        });
    }
    for (index, element) in elements.iter_mut().enumerate() {
        if let Some(spans) = &mut spans {
            let count = reader.count()?;
            for _ in 0..count {
                let name = reader.string(false)?;
                let tag = reader.take(1)?[0];
                let start = reader.offset;
                let value = reader.value(tag, false)?;
                let array_offset = if version >= 9 { 32 } else { 14 };
                if tag == array_offset + 10 {
                    spans.push((index, name.clone(), start + 4..reader.offset));
                }
                if element.attributes.insert(name, value).is_some() {
                    return Err(invalid("duplicate attribute"));
                }
            }
        } else {
            element.attributes = reader.attributes(false)?;
        }
    }
    for element in &elements {
        for value in element.attributes.values() {
            let invalid_reference = match value {
                Value::Reference(value) => value.is_some_and(|index| index >= count),
                Value::References(values) => values.iter().flatten().any(|index| *index >= count),
                _ => false,
            };
            if invalid_reference {
                return Err(invalid("element reference out of range"));
            }
        }
    }
    Ok(elements)
}

pub(super) fn position_spans(
    bytes: &[u8],
) -> Result<(Vec<Element>, Vec<(usize, String, std::ops::Range<usize>)>)> {
    let mut spans = Vec::new();
    let elements = parse_with_ids(bytes, None, Some(&mut spans))?;
    Ok((elements, spans))
}
