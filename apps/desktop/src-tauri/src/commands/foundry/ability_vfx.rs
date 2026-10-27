//! Which particle effects an ability plays on the hero using it.
//!
//! The game spawns ability effects from code, reading their paths out of
//! `scripts/abilities.vdata_c`; neither the model nor its animation clips name
//! them. The same table lists every effect that lands somewhere else (impacts,
//! projectiles, debuffs on the target, aiming previews) and nothing marks which
//! is which. Field semantics select automatic caster playback; the full
//! reference catalog remains available for explicit effect preview.

use std::collections::HashMap;
use std::sync::OnceLock;

use serde::Serialize;
use source2_model::kv3::KvValue;
use ts_rs::TS;

use super::vdata::{TableCache, base_table};
use crate::errors::Error;

const ABILITIES_VDATA: &str = "scripts/abilities.vdata_c";

/// Semantic field tokens apply to new ability classes without a hero-specific allowlist.
const CAST_WORDS: &[&str] = &[
  "cast", "precast", "charge", "channel", "windup", "leap", "jump", "trail", "dash", "buff",
  "shield", "ambient",
];

/// Ability fields naming what the caster lets loose (a beam, a shot, a swing),
/// which starts once the animation reaches its firing phase.
const RELEASE_WORDS: &[&str] = &[
  "beam", "shoot", "launch", "swing", "slash", "fire", "release", "attack",
];

