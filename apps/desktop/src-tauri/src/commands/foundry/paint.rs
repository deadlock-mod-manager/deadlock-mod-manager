//! Painting a skin: recoloring whole parts of a hero rather than one texture.
//!
//! Picking textures by hand is the wrong unit of work — a hero's body is a dozen
//! `.vtex_c` files across several materials, and getting a coherent look means
//! hitting all of them. So the Foundry works in *parts*: body, gun body, gun,
//! and ability effects. Each part resolves to a set of materials, each material
//! to its color map, and the recolor runs across the lot in one pass.
//!
//! Only base-color maps are touched. Normal, roughness, ambient-occlusion and
//! mask textures encode geometry and material response in their channels, not
//! color; hue-shifting those would wreck the lighting rather than repaint it.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use crate::errors::Error;

use super::archive_cache::open_archive;
use super::hero::{panorama_codenames, sound_codename_for_hero};
use super::types::{FoundryPaintPart, FoundryPaintResult, FoundryPaintTargetInfo, PaintTarget};
use super::workspace::{safe_entry_relative, workspace_files_dir};

/// Path tokens that mark a material as belonging to a weapon.
const WEAPON_TOKENS: &[&str] = &[
  "weapon", "gun", "rifle", "pistol", "shotgun", "cannon", "launcher", "bow", "arrow", "blade",
  "sword", "knife", "staff", "wand", "mace", "club", "revolver", "smg", "bullet", "melee",
];

/// Path tokens that mark a material as *not* part of the playable hero.
///
/// A hero's codename appears on plenty of things that are not the hero: the
/// hideout ornaments, seasonal cosmetics, and voted stickers all carry it. Those
/// must stay out of a paint pass, or repainting a body would also recolor a
/// Christmas bauble sitting in the hideout.
const NON_HERO_TOKENS: &[&str] = &[
  "hideout",
  "ornament",
  "sticker",
  "/items/",
  "xmas",
  "holiday",
  "gingerbread",
];

/// Whether a lowercased path names a weapon rather than the hero's body. Shared
/// with `vdata`, which uses it to keep a gun out of the preview slot when the
/// authoritative model lookup has nothing to say.
pub(crate) fn is_weapon_path(path: &str) -> bool {
  WEAPON_TOKENS.iter().any(|token| path.contains(token))
}

fn is_non_hero_path(path: &str) -> bool {
  NON_HERO_TOKENS.iter().any(|token| path.contains(token))
}

/// Which part a material belongs to, or `None` when it isn't a hero surface at
/// all. `path` must already be lowercase.
fn target_for_material(path: &str) -> Option<PaintTarget> {
  if path.contains("particle") || path.contains("/effects/") {
    return Some(PaintTarget::Abilities);
  }
  if !path.contains("models/") || is_non_hero_path(path) {
    return None;
  }
  Some(if is_weapon_path(path) {
    PaintTarget::Weapon
  } else {
    PaintTarget::Body
  })
}

/// Whether an ability particle belongs to `hero`. A skin VPK occasionally
/// carries a stray effect for another hero; painting that would recolor
/// somebody else's abilities in game.
fn is_hero_particle(path: &str, hero_terms: &[String]) -> bool {
  let lower = path.to_ascii_lowercase();
  lower.ends_with(".vpcf_c") && hero_terms.iter().any(|term| lower.contains(term))
}

/// Every path token that identifies an asset as this hero's.
fn hero_terms(hero_display: Option<&str>) -> Vec<String> {
  let Some(hero) = hero_display else {
    return Vec::new();
  };
  let mut terms = panorama_codenames(hero)
    .into_iter()
    .map(str::to_string)
    .collect::<Vec<_>>();
  if let Some(codename) = sound_codename_for_hero(hero) {
    terms.push(codename.to_string());
  }
  terms.sort();
  terms.dedup();
  terms
}

/// Everything the paint pass will touch for one target.
#[derive(Default, Clone)]
pub(crate) struct PaintPlan {
  pub(crate) textures: Vec<String>,
  pub(crate) particles: Vec<String>,
}

/// The plan for every target, built in one pass over the archive.
#[derive(Default)]
pub(crate) struct PaintPlans {
  body: PaintPlan,
  weapon: PaintPlan,
  abilities: PaintPlan,
}

