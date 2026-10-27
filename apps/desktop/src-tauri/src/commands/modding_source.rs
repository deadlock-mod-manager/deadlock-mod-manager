use crate::errors::Error;
#[derive(Clone)]
pub(super) struct Field {
  pub path: String,
  pub name: String,
  pub start: usize,
  pub end: usize,
}
#[derive(Clone)]
struct Token {
  start: usize,
  end: usize,
  text: String,
}
fn invalid(detail: &str) -> Error {
  Error::InvalidInput(format!("Invalid resource source: {detail}"))
}
fn tokens(text: &str) -> Result<Vec<Token>, Error> {
  let bytes = text.as_bytes();
  let mut position = 0;
  let mut result = Vec::new();
  while position < bytes.len() {
    let start = position;
    if bytes[position].is_ascii_whitespace() || bytes[position] == b',' {
      position += 1;
      continue;
    }
    if text[position..].starts_with("<!--") {
      position += text[position..]
        .find("-->")
        .ok_or_else(|| invalid("unterminated header"))?
        + 3;
      continue;
    }
    if text[position..].starts_with("//") {
      position += text[position..].find('\n').unwrap_or(text.len() - position);
      continue;
    }
    if text[position..].starts_with("/*") {
      position += text[position..]
        .find("*/")
        .ok_or_else(|| invalid("unterminated comment"))?
        + 2;
      continue;
    }
    if bytes[position] == b'"' {
      position += 1;
      let mut closed = false;
      while position < bytes.len() {
        match bytes[position] {
          b'\\' => position += 2,
          b'"' => {
            position += 1;
            closed = true;
            break;
          }
          _ => position += 1,
        }
      }
      if !closed {
        return Err(invalid("unterminated string"));
      }
    } else if b"{}[]=:".contains(&bytes[position]) {
      position += 1;
    } else {
      while position < bytes.len()
        && !bytes[position].is_ascii_whitespace()
        && !b"{}[]=:,\"".contains(&bytes[position])
      {
        position += 1;
      }
    }
    if position > bytes.len() || position == start {
      return Err(invalid("invalid token"));
    }
    result.push(Token {
      start,
      end: position,
      text: text[start..position].to_owned(),
    });
    if result.len() > 250_000 {
      return Err(invalid("source has more than 250,000 tokens"));
    }
  }
  Ok(result)
}
struct Parser {
  tokens: Vec<Token>,
  index: usize,
  fields: Vec<Field>,
}
impl Parser {
  fn tree_value(&mut self, depth: usize) -> Result<source2_model::kv3::KvValue, Error> {
    use source2_model::kv3::KvValue;
    if depth > 128 {
      return Err(invalid("nesting exceeds 128 levels"));
    }
    let token = self.peek().to_owned();
    self.index += 1;
    match token.as_str() {
      "{" => {
        let mut values = std::collections::BTreeMap::new();
        while self.peek() != "}" {
          let key = self.peek().to_owned();
          if key.is_empty() || ["[", "]", "=", ":", "{"].contains(&key.as_str()) {
            return Err(invalid("expected a property name"));
          }
          self.index += 1;
          if self.peek() == "=" {
            self.index += 1;
          }
          let key = if key.starts_with('"') {
            serde_json::from_str::<String>(&key).map_err(|_| invalid("invalid quoted key"))?
          } else {
            key
          };
          if values.insert(key, self.tree_value(depth + 1)?).is_some() {
            return Err(invalid("duplicate property"));
          }
        }
        self.index += 1;
        Ok(KvValue::Object(values))
      }
      "[" => {
        let mut values = Vec::new();
        while self.peek() != "]" {
          values.push(self.tree_value(depth + 1)?);
        }
        self.index += 1;
        Ok(KvValue::Array(values))
      }
      "" | "}" | "]" | "=" | ":" => Err(invalid("expected a property value")),
      _ if self.peek() == ":" => {
        self.index += 1;
        self.tree_value(depth + 1)
      }
      "true" => Ok(KvValue::Bool(true)),
      "false" => Ok(KvValue::Bool(false)),
      "null" => Ok(KvValue::Null),
      _ if token.starts_with('"') => serde_json::from_str::<String>(&token)
        .map(KvValue::String)
        .map_err(|_| invalid("invalid quoted string")),
      _ => {
        let value = token
          .parse::<f64>()
          .map_err(|_| invalid("unsupported scalar value"))?;
        if !value.is_finite() {
          return Err(invalid("non-finite number"));
        }
        Ok(KvValue::Float(value))
      }
    }
  }
  fn peek(&self) -> &str {
    self
      .tokens
      .get(self.index)
      .map(|token| token.text.as_str())
      .unwrap_or("")
  }
  fn value(&mut self, path: String, name: String, depth: usize) -> Result<(), Error> {
    if depth > 128 {
      return Err(invalid("nesting exceeds 128 levels"));
    }
    match self.peek() {
      "{" => {
        self.index += 1;
        self.object(&path, depth + 1)?;
        if self.peek() != "}" {
          return Err(invalid("expected }"));
        }
        self.index += 1;
      }
      "[" => {
        self.index += 1;
        let mut index = 0;
        while self.peek() != "]" {
          if self.peek().is_empty() {
            return Err(invalid("expected ]"));
          }
          self.value(format!("{path}[{index}]"), index.to_string(), depth + 1)?;
          index += 1;
        }
        self.index += 1;
      }
      "" | "}" | "]" | "=" | ":" => return Err(invalid("expected a property value")),
      _ => {
        let start = self.tokens[self.index].start;
        self.index += 1;
        if self.peek() == ":" {
          self.index += 1;
          if self.peek().is_empty() {
            return Err(invalid("expected a tagged value"));
          }
          self.index += 1;
        }
        let end = self.tokens[self.index - 1].end;
        self.fields.push(Field {
          path,
          name,
          start,
          end,
        });
      }
    }
    Ok(())
  }
  fn object(&mut self, parent: &str, depth: usize) -> Result<(), Error> {
    while !self.peek().is_empty() && self.peek() != "}" {
      let key = self.peek().to_owned();
      if ["[", "]", "=", ":"].contains(&key.as_str()) {
        return Err(invalid("expected a property name"));
      }
      self.index += 1;
      if self.peek() == "=" {
        self.index += 1;
      }
      let name = key.trim_matches('"').to_owned();
      let path = if parent.is_empty() {
        name.clone()
      } else {
        format!("{parent}/{name}")
      };
      self.value(path, name, depth)?;
    }
    Ok(())
  }
}
pub(super) fn tree(text: &str) -> Result<source2_model::kv3::KvValue, Error> {
  let mut parser = Parser {
    tokens: tokens(text.trim_start_matches('\u{feff}'))?,
    index: 0,
    fields: Vec::new(),
  };
  let value = parser.tree_value(0)?;
  if parser.index != parser.tokens.len() {
    return Err(invalid("unexpected trailing tokens"));
  }
  Ok(value)
}
pub(super) fn fields(text: &str) -> Result<Vec<Field>, Error> {
  let mut parser = Parser {
    tokens: tokens(text.trim_start_matches('\u{feff}'))?,
    index: 0,
    fields: Vec::new(),
  };
  // Offsets must continue to address the original UTF-8 source, including a BOM.
  let bom = if text.starts_with('\u{feff}') { 3 } else { 0 };
  if parser.peek() == "{" {
    parser.index += 1;
    parser.object("", 0)?;
    if parser.peek() != "}" {
      return Err(invalid("expected root }"));
    }
    parser.index += 1;
  } else {
    parser.object("", 0)?;
  }
  if parser.index != parser.tokens.len() {
    return Err(invalid("unexpected trailing tokens"));
  }
  for field in &mut parser.fields {
    field.start += bom;
    field.end += bom;
  }
  Ok(parser.fields)
}
pub(super) fn array_contents(text: &str, name: &str) -> Result<std::ops::Range<usize>, Error> {
  let bom = if text.starts_with('\u{feff}') { 3 } else { 0 };
  let tokens = tokens(&text[bom..])?;
  let mut depth = 0;
  for (index, token) in tokens.iter().enumerate() {
    if depth == 1 && token.text.trim_matches('"') == name {
      let mut start = index + 1;
      if tokens.get(start).is_some_and(|token| token.text == "=") {
        start += 1;
      }
      if tokens.get(start).is_none_or(|token| token.text != "[") {
        continue;
      }
      let mut nested = 0;
      for token in &tokens[start..] {
        match token.text.as_str() {
          "[" => nested += 1,
          "]" => {
            nested -= 1;
            if nested == 0 {
              return Ok(tokens[start].end + bom..token.start + bom);
            }
          }
          _ => {}
        }
      }
      break;
    }
    match token.text.as_str() {
      "{" | "[" => depth += 1,
      "}" | "]" => depth -= 1,
      _ => {}
    }
  }
  Err(invalid("the array is missing or incomplete"))
}
pub(super) fn replace_field(text: &str, path: &str, value: &str) -> Result<String, Error> {
  let parsed = fields(text)?;
  let matches: Vec<_> = parsed.iter().filter(|field| field.path == path).collect();
  if matches.len() != 1 {
    return Err(invalid(
      "the property is missing or ambiguous; use raw source",
    ));
  }
  let field = matches[0];
  let mut result = text.to_owned();
  result.replace_range(field.start..field.end, value);
  fields(&result)?;
  Ok(result)
}
pub(super) fn property_name_range(
  text: &str,
  field: &Field,
) -> Result<std::ops::Range<usize>, Error> {
  let token = tokens(&text[..field.start])?
    .into_iter()
    .rev()
    .find(|token| token.text != "=")
    .ok_or_else(|| invalid("missing property name"))?;
  if token.text.trim_matches('"') != field.name {
    return Err(invalid("ambiguous property name"));
  }
  Ok(token.start..token.end)
}
#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn particle_tree_preserves_typed_inputs_tagged_children_and_empty_arrays() {
    let text = "\u{feff}<!-- kv3 test -->\n{ _class=\"CParticleSystemDefinition\" m_Color=[10,20,30,0.5] m_Children=[{m_ChildRef=resource:\"particles/child.vpcf\"}] m_Empty=[] m_Flag=false m_Name=\"café\\nvalue\" m_Emitters=[{_class=\"C_OP_ContinuousEmitter\" m_flEmitRate={m_nType=\"PF_TYPE_LITERAL\" m_flLiteralValue=1e2}}] }";
    let value = tree(text).unwrap().to_json();
    assert_eq!(value["m_Color"], serde_json::json!([10.0, 20.0, 30.0, 0.5]));
    assert_eq!(value["m_Children"][0]["m_ChildRef"], "particles/child.vpcf");
    assert_eq!(value["m_Empty"], serde_json::json!([]));
    assert_eq!(value["m_Flag"], false);
    assert_eq!(value["m_Name"], "café\nvalue");
    assert_eq!(
      value["m_Emitters"][0]["m_flEmitRate"]["m_flLiteralValue"],
      100.0
    );
    for invalid in ["{a=[", "{a=1} trailing", "{a=1 a=2}", "{a=NaN}"] {
      assert!(tree(invalid).is_err(), "{invalid}");
    }
  }
  #[test]
  fn material_edits_preserve_dynamic_expressions_comments_and_unknown_fields() {
    let text = "\"Layer0\"\n{\n// keep\n\"g_flAltTextureAmount\" \"0\"\n\"Unknown\" \"original\"\n\"DynamicParams\" {\"g_flAltTextureAmount\" \"return max($AmmoPercent,smoothstep(.5,1,$ReloadProgress));\"}\n}";
    let changed = replace_field(text, "Layer0/g_flAltTextureAmount", "\"0.5\"").unwrap();
    assert_eq!(changed, text.replacen("\"0\"", "\"0.5\"", 1));
    assert!(changed.contains("$ReloadProgress"));
  }
  #[test]
  fn particle_arrays_and_tagged_references_are_fully_inspected() {
    let text = "<!-- kv3 format:test -->\n{m_Renderers=[{_class=\"Sprite\" m_hTexture=resource:\"materials/test.vtex\"}] m_Unknown=[1,2,3]}";
    let fields = fields(text).unwrap();
    assert_eq!(fields.len(), 5);
    assert_eq!(fields[1].path, "m_Renderers[0]/m_hTexture");
    assert_eq!(
      &text[fields[1].start..fields[1].end],
      "resource:\"materials/test.vtex\""
    );
    assert!(replace_field(text, "m_Unknown[0]", "\"").is_err());
  }
}
