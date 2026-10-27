use std::io::{self, Write};
use vpkmanager::source2::kv3::{Encoding, Value};

pub(super) fn field(
  writer: &mut impl Write,
  key: &str,
  value: &Value,
  encoding: Option<&Encoding>,
  depth: usize,
) -> io::Result<()> {
  write!(writer, "{}", "  ".repeat(depth))?;
  if !key.is_empty()
    && key.bytes().enumerate().all(|(index, byte)| {
      byte == b'_' || byte.is_ascii_alphabetic() || (index > 0 && byte.is_ascii_digit())
    })
  {
    write!(writer, "{key}")?;
  } else {
    serde_json::to_writer(&mut *writer, key).map_err(io::Error::other)?;
  }
  write!(writer, " = ")?;
  write(writer, value, encoding, depth)?;
  writeln!(writer)
}

pub(super) fn write(
  writer: &mut impl Write,
  value: &Value,
  encoding: Option<&Encoding>,
  depth: usize,
) -> io::Result<()> {
  if depth > 128 {
    return Err(io::Error::other("Resource text nesting exceeds 128 levels"));
  }
  let prefix = match encoding.map(Encoding::flag).unwrap_or(0) {
    0 => "",
    1 => "resource:",
    2 => "resource_name:",
    3 => "panorama:",
    4 => "soundevent:",
    5 => "subclass:",
    6 => "entity_name:",
    7 => "localize:",
    _ => return Err(io::Error::other("Unsupported KV3 semantic flag")),
  };
  write!(writer, "{prefix}")?;
  match value {
    Value::Object(fields) => {
      writeln!(writer, "{{")?;
      for (key, value) in fields {
        field(
          writer,
          key,
          value,
          encoding.and_then(|info| info.get(key)),
          depth + 1,
        )?;
      }
      write!(writer, "{}}}", "  ".repeat(depth))
    }
    Value::Array(values) => {
      let inline = values
        .iter()
        .all(|value| !matches!(value, Value::Object(_) | Value::Array(_)));
      if inline {
        write!(writer, "[ ")?;
      } else {
        writeln!(writer, "[")?;
      }
      for (index, value) in values.iter().enumerate() {
        if inline {
          if index > 0 {
            write!(writer, ", ")?;
          }
        } else {
          write!(writer, "{}", "  ".repeat(depth + 1))?;
        }
        let child = encoding
          .and_then(Encoding::as_array)
          .and_then(|items| items.get(index));
        write(writer, value, child, depth + 1)?;
        if !inline {
          writeln!(writer, ",")?;
        }
      }
      if inline {
        write!(writer, " ]")
      } else {
        write!(writer, "{}]", "  ".repeat(depth))
      }
    }
    Value::Null => write!(writer, "null"),
    Value::Bool(value) => write!(writer, "{value}"),
    Value::Int(value) => write!(writer, "{value}"),
    Value::UInt(value) => write!(writer, "{value}"),
    Value::Double(value) => serde_json::to_writer(writer, value).map_err(io::Error::other),
    Value::String(value) => serde_json::to_writer(writer, value).map_err(io::Error::other),
    Value::Binary(value) => write!(writer, "{}", value.len()),
  }
}

pub(super) fn literal_pattern(query: &str) -> String {
  let mut pattern = String::new();
  let mut literal = String::new();
  let mut quoted = false;
  let mut escaped = false;
  let mut whitespace = false;
  for character in query.chars() {
    if !quoted && [' ', '\t'].contains(&character) {
      if !whitespace {
        pattern.push_str(&regex::escape(&literal));
        literal.clear();
        pattern.push_str("[ \\t]+");
      }
      whitespace = true;
      continue;
    }
    whitespace = false;
    literal.push(character);
    if escaped {
      escaped = false;
    } else if quoted && character == '\\' {
      escaped = true;
    } else if character == '"' {
      quoted = !quoted;
    }
  }
  pattern.push_str(&regex::escape(&literal));
  pattern
}