impl PaintPlans {
  /// The plan for one selection. `BodyAndWeapon` is the union of the two, built
  /// here rather than stored, so a material still lives in exactly one bucket.
  fn plan_for(&self, target: PaintTarget) -> PaintPlan {
    match target {
      PaintTarget::Body => self.body.clone(),
      PaintTarget::Weapon => self.weapon.clone(),
      PaintTarget::Abilities => self.abilities.clone(),
      PaintTarget::BodyAndWeapon => {
        let mut textures = self.body.textures.clone();
        textures.extend(self.weapon.textures.iter().cloned());
        textures.sort();
        textures.dedup();
        PaintPlan {
          textures,
          particles: Vec::new(),
        }
      }
    }
  }

  /// The bucket a *classified* material goes into. `BodyAndWeapon` never
  /// reaches here, because nothing classifies as it.
  fn bucket_mut(&mut self, target: PaintTarget) -> Option<&mut PaintPlan> {
    match target {
      PaintTarget::Body => Some(&mut self.body),
      PaintTarget::Weapon => Some(&mut self.weapon),
      PaintTarget::Abilities => Some(&mut self.abilities),
      PaintTarget::BodyAndWeapon => None,
    }
  }
}

/// Above this many entries the archive is the base game pak, not a skin mod.
///
/// The distinction matters because resolving a material's color map means
/// extracting and parsing it: fine for the few dozen materials in a mod, ruinous
/// for the tens of thousands in the whole game. So a large archive is scanned
/// only where the hero's own assets live, which bounds the work to the same
/// handful of materials either way.
const MOD_ARCHIVE_MAX_ENTRIES: usize = 20_000;

/// Build the plan for all four targets in a single pass.
///
/// One pass rather than four: the expensive step is parsing each material, and
/// a material belongs to exactly one target, so there is nothing to gain from
/// looking at it more than once.
pub(crate) fn plan_all(
  archive: &source2_model::vpk_extract::VpkArchive,
  hero_display: Option<&str>,
) -> PaintPlans {
  let entries = archive.list_entries();
  let terms = hero_terms(hero_display);
  // Only the base pak needs scoping, and scoping it needs terms to scope by.
  let hero_scoped = entries.len() > MOD_ARCHIVE_MAX_ENTRIES && !terms.is_empty();

  let mut plans = PaintPlans::default();
  let mut seen_textures = BTreeSet::new();

  for entry in &entries {
    let lower = entry.to_ascii_lowercase();

    if lower.ends_with(".vpcf_c") {
      if is_hero_particle(&lower, &terms) {
        plans.abilities.particles.push(entry.clone());
      }
      continue;
    }

    if !lower.ends_with(".vmat_c") {
      continue;
    }
    if hero_scoped && !terms.iter().any(|term| lower.contains(term)) {
      continue;
    }
    let Some(target) = target_for_material(&lower) else {
      continue;
    };
    // The material names its own color map, which is the only texture whose
    // channels actually hold color.
    let Some(texture) = source2_model::material_color_texture(archive, entry) else {
      continue;
    };
    if !archive.contains_entry(&texture) || !seen_textures.insert(texture.clone()) {
      continue;
    }
    if let Some(bucket) = plans.bucket_mut(target) {
      bucket.textures.push(texture);
    }
  }

  for bucket in [&mut plans.body, &mut plans.weapon, &mut plans.abilities] {
    bucket.textures.sort();
  }
  plans
}

/// Count what each target would touch, so the UI can show the parts a skin
/// actually has and disable the ones it doesn't.
pub(crate) fn describe_paint_targets(
  vpk_path: &Path,
  workspace_root: Option<&Path>,
  hero_display: Option<&str>,
) -> Result<Vec<FoundryPaintTargetInfo>, Error> {
  let overlay = workspace_root.map(|root| root.join("files"));
  let archive = open_archive(vpk_path, overlay.as_deref())?;
  let plans = plan_all(&archive, hero_display);

  Ok(
    PaintTarget::ALL
      .into_iter()
      .map(|target| {
        let plan = plans.plan_for(target);
        FoundryPaintTargetInfo {
          id: target,
          texture_count: plan.textures.len(),
          particle_count: plan.particles.len(),
        }
      })
      .collect(),
  )
}

