//! Bounded scanner for model metadata text (`m_modelInfo.m_keyValueText`).
//! It is not a KV3 serializer: it preserves authored text verbatim and
//! declines unsupported syntax.
use std::{
  collections::{BTreeMap, BTreeSet},
  ops::Range,
};

/// The `name = value` assignments of an object and the offset of its closing
/// brace. A KV3 header comment is recognized only at the start of the text, and
/// only whitespace or comments may follow the closing brace. Names that differ
/// only in case are ambiguous and decline the scan.
pub(super) fn root_fields(text: &str) -> Option<(usize, BTreeMap<String, Range<usize>>)> {
  let mut cursor = TextCursor {
    text: text.as_bytes(),
    position: 0,
  };
  cursor.space()?;
  if text[cursor.position..].starts_with("<!--") {
    cursor.position += text[cursor.position..].find("-->")? + 3;
  }
  cursor.space()?;
  cursor.expect(b'{')?;
  let mut fields = BTreeMap::new();
  let mut names = BTreeSet::new();
  loop {
    cursor.space()?;
    if cursor.peek()? == b'}' {
      let closing = cursor.position;
      cursor.position += 1;
      cursor.space()?;
      return cursor.peek().is_none().then_some((closing, fields));
    }
    let start = cursor.position;
    while cursor
      .peek()
      .is_some_and(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.'))
    {
      cursor.position += 1;
    }
    if start == cursor.position {
      return None;
    }
    let name = std::str::from_utf8(&cursor.text[start..cursor.position])
      .ok()?
      .to_owned();
    cursor.space()?;
    cursor.expect(b'=')?;
    cursor.space()?;
    cursor.value(0)?;
    if !names.insert(name.to_ascii_lowercase()) {
      return None;
    }
    fields.insert(name, start..cursor.position);
  }
}

/// The range of a field whose name matches case-insensitively.
pub(super) fn field<'a>(
  fields: &'a BTreeMap<String, Range<usize>>,
  name: &str,
) -> Option<&'a Range<usize>> {
  fields
    .iter()
    .find(|(field, _)| field.eq_ignore_ascii_case(name))
    .map(|(_, range)| range)
}

/// The value text of a `name = value` assignment.
pub(super) fn assigned_value(assignment: &str) -> Option<&str> {
  assignment.split_once('=').map(|(_, value)| value.trim())
}

/// The item texts of an array value such as `[ { a = 1 } { a = 2 } ]`.
pub(super) fn array_items(value: &str) -> Option<Vec<&str>> {
  let mut cursor = TextCursor {
    text: value.as_bytes(),
    position: 0,
  };
  cursor.space()?;
  cursor.expect(b'[')?;
  let mut items = Vec::new();
  loop {
    cursor.space()?;
    if cursor.peek()? == b']' {
      cursor.position += 1;
      break;
    }
    let start = cursor.position;
    cursor.value(0)?;
    items.push(&value[start..cursor.position]);
  }
  cursor.space()?;
  cursor.peek().is_none().then_some(items)
}

/// The path of a `resource:"path"` reference.
pub(super) fn resource_name(item: &str) -> Option<String> {
  let quoted = item.trim().strip_prefix("resource:")?;
  serde_json::from_str(quoted).ok()
}

struct TextCursor<'a> {
  text: &'a [u8],
  position: usize,
}

