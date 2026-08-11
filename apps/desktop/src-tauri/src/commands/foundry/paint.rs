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

use serde::{Deserialize, Serialize};

use crate::errors::Error;

use super::archive_cache::open_archive;
use super::hero::{panorama_codenames, sound_codename_for_hero};
use super::types::{FoundryPaintResult, FoundryPaintTargetInfo};
use super::workspace::{safe_entry_relative, workspace_files_dir};

/// The parts of a hero the paint tab can recolor.
///
/// Deliberately three, not more. Deadlock ships a hero's weapon as a single
/// material (`bebop_weapon`, `haze_v2_gun`, `fencer_sword`) — no hero in the
/// roster splits it into a frame and fittings — so a finer breakdown would be a
/// permanently empty bucket rather than a useful control.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum PaintTarget {
  /// The character: outfit, skin, hair, cloth.
  Body,
  /// Whatever the hero holds: gun, sword, bow, and its projectiles.
  Weapon,
  /// Character and weapon together, for one colour across the whole silhouette.
  /// A selection, not a classification: no material is ever *categorised* as
  /// this, it is the union of the other two.
  BodyAndWeapon,
  /// Ability VFX: the particle color parameters plus the effect textures.
  Abilities,
}

impl PaintTarget {
  pub(crate) fn id(self) -> &'static str {
    match self {
      Self::Body => "body",
      Self::Weapon => "weapon",
      Self::BodyAndWeapon => "bodyAndWeapon",
      Self::Abilities => "abilities",
    }
  }

  pub(crate) fn parse(value: &str) -> Result<Self, Error> {
    match value {
      "body" => Ok(Self::Body),
      "weapon" => Ok(Self::Weapon),
      "bodyAndWeapon" => Ok(Self::BodyAndWeapon),
      "abilities" => Ok(Self::Abilities),
      other => Err(Error::InvalidInput(format!(
        "unknown paint target: {other}"
      ))),
    }
  }

  pub(crate) const ALL: [Self; 4] = [
    Self::Body,
    Self::Weapon,
    Self::BodyAndWeapon,
    Self::Abilities,
  ];
}

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

fn is_weapon_path(path: &str) -> bool {
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
          id: target.id().to_string(),
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

  for entry_path in &plan.textures {
    match repaint_texture(&archive, &files_dir, entry_path, recolor, pattern) {
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
    "[Foundry] Painted {} ({} entries, {} skipped) at hue {:.0}{}",
    target.id(),
    painted.len(),
    skipped.len(),
    recolor.hue,
    pattern.map_or(String::new(), |pattern| format!(
      " with pattern {:?}",
      pattern.style
    )),
  );

  Ok(FoundryPaintResult {
    target: target.id().to_string(),
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

/// Recolor a texture and lay the pattern over it, in one decode/encode pass.
///
/// The re-encode is the whole cost of a paint (seconds per 2K BC7 texture), so
/// the two transforms deliberately share a single decode rather than running as
/// two chained edits.
fn repaint_texture(
  archive: &source2_model::vpk_extract::VpkArchive,
  files_dir: &Path,
  entry_path: &str,
  recolor: vpkmanager::Recolor,
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
  fn every_target_round_trips_through_its_id() {
    for target in PaintTarget::ALL {
      assert_eq!(PaintTarget::parse(target.id()).unwrap(), target);
    }
    assert!(PaintTarget::parse("gunBody").is_err());
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