/// Recolor every texture (and, for abilities, every particle color parameter) of
/// one target into the editable workspace.
///
/// Recoloring reads each entry's packed original rather than the workspace copy,
/// so moving a hue slider replaces the previous paint instead of compounding on
/// top of it. That is what makes the control feel like a slider rather than a
/// ratchet.
pub(crate) fn paint_target(
  workspace_root: PathBuf,
  vpk_path: PathBuf,
  target: PaintTarget,
  hero_display: Option<String>,
  recolor: vpkmanager::Recolor,
  pattern: Option<vpkmanager::Pattern>,
) -> Result<FoundryPaintResult, Error> {
  let files_dir = workspace_files_dir(&workspace_root)?;
  let archive = open_archive(&vpk_path, None)?;
  let plans = plan_all(&archive, hero_display.as_deref());
  let plan = plans.plan_for(target);

  let mut painted = Vec::new();
  let mut skipped = Vec::new();

  // A pattern brings its own palette, so it replaces the picked color rather
  // than sitting on top of it. Particles are the exception: there is no way to
  // express a pattern in a particle color parameter, so ability effects keep
  // taking the color even when the textures beside them take the pattern.
  let texture_recolor = if pattern.is_some() {
    None
  } else {
    Some(recolor)
  };

  for entry_path in &plan.textures {
    match repaint_texture(&archive, &files_dir, entry_path, texture_recolor, pattern) {
      Ok(()) => painted.push(entry_path.clone()),
      Err(error) => {
        // One unpaintable texture (an HDR map, an exotic format) must not sink
        // the whole part; report it and carry on.
        log::warn!("[Foundry] Skipped painting {entry_path}: {error}");
        skipped.push(entry_path.clone());
      }
    }
  }

  for entry_path in &plan.particles {
    match repaint_particle(&archive, &files_dir, entry_path, recolor) {
      Ok(true) => painted.push(entry_path.clone()),
      Ok(false) => {}
      Err(error) => {
        log::warn!("[Foundry] Skipped painting {entry_path}: {error}");
        skipped.push(entry_path.clone());
      }
    }
  }

  log::info!(
    "[Foundry] Painted {} ({} entries, {} skipped) {}",
    target,
    painted.len(),
    skipped.len(),
    match pattern {
      Some(pattern) => format!("with pattern {:?}", pattern.style),
      None => format!("at hue {:.0}", recolor.hue),
    },
  );

  Ok(FoundryPaintResult {
    target: Some(target),
    painted_paths: painted,
    skipped_paths: skipped,
  })
}

fn material_stem(material: &str) -> String {
  material
    .rsplit('/')
    .next()
    .unwrap_or(material)
    .trim_end_matches("_c")
    .trim_end_matches(".vmat")
    .to_ascii_lowercase()
}

/// `v2`, `v3`: a version tag, not part of a name.
fn is_version_tag(word: &str) -> bool {
  word.len() >= 2 && word.starts_with('v') && word[1..].chars().all(|c| c.is_ascii_digit())
}

/// A word that only names the hero: a codename, optionally with a version tag
/// fused on (`hazev2`, `miragev3`).
fn is_hero_word(word: &str, hero_terms: &[String]) -> bool {
  hero_terms.iter().any(|term| {
    word
      .strip_prefix(term.as_str())
      .is_some_and(|rest| rest.is_empty() || is_version_tag(rest))
  })
}

/// A readable section name from a material path: the file stem without the
/// hero's codename or a version tag, in sentence case.
fn part_label(material: &str, hero_terms: &[String]) -> String {
  let stem = material_stem(material);
  let words = stem
    .split('_')
    .filter(|word| !word.is_empty() && !is_hero_word(word, hero_terms) && !is_version_tag(word))
    .collect::<Vec<_>>();
  let text = if words.is_empty() {
    stem.replace('_', " ")
  } else {
    words.join(" ")
  };
  let mut chars = text.chars();
  chars.next().map_or_else(String::new, |first| {
    first.to_uppercase().chain(chars).collect()
  })
}

/// Read an entry from the skin, falling back to the base game: a skin often
/// ships only the textures it changes, while the model and materials it
/// paints over stay in `pak01`.
fn extract_either(
  skin: &source2_model::vpk_extract::VpkArchive,
  base: Option<&source2_model::vpk_extract::VpkArchive>,
  entry_path: &str,
) -> Result<Vec<u8>, Error> {
  skin
    .extract_entry(entry_path)
    .or_else(|error| match base {
      Some(base) => base.extract_entry(entry_path),
      None => Err(error),
    })
    .map_err(|e| Error::InvalidInput(format!("{e}")))
}

