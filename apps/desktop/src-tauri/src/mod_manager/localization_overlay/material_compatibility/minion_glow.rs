//! Reviewed migration v1: legacy candle wax -> live Amber/Sapphire head surfaces.
//! Current unit/model paths and role names come from npc_units, never mod IDs.
use super::*;
use vpkmanager::source2::kv3::Value;

const RECIPE: &str = "minion-static-glow-v1";
const OLD_MODEL: &str = "models/npc/trooper/trooper_humanoid.vmdl_c";
const SOURCE_PREFIX: &str = "models/npc/trooper/materials/candle_trooper_wax_";
pub(super) const ROLES: [(&str, &str); 4] = [
  ("m_sDefaultMaterialGroupName", "friendly"),
  ("m_sEnemyMaterialGroupName", "enemy"),
  ("m_sTeam1MaterialGroupName", "amber"),
  ("m_sTeam2MaterialGroupName", "sapphire"),
];
const HEAD_GROUPS: [&str; 3] = [
  "head_health_@0_#&high",
  "head_health_@1_#&mid",
  "head_health_@2_#&low",
];
const WHITE_MASK: &str = "materials/default/default_mask_tga_344101f8.vtex";

pub(super) fn source_role(path: &str) -> Option<&'static str> {
  ROLES
    .iter()
    .map(|(_, role)| *role)
    .find(|role| path == format!("{SOURCE_PREFIX}{role}.vmat_c"))
}

struct Target {
  key: &'static str,
  material: &'static str,
  model_field: &'static str,
  units: &'static [&'static str],
  isolate: bool,
}
const TARGETS: [Target; 3] = [
  Target {
    key: "amber",
    material: "models/npc_units/troopers/amber_trooper_01/materials/amber_trooper_01_wax.vmat",
    model_field: "m_sAmberModelName",
    units: &["trooper_normal", "trooper_medic", "trooper_melee"],
    isolate: false,
  },
  Target {
    key: "sapphire",
    material: "models/npc_units/troopers/sapphire_trooper_01/materials/sapphire_trooper_01.vmat",
    model_field: "m_sSapphireModelName",
    units: &["trooper_normal", "trooper_medic"],
    isolate: true,
  },
  Target {
    key: "sapphire_melee",
    material: "models/npc_units/troopers/sapphire_trooper_01_melee/materials/sapphire_trooper_melee_head.vmat",
    model_field: "m_sSapphireModelName",
    units: &["trooper_melee"],
    isolate: false,
  },
];

fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str, Error> {
  edit::field(value, key)
    .map_err(invalid)?
    .as_str()
    .ok_or_else(|| invalid(format!("Invalid string {key}")))
}

