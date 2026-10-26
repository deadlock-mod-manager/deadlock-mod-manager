//! Which particle effects an ability plays on the hero using it.
//!
//! The game spawns ability effects from code, reading their paths out of
//! `scripts/abilities.vdata_c`; neither the model nor its animation clips name
//! them. The same table lists every effect that lands somewhere else (impacts,
//! projectiles, debuffs on the target, aiming previews) and nothing marks which
//! is which, so this keeps the fields that play on the caster and drops any
//! effect whose name places it on someone else.

use std::collections::HashMap;
use std::sync::OnceLock;

use source2_model::kv3::KvValue;

use super::vdata::{TableCache, base_table};
use crate::errors::Error;

const ABILITIES_VDATA: &str = "scripts/abilities.vdata_c";

/// Ability fields naming an effect the caster plays from the start of the
/// ability: wind-ups, channels and movement.
const CAST_FIELDS: &[&str] = &[
  "m_CastParticle",
  "m_strCastEffect",
  "m_CastDelayParticle",
  "m_ChannelParticle",
  "m_ChannelStartParticle",
  "m_ChargeParticle",
  "m_ChargeUpParticle",
  "m_LeapParticle",
  "m_JumpParticle",
  "m_TrailParticle",
];

/// Ability fields naming what the caster lets loose (a beam, a shot, a swing),
/// which starts once the animation reaches its firing phase.
const RELEASE_FIELDS: &[&str] = &[
  "m_BeamParticle",
  "m_ShootParticle",
  "m_LaunchParticle",
  "m_SlashSwingEffect",
];

/// Ability field mapping cast events (`CAST_COMPLETED`, ...) to the effect the
/// caster plays as the cast goes off.
const CAST_EVENT_FIELD: &str = "m_mapCastEventParticles";

/// Fields of a modifier naming the effect it shows on whoever carries it.
const MODIFIER_FIELDS: &[&str] = &[
  "m_strParticleEffect",
  "m_BuffParticle",
  "m_ShieldParticle",
  "m_PlayerShieldParticle",
  "m_RapidFireParticle",
  "m_ChargeParticle",
];

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

fn caster_effect(value: Option<&KvValue>) -> Option<&str> {
  value?
    .as_string()
    .filter(|path| path.ends_with(".vpcf") && !elsewhere(path))
}

/// The effects `ability` plays on its caster, each listed once.
fn ability_caster_particles(ability: &KvValue) -> CasterParticles {
  let mut particles = CasterParticles::default();
  let KvValue::Object(fields) = ability else {
    return particles;
  };
  let mut push = |release: bool, path: Option<&str>| {
    let Some(path) = path else { return };
    if particles
      .cast
      .iter()
      .chain(&particles.release)
      .any(|known| known == path)
    {
      return;
    }
    let list = if release {
      &mut particles.release
    } else {
      &mut particles.cast
    };
    list.push(path.to_string());
  };
  for (key, value) in fields {
    if CAST_FIELDS.contains(&key.as_str()) {
      push(false, caster_effect(Some(value)));
    } else if RELEASE_FIELDS.contains(&key.as_str()) {
      push(true, caster_effect(Some(value)));
    } else if key == CAST_EVENT_FIELD
      && let KvValue::Object(events) = value
    {
      for event in events.values() {
        push(true, caster_effect(Some(event)));
      }
    } else if key.ends_with("Modifier") && !elsewhere(key) {
      // Only modifiers the ability applies directly: nested ones (an aura's
      // provided modifier, a buff's follow-up) usually land on other heroes.
      for field in MODIFIER_FIELDS {
        push(false, caster_effect(value.get(field)));
      }
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
}
