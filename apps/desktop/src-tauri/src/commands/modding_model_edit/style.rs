use super::*;
use vpkmanager::model_edit::material::{self, ParameterKind};
#[derive(Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingMaterialProperty {
  pub name: String,
  pub values: Vec<f64>,
}
#[derive(Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingMaterialExpression {
  pub name: String,
  pub source: String,
}
#[derive(Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingModelPattern {
  pub style: String,
  pub intensity: f64,
  pub phase: f64,
  pub scroll: [f64; 2],
}
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingMaterialControl {
  pub name: String,
  pub kind: String,
  pub group: String,
  pub values: Vec<f64>,
  pub min: f64,
  pub max: f64,
  pub expression: Option<String>,
}
pub(super) fn controls(bytes: &[u8]) -> Result<Vec<ModdingMaterialControl>, Error> {
  let (tree, _, _) =
    vpkmanager::material_repair::decode(bytes).map_err(|e| invalid(e.to_string()))?;
  let expressions = material::material_expressions(&tree);
  Ok(
    material::PARAMETERS
      .iter()
      .filter(|p| {
        material::texture_binding(p.name)
          .is_none_or(|(slot, _)| material::texture_path(&tree, slot).is_some())
      })
      .map(|p| ModdingMaterialControl {
        name: p.name.into(),
        kind: match p.kind {
          ParameterKind::Flag => "flag",
          ParameterKind::Scalar => "scalar",
          ParameterKind::Color => "color",
          ParameterKind::Vector => "vector",
        }
        .into(),
        group: p.group.into(),
        values: material::parameter_values(&tree, p),
        min: p.min,
        max: p.max,
        expression: expressions
          .iter()
          .find(|(n, _)| n == p.name)
          .map(|(_, s)| s.clone()),
      })
      .collect(),
  )
}
pub(super) fn validate(edit: &ModdingModelPartEdit) -> Result<(), Error> {
  if edit.parameters.len() > material::PARAMETERS.len() || edit.expressions.len() > 8 {
    return Err(invalid("Too many material overrides"));
  }
  let mut names = BTreeSet::new();
  for p in &edit.parameters {
    if !names.insert(&p.name) {
      return Err(invalid("Duplicate material parameter"));
    }
    material::validate_parameter(&p.name, &p.values).map_err(|e| invalid(e.to_string()))?;
  }
  let mut expressions = BTreeSet::new();
  for e in &edit.expressions {
    if !expressions.insert(&e.name) || names.contains(&e.name) {
      return Err(invalid("Conflicting material expression"));
    }
    material::compile_expression(&e.name, &e.source).map_err(|e| invalid(e.to_string()))?;
  }
  if let Some(p) = &edit.pattern
    && (vpkmanager::PatternStyle::parse(&p.style).is_none()
      || !p.intensity.is_finite()
      || !(0.0..=1.0).contains(&p.intensity)
      || !p.phase.is_finite()
      || !(0.0..=1.0).contains(&p.phase)
      || p
        .scroll
        .iter()
        .any(|v| !v.is_finite() || !(-2.0..=2.0).contains(v))
      || names.iter().any(|n| n.as_str() == "g_vAlbedoScrollSpeed1")
      || expressions
        .iter()
        .any(|n| n.as_str() == "g_vAlbedoScrollSpeed1"))
  {
    return Err(invalid("Invalid or conflicting model pattern"));
  }
  Ok(())
}
