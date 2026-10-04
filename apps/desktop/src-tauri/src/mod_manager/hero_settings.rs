use crate::errors::Error;
use std::collections::BTreeMap;
use std::ops::Range;

pub const EMPTY_SETTINGS: &str = "<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:generic:version{7412167c-06e9-4698-aff2-e63eb59037e7} -->\n{\n\tbase = {}\n\theroes = {}\n}\n";

#[derive(Debug)]
struct Field {
  name: String,
  range: Range<usize>,
  value: Range<usize>,
  children: Option<Vec<Field>>,
}

pub struct HeroSettings<'a> {
  source: &'a str,
  fields: Vec<Field>,
  base_end: usize,
}

fn invalid() -> Error {
  Error::InvalidInput("Invalid or unsupported citadel_hero_settings.lst".into())
}

struct Parser<'a> {
  source: &'a str,
  position: usize,
}

impl Parser<'_> {
  fn token(&mut self) -> Result<Range<usize>, Error> {
    loop {
      let rest = &self.source[self.position..];
      let trimmed = rest.trim_start_matches(char::is_whitespace);
      self.position += rest.len() - trimmed.len();
      let rest = &self.source[self.position..];
      if rest.starts_with("//") {
        self.position += rest.find('\n').unwrap_or(rest.len());
      } else if rest.starts_with("/*") {
        self.position += rest.find("*/").ok_or_else(invalid)? + 2;
      } else {
        break;
      }
    }
    let start = self.position;
    let bytes = self.source.as_bytes();
    let first = *bytes.get(start).ok_or_else(invalid)?;
    self.position += 1;
    if first == b'"' {
      loop {
        match bytes.get(self.position) {
          Some(b'"') => {
            self.position += 1;
            break;
          }
          Some(b'\\') if self.position + 1 < bytes.len() => self.position += 2,
          Some(_) => self.position += 1,
          None => return Err(invalid()),
        }
      }
    } else if !b"{}[]=,".contains(&first) {
      while let Some(byte) = bytes.get(self.position) {
        if byte.is_ascii_whitespace() || b"{}[]=,\"/".contains(byte) {
          break;
        }
        self.position += 1;
      }
    }
    Ok(start..self.position)
  }

  fn expect(&mut self, expected: &str) -> Result<Range<usize>, Error> {
    let token = self.token()?;
    if &self.source[token.clone()] != expected {
      return Err(invalid());
    }
    Ok(token)
  }

  fn object(&mut self, depth: usize) -> Result<Vec<Field>, Error> {
    if depth > 32 {
      return Err(invalid());
    }
    let mut fields = Vec::<Field>::new();
    loop {
      let key = self.token()?;
      let raw_key = &self.source[key.clone()];
      if raw_key == "}" {
        return Ok(fields);
      }
      let name = if raw_key.starts_with('"') {
        serde_json::from_str::<String>(raw_key).map_err(|_| invalid())?
      } else if raw_key
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'_')
      {
        raw_key.to_string()
      } else {
        return Err(invalid());
      };
      if fields.iter().any(|field| field.name == name) {
        return Err(invalid());
      }
      self.expect("=")?;
      let mut value = self.token()?;
      let children = match &self.source[value.clone()] {
        "{" => {
          let children = self.object(depth + 1)?;
          value.end = self.position;
          Some(children)
        }
        "}" | "=" | "[" | "]" | "," => return Err(invalid()),
        _ => None,
      };
      fields.push(Field {
        name,
        range: key.start..value.end,
        value,
        children,
      });
    }
  }
}

impl<'a> HeroSettings<'a> {
  pub fn parse(source: &'a str) -> Result<Self, Error> {
    let header = source.trim_start_matches('\u{feff}').trim_start();
    if !header.starts_with("<!-- kv3 encoding:text:") {
      return Err(invalid());
    }
    let mut parser = Parser {
      source,
      position: source.find("-->").ok_or_else(invalid)? + 3,
    };
    parser.expect("{")?;
    let fields = parser.object(0)?;
    if !source[parser.position..].trim().is_empty() {
      return Err(invalid());
    }
    let base = fields
      .into_iter()
      .find(|field| field.name == "base")
      .ok_or_else(invalid)?;
    let fields = base.children.ok_or_else(invalid)?;
    Ok(Self {
      source,
      fields,
      base_end: base.value.end - 1,
    })
  }

  pub fn get(&self, key: &str) -> Result<Option<String>, Error> {
    let field = self.fields.iter().find(|field| field.name == key);
    match field {
      Some(field) if field.children.is_none() => Ok(Some(self.source[field.value.clone()].into())),
      Some(_) => Err(invalid()),
      None => Ok(None),
    }
  }

  pub fn update(&self, changes: &BTreeMap<String, Option<String>>) -> Result<String, Error> {
    let mut edits = Vec::new();
    let mut additions = String::new();
    let newline = if self.source.contains("\r\n") {
      "\r\n"
    } else {
      "\n"
    };
    for (key, value) in changes {
      if !key.starts_with("crosshair_")
        || !key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
      {
        return Err(invalid());
      }
      if let Some(value) = value {
        let mut parser = Parser {
          source: value,
          position: 0,
        };
        let token = parser.token()?;
        if token != (0..value.len()) || matches!(value.as_str(), "{" | "}" | "[" | "]" | "=" | ",")
        {
          return Err(invalid());
        }
      }
      let field = self.fields.iter().find(|field| field.name == *key);
      match (field, value) {
        (Some(field), Some(value)) if field.children.is_none() => {
          edits.push((field.value.clone(), value.clone()))
        }
        (Some(field), None) if field.children.is_none() => {
          edits.push((field.range.clone(), String::new()))
        }
        (None, Some(value)) => additions.push_str(&format!("{newline}\t\t{key} = {value}")),
        (None, None) => {}
        _ => return Err(invalid()),
      }
    }
    if !additions.is_empty() {
      additions.push_str(&format!("{newline}\t"));
      let end = self.base_end;
      edits.push((end..end, additions));
    }
    edits.sort_by_key(|(range, _)| range.start);
    let mut result = self.source.to_string();
    for (range, value) in edits.into_iter().rev() {
      result.replace_range(range, &value);
    }
    HeroSettings::parse(&result)?;
    Ok(result)
  }
}