fn base_archive() -> Option<std::sync::Arc<source2_model::vpk_extract::VpkArchive>> {
  match super::staging::staged_base_game_vpk() {
    Ok(Some(path)) => open_archive(&path, None).ok(),
    Ok(None) => None,
    Err(error) => {
      log::warn!("[Foundry] No base pak for paint parts: {error}");
      None
    }
  }
}

/// The paintable sections of one model, in the order the model draws them.
///
/// Materials come from the model's default look (LOD0, default body groups),
/// the same selection the 3D preview draws, so every section listed is one
/// the user can see and click.
pub(crate) fn model_paint_parts(
  vpk_path: &Path,
  model_path: &str,
  hero_display: Option<&str>,
) -> Result<Vec<FoundryPaintPart>, Error> {
  let skin = open_archive(vpk_path, None)?;
  let base = base_archive();
  let base = base.as_deref();
  let model_archive = if skin.contains_entry(model_path) {
    &*skin
  } else {
    base.ok_or_else(|| Error::InvalidInput(format!("{model_path} is not in this skin")))?
  };
  let materials = source2_model::model_materials(model_archive, model_path)
    .map_err(|e| Error::InvalidInput(format!("failed to read the model's materials: {e}")))?;
  let mut terms = hero_terms(hero_display);
  // Materials are named after the artist's codename for the hero, which is
  // not always the game's (Mina's are `mina_*`, her codename `vampirebat`).
  // Whatever most of them start with names the hero, not the part.
  let mut prefixes = std::collections::HashMap::<String, usize>::new();
  for material in &materials {
    if let Some(first) = material_stem(material).split('_').next() {
      *prefixes.entry(first.to_string()).or_default() += 1;
    }
  }
  if let Some((prefix, count)) = prefixes.into_iter().max_by_key(|(_, count)| *count)
    && count * 2 >= materials.len()
    && count >= 2
  {
    terms.push(prefix);
  }

  let mut parts: Vec<FoundryPaintPart> = Vec::new();
  for material in materials {
    let lower = material.to_ascii_lowercase();
    if lower.contains("particle") || lower.contains("/effects/") || is_non_hero_path(&lower) {
      continue;
    }
    let texture = source2_model::material_color_texture(&skin, &material)
      .or_else(|| base.and_then(|base| source2_model::material_color_texture(base, &material)));
    let Some(texture) = texture else {
      continue;
    };
    if !skin.contains_entry(&texture) && !base.is_some_and(|base| base.contains_entry(&texture)) {
      continue;
    }
    if let Some(part) = parts
      .iter_mut()
      .find(|part| part.texture.eq_ignore_ascii_case(&texture))
    {
      part.materials.push(material);
      continue;
    }
    parts.push(FoundryPaintPart {
      label: part_label(&material, &terms),
      target: if is_weapon_path(&lower) {
        PaintTarget::Weapon
      } else {
        PaintTarget::Body
      },
      texture,
      materials: vec![material],
    });
  }

  // Two maps named alike ("Body" twice) must still read apart.
  let labels = parts
    .iter()
    .map(|part| part.label.clone())
    .collect::<Vec<_>>();
  for (index, part) in parts.iter_mut().enumerate() {
    let same = labels
      .iter()
      .filter(|label| **label == labels[index])
      .count();
    if same > 1 {
      let nth = labels[..index]
        .iter()
        .filter(|label| **label == labels[index])
        .count();
      part.label = format!("{} {}", labels[index], nth + 1);
    }
  }
  Ok(parts)
}

