use super::super::modding_source::{self, Field};
use crate::errors::Error;

pub(super) struct Replacement {
  pub start: usize,
  pub end: usize,
  pub text: String,
}

pub(super) struct Material {
  pub shader: String,
  pub empty: bool,
  pub unsupported: Vec<String>,
  pub replacements: Vec<Replacement>,
}

pub(super) fn literal<'a>(text: &'a str, field: &Field) -> &'a str {
  let raw = text[field.start..field.end].trim();
  raw
    .strip_prefix("resource:")
    .unwrap_or(raw)
    .trim()
    .trim_matches('"')
}

fn numbers(value: &str, expected: &[f64]) -> bool {
  let values: Option<Vec<f64>> = value
    .trim_matches(['[', ']'])
    .split_whitespace()
    .map(|value| value.parse().ok())
    .collect();
  values.is_some_and(|values| values == expected)
}

// Only the untextured CS2 environment template was compilation-tested.
// Non-default features and texture-bearing materials require an artist's review.
fn template_field(name: &str, value: &str) -> bool {
  match name {
    "shader" => value.eq_ignore_ascii_case("csgo_environment.vfx"),
    "g_vColorTint" => numbers(value, &[1.0, 1.0, 1.0, 0.0]),
    "g_flModelTintAmount" | "g_bFogEnabled" | "g_flWetnessDarkeningStrength1" | "g_nUVSet1" => {
      numbers(value, &[1.0])
    }
    "g_nScaleTexCoordUByModelScaleAxis"
    | "g_nScaleTexCoordVByModelScaleAxis"
    | "g_bSnowLayer1"
    | "g_flTexCoordRotation1"
    | "g_nTextureAddressModeU"
    | "g_nTextureAddressModeV" => numbers(value, &[0.0]),
    "g_vTexCoordCenter1" => numbers(value, &[0.5, 0.5]),
    "g_vTexCoordOffset1" => numbers(value, &[0.0, 0.0]),
    "g_vTexCoordScale1" => numbers(value, &[1.0, 1.0]),
    "TextureAmbientOcclusion1"
    | "TextureColor1"
    | "TextureHeight1"
    | "TextureMetalness1"
    | "TextureNormal1"
    | "TextureRoughness1"
    | "TextureTintMask1" => value.is_empty(),
    _ => false,
  }
}

pub(super) fn inspect(text: &str, fields: &[Field]) -> Result<Material, Error> {
  let shaders: Vec<_> = fields
    .iter()
    .filter(|field| field.path.eq_ignore_ascii_case("Layer0/shader"))
    .collect();
  let shader = shaders
    .first()
    .map_or("", |field| literal(text, field))
    .to_owned();
  let empty = !fields
    .iter()
    .any(|field| field.name.starts_with("Texture") && !literal(text, field).is_empty());
  let mut material = Material {
    shader,
    empty,
    unsupported: Vec::new(),
    replacements: Vec::new(),
  };
  if !material.shader.eq_ignore_ascii_case("csgo_environment.vfx") {
    return Ok(material);
  }
  if shaders.len() != 1 {
    material
      .unsupported
      .push("duplicate shader property".into());
  }
  let mut seen = std::collections::BTreeSet::new();
  for field in fields {
    if !field.path.starts_with("Layer0/")
      || field.path[7..].contains('/')
      || !seen.insert(field.name.to_ascii_lowercase())
      || !template_field(&field.name, literal(text, field))
    {
      material.unsupported.push(field.path.clone());
    }
  }
  // Empty nested blocks have no scalar fields, so inspect the structure too.
  if text.matches('{').count() != 1 || text.matches('}').count() != 1 {
    material
      .unsupported
      .push("nested or dynamic material blocks".into());
  }
  if !material.unsupported.is_empty() {
    return Ok(material);
  }
  let shader_field = shaders[0];
  material.replacements.push(Replacement {
    start: shader_field.start,
    end: shader_field.end,
    text: "\"pbr.vfx\"".into(),
  });
  if let Some(tint) = fields
    .iter()
    .find(|field| field.path == "Layer0/g_vColorTint")
  {
    let range = modding_source::property_name_range(text, tint)?;
    material.replacements.push(Replacement {
      start: range.start,
      end: range.end,
      text: "\"g_vColorTint1\"".into(),
    });
  }
  Ok(material)
}