impl TextCursor<'_> {
  fn peek(&self) -> Option<u8> {
    self.text.get(self.position).copied()
  }
  fn expect(&mut self, byte: u8) -> Option<()> {
    if self.peek()? != byte {
      return None;
    }
    self.position += 1;
    Some(())
  }
  fn space(&mut self) -> Option<()> {
    loop {
      while self
        .peek()
        .is_some_and(|byte| byte.is_ascii_whitespace() || byte == b',')
      {
        self.position += 1;
      }
      if self.text.get(self.position..self.position + 2) == Some(b"//") {
        while self.peek().is_some_and(|byte| byte != b'\n') {
          self.position += 1;
        }
      } else if self.text.get(self.position..self.position + 2) == Some(b"/*") {
        self.position += 2;
        while self.text.get(self.position..self.position + 2) != Some(b"*/") {
          self.peek()?;
          self.position += 1;
        }
        self.position += 2;
      } else {
        return Some(());
      }
    }
  }
  // Multiline `"""` strings have different escaping rules; decline them.
  fn quoted(&mut self) -> Option<()> {
    if self.text.get(self.position..self.position + 3) == Some(b"\"\"\"") {
      return None;
    }
    self.expect(b'"')?;
    loop {
      match self.peek()? {
        b'"' => {
          self.position += 1;
          return Some(());
        }
        b'\\' => {
          self.position += 1;
          self.peek()?;
          self.position += 1;
        }
        _ => self.position += 1,
      }
    }
  }
  fn value(&mut self, depth: usize) -> Option<()> {
    if depth > 64 {
      return None;
    }
    match self.peek()? {
      b'{' | b'[' => {
        let closing = if self.peek()? == b'{' { b'}' } else { b']' };
        self.position += 1;
        loop {
          self.space()?;
          if self.peek()? == closing {
            self.position += 1;
            return Some(());
          }
          if matches!(self.peek()?, b'}' | b']') {
            return None;
          }
          self.value(depth + 1)?;
        }
      }
      b'"' => self.quoted(),
      _ => {
        let start = self.position;
        while self.peek().is_some_and(|byte| {
          !byte.is_ascii_whitespace() && !matches!(byte, b',' | b'}' | b']' | b'{' | b'[' | b'"')
        }) {
          self.position += 1;
        }
        if self.position == start {
          return None;
        }
        if self.peek() == Some(b'"') {
          self.quoted()?;
        }
        Some(())
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn scan_handles_nested_values_quotes_comments_and_resource_names() {
    let text = r#"<!-- kv3 format:version{ignored-header-braces} -->
{
  Existing = { name = "escaped \" }" resource = resource:"path/{not_a_block}" /* } */ }
  // CitadelCameraSettings_t = { bogus = true }
  CitadelCameraSettings_t = { offset = [ -10.0, 0.0, 1.0 ] }
  AttachmentCameraData = [ { attachment_name = "near_00" } ]
}
"#;
    let (closing, fields) = root_fields(text).unwrap();
    assert_eq!(&text[closing..closing + 1], "}");
    assert_eq!(
      &text[fields["AttachmentCameraData"].clone()],
      "AttachmentCameraData = [ { attachment_name = \"near_00\" } ]"
    );
    assert_eq!(fields.len(), 3);
    let items =
      array_items(assigned_value(&text[fields["AttachmentCameraData"].clone()]).unwrap()).unwrap();
    assert_eq!(items, ["{ attachment_name = \"near_00\" }"]);
    assert_eq!(
      resource_name(" resource:\"scripts/a.vdata\" ").as_deref(),
      Some("scripts/a.vdata")
    );
    assert!(resource_name("\"scripts/a.vdata\"").is_none());
  }

  #[test]
  fn scan_declines_malformed_ambiguous_and_trailing_text() {
    for text in [
      "{ a = {",
      "{ a = [ } }",
      "{ a = \"unterminated }",
      "{ a = {} a = {} }",
      "{ a = {} A = {} }",
      "{ a = 1 } b = 2",
      "{ a = \"\"\"multi\nline\"\"\" }",
      "prefix --> { a = 1 }",
    ] {
      assert!(root_fields(text).is_none(), "{text}");
    }
    assert!(root_fields("{ a = 1 } // trailing comment\n").is_some());
    let nested = format!("{{ a = {}{} }}", "[".repeat(100), "]".repeat(100));
    assert!(root_fields(&nested).is_none());
    assert!(array_items("[ 1 2 ] 3").is_none());
  }
}