/// Paint the chosen sections of a model, and only those.
///
/// The requested maps are checked against the model's own sections first:
/// the paths arrive from the webview, and nothing outside the hero being
/// edited may be rewritten.
pub(crate) fn paint_parts(
  workspace_root: PathBuf,
  vpk_path: PathBuf,
  model_path: &str,
  hero_display: Option<String>,
  textures: Vec<String>,
  recolor: vpkmanager::Recolor,
  pattern: Option<vpkmanager::Pattern>,
) -> Result<FoundryPaintResult, Error> {
  let files_dir = workspace_files_dir(&workspace_root)?;
  let parts = model_paint_parts(&vpk_path, model_path, hero_display.as_deref())?;
  let skin = open_archive(&vpk_path, None)?;
  let base = base_archive();

  let mut painted = Vec::new();
  let mut skipped = Vec::new();
  // As for a whole target: a pattern brings its own palette and replaces the
  // picked color rather than sitting on it.
  let texture_recolor = if pattern.is_some() {
    None
  } else {
    Some(recolor)
  };
  // Every map is checked before the first write, so a bad request leaves the
  // workspace untouched instead of half painted.
  let selected = textures
    .iter()
    .map(|texture| {
      parts
        .iter()
        .find(|part| part.texture.eq_ignore_ascii_case(texture))
        .ok_or_else(|| {
          Error::InvalidInput(format!("{texture} is not a paintable part of {model_path}"))
        })
    })
    .collect::<Result<Vec<_>, Error>>()?;
  for part in selected {
    let result = extract_either(&skin, base.as_deref(), &part.texture).and_then(|original| {
      let edited = vpkmanager::paint_texture(&original, texture_recolor, pattern)
        .map_err(|e| Error::InvalidInput(format!("{e}")))?;
      write_workspace_entry(&files_dir, &part.texture, &edited.bytes)
    });
    match result {
      Ok(()) => painted.push(part.texture.clone()),
      Err(error) => {
        log::warn!("[Foundry] Skipped painting {}: {error}", part.texture);
        skipped.push(part.texture.clone());
      }
    }
  }

  log::info!(
    "[Foundry] Painted {} of {} sections ({} skipped)",
    painted.len(),
    textures.len(),
    skipped.len(),
  );
  Ok(FoundryPaintResult {
    target: None,
    painted_paths: painted,
    skipped_paths: skipped,
  })
}

fn write_workspace_entry(files_dir: &Path, entry_path: &str, bytes: &[u8]) -> Result<(), Error> {
  let target_path = files_dir.join(safe_entry_relative(entry_path)?);
  if let Some(parent) = target_path.parent() {
    std::fs::create_dir_all(parent)?;
  }
  std::fs::write(target_path, bytes)?;
  Ok(())
}

/// Recolor a texture, lay a pattern over it, or both — in one decode/encode pass.
///
/// The re-encode is the whole cost of a paint (seconds per 2K BC7 texture), so
/// the two transforms deliberately share a single decode rather than running as
/// two chained edits.
fn repaint_texture(
  archive: &source2_model::vpk_extract::VpkArchive,
  files_dir: &Path,
  entry_path: &str,
  recolor: Option<vpkmanager::Recolor>,
  pattern: Option<vpkmanager::Pattern>,
) -> Result<(), Error> {
  let original = archive
    .extract_entry(entry_path)
    .map_err(|e| Error::InvalidInput(format!("{e}")))?;
  let edited = vpkmanager::paint_texture(&original, recolor, pattern)
    .map_err(|e| Error::InvalidInput(format!("{e}")))?;
  write_workspace_entry(files_dir, entry_path, &edited.bytes)
}