/// Ability field mapping cast events (`CAST_COMPLETED`, ...) to the effect the
/// caster plays as the cast goes off.
const CAST_EVENT_FIELD: &str = "m_mapCastEventParticles";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, rename_all = "lowercase")]
pub enum PreviewEffectPhase {
  Cast,
  Release,
  External,
  Unbound,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct PreviewAbilityEffect {
  pub path: String,
  pub field: String,
  pub phase: PreviewEffectPhase,
}

/// Words in a modifier or effect name that put it on someone other than the
/// caster, on the ground, or on the HUD.
const ELSEWHERE: &[&str] = &[
  "target",
  "_tgt",
  "enemy",
  "ally",
  "victim",
  "debuff",
  "slow",
  "stun",
  "asleep",
  "root",
  "immobilize",
  "silence",
  "hex",
  "tether",
  "grapple",
  "lift",
  "bulletresist",
  "bulletamp",
  "armor_suppressor",
  "thinker",
  "area",
  "aura",
  "ground",
  "impact",
  "screen",
  "preview",
  "status_fx",
];

/// The `.vpcf` effects an ability plays on its caster, by when they start.
#[derive(Clone, Debug, Default, PartialEq)]
pub(super) struct CasterParticles {
  /// From the start of the ability's animation.
  pub cast: Vec<String>,
  /// From the animation's firing phase.
  pub release: Vec<String>,
}

/// Ability class to the effects it plays on its caster.
type AbilityParticles = HashMap<String, CasterParticles>;

fn elsewhere(name: &str) -> bool {
  let name = name.to_ascii_lowercase();
  ELSEWHERE.iter().any(|word| name.contains(word))
}

fn field_words(name: &str) -> Vec<String> {
  let mut words = String::new();
  for ch in name.chars() {
    if ch.is_ascii_uppercase() || !ch.is_ascii_alphanumeric() {
      words.push(' ');
    }
    if ch.is_ascii_alphanumeric() {
      words.push(ch.to_ascii_lowercase());
    }
  }
  words.split_whitespace().map(str::to_owned).collect()
}

pub(super) fn discover_ability_effects(ability: &KvValue) -> Vec<PreviewAbilityEffect> {
  fn visit(value: &KvValue, fields: &mut Vec<String>, out: &mut Vec<PreviewAbilityEffect>) {
    match value {
      KvValue::String(path) if path.trim_end_matches("_c").ends_with(".vpcf") => {
        let words: Vec<_> = fields.iter().flat_map(|f| field_words(f)).collect();
        let external = words.iter().any(|word| {
          ELSEWHERE.contains(&word.as_str())
            || ["hit", "projectile", "tracer", "explode", "explosion"].contains(&word.as_str())
        }) || elsewhere(path);
        let phase = if external {
          PreviewEffectPhase::External
        } else if fields.iter().any(|f| f == CAST_EVENT_FIELD)
          || words.iter().any(|w| RELEASE_WORDS.contains(&w.as_str()))
        {
          PreviewEffectPhase::Release
        } else if words.iter().any(|w| CAST_WORDS.contains(&w.as_str()))
          || words.iter().filter(|w| w.as_str() == "modifier").count() == 1
        {
          PreviewEffectPhase::Cast
        } else {
          PreviewEffectPhase::Unbound
        };
        out.push(PreviewAbilityEffect {
          path: path.trim_end_matches("_c").to_owned(),
          field: fields.join("."),
          phase,
        });
      }
      KvValue::Object(values) => {
        for (key, child) in values {
          fields.push(key.clone());
          visit(child, fields, out);
          fields.pop();
        }
      }
      KvValue::Array(values) => {
        for child in values {
          visit(child, fields, out);
        }
      }
      _ => {}
    }
  }
  let mut effects = Vec::new();
  visit(ability, &mut Vec::new(), &mut effects);
  effects.sort_by(|a, b| a.path.cmp(&b.path).then(a.field.cmp(&b.field)));
  effects.dedup_by(|a, b| a.path == b.path && a.phase == b.phase);
  effects
}

/// Automatic playback uses caster effects; the catalog retains other references for explicit preview.
pub(super) fn ability_caster_particles(ability: &KvValue) -> CasterParticles {
  let mut particles = CasterParticles::default();
  for effect in discover_ability_effects(ability) {
    let target = match effect.phase {
      PreviewEffectPhase::Cast => &mut particles.cast,
      PreviewEffectPhase::Release => &mut particles.release,
      _ => continue,
    };
    if !target.contains(&effect.path) {
      target.push(effect.path);
    }
  }
  particles
}

fn ability_table(root: KvValue) -> Result<AbilityParticles, Error> {
  let KvValue::Object(abilities) = root else {
    return Err(Error::InvalidInput(format!(
      "{ABILITIES_VDATA} root is not an object"
    )));
  };
  Ok(
    abilities
      .into_iter()
      .map(|(class, ability)| (class, ability_caster_particles(&ability)))
      .filter(|(_, particles)| *particles != CasterParticles::default())
      .collect(),
  )
}

/// The effects `class` plays on its caster, read from the base game.
/// Accepts the class with or without its `citadel_ability_` prefix.
pub(super) fn caster_particles(class: &str) -> CasterParticles {
  static CACHE: TableCache<AbilityParticles> = OnceLock::new();
  let Some(table) = base_table(&CACHE, ABILITIES_VDATA, ability_table) else {
    return CasterParticles::default();
  };
  table
    .get(class)
    .or_else(|| table.get(&format!("citadel_ability_{class}")))
    .cloned()
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
  use std::collections::BTreeMap;

  use super::*;

  fn object(fields: &[(&str, KvValue)]) -> KvValue {
    KvValue::Object(
      fields
        .iter()
        .map(|(key, value)| (key.to_string(), value.clone()))
        .collect::<BTreeMap<_, _>>(),
    )
  }

  fn text(value: &str) -> KvValue {
    KvValue::String(value.to_string())
  }

  #[test]
  fn sorts_caster_effects_and_drops_those_landing_elsewhere() {
    // Shaped after Haze's Bullet Flurry and Bebop's Hyper Beam.
    let ability = object(&[
      ("m_ChannelParticle", text("particles/haze/flurry.vpcf")),
      ("m_BeamParticle", text("particles/bebop/beam.vpcf")),
      (
        "m_BeamHitParticle",
        text("particles/bebop/beam_damage.vpcf"),
      ),
      (
        "m_ImpactParticle",
        text("particles/haze/dagger_impact.vpcf"),
      ),
      ("m_PreviewPathParticle", text("particles/generic/arc.vpcf")),
      (
        "m_BulletFlurryModifier",
        object(&[("m_strParticleEffect", text("particles/haze/poses.vpcf"))]),
      ),
      (
        "m_AutoCastDelayModifier",
        object(&[("m_strParticleEffect", text("particles/haze/flurry.vpcf"))]),
      ),
      (
        "m_TargetModifier",
        object(&[("m_strParticleEffect", text("particles/haze/mark.vpcf"))]),
      ),
      (
        "m_SleepModifier",
        object(&[(
          "m_strParticleEffect",
          text("particles/generic/generic_slow_debuff.vpcf"),
        )]),
      ),
      (
        CAST_EVENT_FIELD,
        object(&[("CAST_COMPLETED", text("particles/haze/cast.vpcf"))]),
      ),
    ]);
    let mut particles = ability_caster_particles(&ability);
    particles.cast.sort();
    assert_eq!(
      particles.cast,
      ["particles/haze/flurry.vpcf", "particles/haze/poses.vpcf"]
    );
    assert_eq!(
      particles.release,
      ["particles/bebop/beam.vpcf", "particles/haze/cast.vpcf"]
    );
  }

  #[test]
  fn includes_minas_channel_without_target_or_explosion_effects() {
    let particles = ability_caster_particles(&object(&[
      (
        "m_BatSwarmChannelParticle",
        text("particles/abilities/vampirebat/vampirebat_batswarm_channel.vpcf"),
      ),
      (
        "m_ExplodeParticle",
        text("particles/vampirebat/explode.vpcf"),
      ),
      (
        "m_GainedBatParticle",
        text("particles/vampirebat/gained.vpcf"),
      ),
    ]));
    assert_eq!(
      particles.cast,
      ["particles/abilities/vampirebat/vampirebat_batswarm_channel.vpcf"]
    );
    assert!(particles.release.is_empty());
  }

  #[test]
  fn discovers_unseen_fields_and_keeps_external_and_unbound_effects_in_the_catalog() {
    let ability = object(&[
      (
        "m_FuturePowerChannelParticle",
        text("particles/future/channel.vpcf_c"),
      ),
      (
        "m_NewPowerSlashSwingEffect",
        text("particles/future/swing.vpcf"),
      ),
      (
        "m_TargetModifier",
        object(&[(
          "m_strParticleEffect",
          text("particles/future/on_enemy.vpcf"),
        )]),
      ),
      (
        "m_MysteryEffects",
        KvValue::Array(vec![text("particles/future/mystery.vpcf")]),
      ),
    ]);
    let particles = ability_caster_particles(&ability);
    assert_eq!(particles.cast, ["particles/future/channel.vpcf"]);
    assert_eq!(particles.release, ["particles/future/swing.vpcf"]);
    let effects = discover_ability_effects(&ability);
    assert_eq!(effects.len(), 4);
    assert!(
      effects
        .iter()
        .any(|e| e.phase == PreviewEffectPhase::External
          && e.field == "m_TargetModifier.m_strParticleEffect")
    );
    assert!(
      effects
        .iter()
        .any(|e| e.phase == PreviewEffectPhase::Unbound)
    );
  }

  #[test]
  fn a_caster_modifier_does_not_spawn_its_weapon_tracers_on_the_body() {
    let ability = object(&[(
      "m_CasterModifier",
      object(&[
        (
          "m_strParticleEffect",
          text("particles/future/self_buff.vpcf"),
        ),
        (
          "m_SpiritBulletTracerParticle",
          text("particles/weapon_fx/future/spirit.vpcf"),
        ),
      ]),
    )]);
    assert_eq!(
      ability_caster_particles(&ability).cast,
      ["particles/future/self_buff.vpcf"]
    );
    assert!(
      discover_ability_effects(&ability)
        .iter()
        .any(|e| e.phase == PreviewEffectPhase::External && e.path.contains("weapon_fx"))
    );
  }
}