pub(super) fn build(resources: &ResourceSnapshot, paths: &[String]) -> Result<Assets, Error> {
  let old = baseline(resources, OLD_MODEL)?;
  let units_bytes = baseline(resources, "scripts/npc_units.vdata_c")?;
  let units = edit::decode(&units_bytes).map_err(invalid)?.0;
  let mut authored = BTreeMap::new();
  let mut hash = Sha256::new();
  hash.update(RECIPE.as_bytes());
  for path in paths {
    let (_, bytes) = resources
      .resolve(path)?
      .ok_or_else(|| invalid("Missing authored material"))?;
    let value = edit::decode(&bytes).map_err(invalid)?.0;
    // Static emission is an explicit precondition, not an inferred blanket merge.
    let dynamic = edit::field(&value, "m_dynamicParams")
      .map_err(invalid)?
      .as_array()
      .ok_or_else(|| invalid("Invalid authored expressions"))?;
    if dynamic
      .iter()
      .any(|entry| entry.get("m_name").and_then(Value::as_str) == Some("g_flSelfIllumScale1"))
    {
      return Err(invalid(
        "Authored material still drives emission dynamically; this static-glow recipe does not apply",
      ));
    }
    hash.update(path.as_bytes());
    hash.update(Sha256::digest(bytes.as_slice()));
    authored.insert(
      source_role(path).ok_or_else(|| invalid("Unknown material role"))?,
      bytes,
    );
  }
  let namespace = format!("dmm/compatibility/materials/{:x}", hash.finalize());
  let mut assets = Assets::new();
  for target in TARGETS {
    let mut current = baseline(resources, &format!("{}_c", target.material))?
      .as_ref()
      .clone();
    // Every texture retained by the current shader must still resolve.
    for (_, path) in edit::references(&current).map_err(invalid)? {
      baseline(resources, &path)?;
    }
    let binding = if target.isolate {
      let path = format!("{namespace}/{}/default.vmat", target.key);
      if resources.provider(&path).is_some() {
        return Err(invalid("Generated material namespace is already occupied"));
      }
      assets.insert(
        format!("{path}_c"),
        edit::rename_material(&current, &path).map_err(invalid)?,
      );
      // The old wax surface used an unrestricted emission mask. Sapphire now
      // shares a body mask: restore glow only after isolating the head draw calls.
      baseline(resources, WHITE_MASK)?;
      current = edit::replace_texture_parameter(
        &current,
        "g_tSelfIllumMask",
        &(resource_id(WHITE_MASK).map_err(invalid)?, WHITE_MASK.into()),
      )
      .map_err(invalid)?;
      path
    } else {
      target.material.to_owned()
    };
    let mut ids = BTreeMap::new();
    let mut variants = BTreeMap::new();
    for (_, role) in ROLES {
      let path = format!("{namespace}/{}/{role}.vmat", target.key);
      if resources.provider(&path).is_some() {
        return Err(invalid("Generated material namespace is already occupied"));
      }
      ids.insert(path.clone(), resource_id(&path).map_err(invalid)?);
      assets.insert(
        format!("{path}_c"),
        edit::material_variant(&current, &authored[role], &path).map_err(invalid)?,
      );
      variants.insert(role, path);
    }
    for name in target.units {
      let unit = edit::field(&units, name).map_err(invalid)?;
      let model_path = format!("{}_c", text(unit, target.model_field)?);
      let mut model = baseline(resources, &model_path)?.as_ref().clone();
      if assets.contains_key(&model_path) {
        return Err(invalid(
          "Unit definitions alias a model across incompatible targets",
        ));
      }
      let (root, _, _) = edit::decode(&model).map_err(invalid)?;
      // Additional live health groups need a new scope review after a game patch.
      let groups = edit::field(&root, "m_meshGroups")
        .map_err(invalid)?
        .as_array()
        .ok_or_else(|| invalid("Invalid mesh groups"))?;
      if groups.iter().filter_map(Value::as_str).any(|group| {
        group.starts_with("head_health_")
          && !HEAD_GROUPS.contains(&group)
          && group != "head_health_@3_#&death"
      }) {
        return Err(invalid("Current game has an unreviewed head health group"));
      }
      let selected_meshes = if target.isolate {
        let (scoped, count) = edit::isolate_mesh_material(
          &model,
          &HEAD_GROUPS,
          target.material,
          &(resource_id(&binding).map_err(invalid)?, binding.clone()),
        )
        .map_err(invalid)?;
        model = scoped;
        count
      } else {
        0
      };
      let roles: Vec<_> = ROLES
        .iter()
        .map(|(field, role)| Ok((text(unit, field)?, variants[role].clone())))
        .collect::<Result<_, Error>>()?;
      let unique: BTreeSet<_> = roles.iter().map(|(role, _)| *role).collect();
      if unique.len() != ROLES.len() || unique.contains("default") {
        return Err(invalid("Ambiguous unit material roles"));
      }
      let output = edit::bind_variants(&model, &old, &binding, &roles, &ids).map_err(invalid)?;
      log::info!(
        "Material migration recipe={RECIPE} source={SOURCE_PREFIX} unit={name} model={model_path} material={} isolated_meshes={selected_meshes}",
        target.material
      );
      assets.insert(model_path, output);
    }
  }
  validate_dependencies(resources, &assets)?;
  Ok(assets)
}