/// Recolor a particle system's color parameters in place.
///
/// Returns false when the system carries no color parameter to change, which is
/// common: many `.vpcf_c` files only reference a texture or drive motion.
fn repaint_particle(
  archive: &source2_model::vpk_extract::VpkArchive,
  files_dir: &Path,
  entry_path: &str,
  recolor: vpkmanager::Recolor,
) -> Result<bool, Error> {
  let original = archive
    .extract_entry(entry_path)
    .map_err(|e| Error::InvalidInput(format!("{e}")))?;
  let Some(edited) = vpkmanager::recolor_particle_colors(&original, recolor)
    .map_err(|e| Error::InvalidInput(format!("{e}")))?
  else {
    return Ok(false);
  };
  write_workspace_entry(files_dir, entry_path, &edited)?;
  Ok(true)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn part_labels_drop_the_codename_and_version() {
    let terms = vec!["bebop".to_string(), "haze".to_string()];
    assert_eq!(
      part_label(
        "models/heroes_staging/bebop/materials/bebop_upper_body.vmat_c",
        &terms
      ),
      "Upper body"
    );
    assert_eq!(
      part_label(
        "models/heroes_staging/haze_v2/materials/haze_v2_gun.vmat_c",
        &terms
      ),
      "Gun"
    );
    assert_eq!(
      part_label(
        "models/heroes_staging/haze/materials/hazev2_head.vmat_c",
        &terms
      ),
      "Head"
    );
    // Nothing but the codename left: keep the name rather than an empty label.
    assert_eq!(part_label("materials/haze.vmat_c", &terms), "Haze");
  }

  /// Real material paths from the shipped `pak01_dir.vpk`.
  #[test]
  fn weapons_are_split_from_the_character() {
    for weapon in [
      "models/heroes_staging/bebop/materials/bebop_weapon.vmat_c",
      "models/heroes_staging/haze_v2/materials/haze_v2_gun.vmat_c",
      "models/heroes_wip/fencer/materials/fencer_sword.vmat_c",
      "models/heroes_staging/archer/materials/archer_bow.vmat_c",
    ] {
      assert_eq!(
        target_for_material(weapon),
        Some(PaintTarget::Weapon),
        "{weapon}"
      );
    }

    for body in [
      "models/heroes_staging/bebop/materials/bebop_upper_body.vmat_c",
      "models/heroes_staging/bebop/materials/bebop_l_arm.vmat_c",
      "models/heroes_wip/fencer/materials/fencer_hair.vmat_c",
      "models/heroes_staging/haze/materials/haze_head.vmat_c",
    ] {
      assert_eq!(target_for_material(body), Some(PaintTarget::Body), "{body}");
    }
  }

  /// A hero's codename also appears on hideout props and seasonal cosmetics.
  /// Painting the hero must not reach those.
  #[test]
  fn non_hero_cosmetics_are_excluded() {
    for path in [
      "models/hideout/materials/hero_ornanaments/hideout_ornament_heroicon_bebop.vmat_c",
      "models/hideout/materials/1_26_voted_sticker_fencer.vmat_c",
      "models/heroes_staging/items/holiday2024/materials/bebop_xmas_ball.vmat_c",
      "models/heroes_staging/items/holiday2024/materials/haze_xmas_bells.vmat_c",
    ] {
      assert_eq!(target_for_material(path), None, "{path}");
    }
  }

  #[test]
  fn particle_materials_belong_to_the_abilities_target() {
    assert_eq!(
      target_for_material("materials/models/particle/fencer/fencer_lunge_cone.vmat_c"),
      Some(PaintTarget::Abilities)
    );
  }

  #[test]
  fn materials_outside_a_model_are_left_alone() {
    assert_eq!(target_for_material("materials/dev/grid.vmat_c"), None);
  }

  #[test]
  fn stray_particles_for_another_hero_are_not_painted() {
    let terms = hero_terms(Some("Haze"));
    assert!(is_hero_particle(
      "particles/abilities/haze/dagger.vpcf_c",
      &terms
    ));
    assert!(!is_hero_particle(
      "particles/abilities/bebop/hook.vpcf_c",
      &terms
    ));
  }

  #[test]
  fn every_target_round_trips_through_serde() {
    for target in PaintTarget::ALL {
      let json = serde_json::to_string(&target).unwrap();
      let parsed: PaintTarget = serde_json::from_str(&json).unwrap();
      assert_eq!(parsed, target);
    }
    assert!(serde_json::from_str::<PaintTarget>(r#""gunBody""#).is_err());
  }

  #[test]
  fn body_and_weapon_is_the_union_of_the_two_without_abilities() {
    let plans = PaintPlans {
      body: PaintPlan {
        textures: vec!["body_a.vtex_c".into(), "shared.vtex_c".into()],
        particles: Vec::new(),
      },
      weapon: PaintPlan {
        textures: vec!["gun_a.vtex_c".into(), "shared.vtex_c".into()],
        particles: Vec::new(),
      },
      abilities: PaintPlan {
        textures: vec!["fx.vtex_c".into()],
        particles: vec!["fx.vpcf_c".into()],
      },
    };

    let combined = plans.plan_for(PaintTarget::BodyAndWeapon);
    // A texture both parts share is painted once, not twice.
    assert_eq!(
      combined.textures,
      vec![
        "body_a.vtex_c".to_string(),
        "gun_a.vtex_c".to_string(),
        "shared.vtex_c".to_string()
      ]
    );
    // Painting the silhouette must not reach into the ability effects.
    assert!(combined.particles.is_empty());
  }

  #[test]
  fn no_material_classifies_as_the_combined_target() {
    for path in [
      "models/heroes_staging/bebop/materials/bebop_upper_body.vmat_c",
      "models/heroes_staging/bebop/materials/bebop_weapon.vmat_c",
      "materials/models/particle/fencer/fencer_lunge_cone.vmat_c",
    ] {
      assert_ne!(
        target_for_material(path),
        Some(PaintTarget::BodyAndWeapon),
        "{path}"
      );
    }
  }
}
