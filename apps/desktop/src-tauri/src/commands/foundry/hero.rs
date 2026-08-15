//! Hero identity tables the Foundry needs to find a hero's assets in a VPK.
//!
//! Deadlock namespaces a hero's assets under several different codenames: the
//! panorama card namespace (`panorama/images/heroes/<codename>_*`), the model /
//! material namespace, and the sound namespace
//! (`sounds/abilities/<codename>/...`). They frequently diverge from each other
//! and from the display name (Abrams is `atlas` in panorama, `bull` in ability
//! art and `abrams` in sounds), so each mapping is its own table.

use std::collections::HashMap;
use std::sync::OnceLock;

use serde::Deserialize;

/// Display-name to panorama `class_name` namespace, used to locate a hero's
/// card textures (including the legacy packs that ship under an older name).
pub(crate) fn panorama_codenames(hero_name: &str) -> Vec<&'static str> {
  match hero_name {
    "Abrams" => vec!["atlas", "bull"],
    "Apollo" => vec!["fencer"],
    "Bebop" => vec!["bebop"],
    "Billy" => vec!["punkgoat"],
    "Calico" => vec!["nano"],
    "Celeste" => vec!["unicorn"],
    "Doorman" | "The Doorman" => vec!["doorman"],
    "Drifter" => vec!["drifter"],
    "Dynamo" => vec!["dynamo", "sumo"],
    "Graves" => vec!["necro"],
    "Grey Talon" => vec!["orion", "archer"],
    "Haze" => vec!["haze"],
    "Holliday" => vec!["astro"],
    "Infernus" => vec!["inferno"],
    "Ivy" => vec!["tengu"],
    "Kelvin" => vec!["kelvin"],
    "Lady Geist" => vec!["ghost", "spectre"],
    "Lash" => vec!["lash"],
    "McGinnis" => vec!["forge", "engineer"],
    "Mina" => vec!["vampirebat"],
    "Mirage" => vec!["mirage"],
    "Mo & Krill" => vec!["krill", "digger"],
    "Paige" => vec!["bookworm"],
    "Paradox" => vec!["chrono"],
    "Pocket" => vec!["synth"],
    "Rem" => vec!["familiar"],
    "Seven" => vec!["gigawatt"],
    "Shiv" => vec!["shiv"],
    "Silver" => vec!["werewolf"],
    "Sinclair" => vec!["magician"],
    "Venator" => vec!["priest"],
    "Victor" => vec!["frank"],
    "Vindicta" => vec!["hornet"],
    "Viscous" => vec!["viscous"],
    "Vyper" => vec!["viper"],
    "Warden" => vec!["warden"],
    "Wraith" => vec!["wraith"],
    "Wrecker" => vec!["butcher"],
    "Yamato" => vec!["yamato"],
    _ => Vec::new(),
  }
}

pub(crate) fn card_prefixes(codenames: &[&str]) -> Vec<String> {
  codenames
    .iter()
    .map(|codename| format!("panorama/images/heroes/{codename}_"))
    .collect()
}

/// Extra `models/heroes/<dir>` names that don't fall out of the display name.
fn default_model_codenames(hero_name: &str) -> Vec<&'static str> {
  match hero_name {
    "Abrams" => vec!["abrams", "atlas_detective"],
    "Grey Talon" => vec!["greytalon", "grey_talon", "archer"],
    "Lady Geist" => vec!["geist", "lady_geist", "ladygeist"],
    "McGinnis" => vec!["mcginnis", "engineer"],
    "Mo & Krill" => vec!["mokrill", "mo_krill", "mo_and_krill", "digger"],
    "Seven" => vec!["gigawatt_prisoner"],
    _ => Vec::new(),
  }
}

fn normalized_hero_terms(hero_name: &str) -> Vec<String> {
  let lower = hero_name.to_ascii_lowercase();
  let underscored = lower
    .chars()
    .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
    .collect::<String>()
    .split('_')
    .filter(|part| !part.is_empty() && *part != "and")
    .collect::<Vec<_>>()
    .join("_");
  let compact = underscored.replace('_', "");
  [underscored, compact]
    .into_iter()
    .filter(|term| !term.is_empty())
    .collect()
}

/// Every path token that identifies an asset as belonging to `hero_name`.
pub(crate) fn hero_asset_terms(hero_name: &str, codenames: &[&str]) -> Vec<String> {
  let mut terms = normalized_hero_terms(hero_name);
  terms.extend(codenames.iter().map(|codename| codename.to_string()));
  terms.extend(
    default_model_codenames(hero_name)
      .into_iter()
      .map(str::to_string),
  );
  if let Some(sound_codename) = sound_codename_for_hero(hero_name) {
    terms.push(sound_codename.to_string());
  }
  terms.sort();
  terms.dedup();
  terms
}

/// Deadlock's sound-path codename per hero. Sound mods organize their payloads
/// under `sounds/abilities/<sound_codename>/`, and that namespace diverges from
/// both the panorama namespace and the script `class_name`.
const HERO_SOUND_CODENAMES: &[(&str, &str)] = &[
  ("abrams", "Abrams"),
  ("astro", "Holliday"),
  ("bebop", "Bebop"),
  ("bookworm", "Paige"),
  ("chrono", "Paradox"),
  ("doorman", "Doorman"),
  ("drifter", "Drifter"),
  ("dynamo", "Dynamo"),
  ("familiar", "Rem"),
  ("fathom", "Fathom"),
  ("fencer", "Apollo"),
  ("forge", "McGinnis"),
  ("frank", "Victor"),
  ("ghost", "Lady Geist"),
  ("gigawatt", "Seven"),
  ("haze", "Haze"),
  ("hornet", "Vindicta"),
  ("inferno", "Infernus"),
  ("kali", "Kali"),
  ("kelvin", "Kelvin"),
  ("lash", "Lash"),
  ("magician", "Sinclair"),
  ("mirage", "Mirage"),
  ("mokrill", "Mo & Krill"),
  ("nano", "Calico"),
  ("necro", "Graves"),
  ("orion", "Grey Talon"),
  ("priest", "Venator"),
  ("punkgoat", "Billy"),
  ("shiv", "Shiv"),
  ("synth", "Pocket"),
  ("tengu", "Ivy"),
  ("tokamak", "Tokamak"),
  ("trapper", "Trapper"),
  ("unicorn", "Celeste"),
  ("vampirebat", "Mina"),
  ("viper", "Vyper"),
  ("viscous", "Viscous"),
  ("warden", "Warden"),
  ("werewolf", "Silver"),
  ("wraith", "Wraith"),
  ("wrecker", "Wrecker"),
  ("yamato", "Yamato"),
];

pub(crate) fn sound_codename_for_hero(hero_name: &str) -> Option<&'static str> {
  let trimmed = hero_name.trim();
  HERO_SOUND_CODENAMES
    .iter()
    .find(|(_, name)| name.eq_ignore_ascii_case(trimmed))
    .map(|(key, _)| *key)
}

/// One ability slot's reference data, as shown in the sound browser.
///
/// Deliberately text only. The upstream table also carried an icon URL on
/// deadlock-api.com, but the Foundry ships no assets it has to fetch at runtime,
/// and the ability's name is what actually identifies the group.
#[derive(Debug, Clone, Deserialize)]
pub(crate) struct AbilitySlotMeta {
  pub(crate) token: String,
  pub(crate) display: String,
}

#[derive(Debug, Deserialize)]
struct AbilityTables {
  /// sound codename -> slot number (as a string key) -> ability metadata.
  slots: HashMap<String, HashMap<String, AbilitySlotMeta>>,
  /// Legacy sound directories that still ship files, merged into the current
  /// codename before lookup (Grey Talon ships under both `orion` and `archer`).
  legacy: HashMap<String, String>,
  /// Hand-curated dev-token -> slot for tokens the ability's display name does
  /// not match.
  curation: HashMap<String, HashMap<String, u8>>,
}

/// The ability tables are large reference data, so they live in JSON beside this
/// module and are parsed once on first use rather than hand-written as literals.
fn tables() -> &'static AbilityTables {
  static TABLES: OnceLock<AbilityTables> = OnceLock::new();
  TABLES.get_or_init(|| {
    serde_json::from_str(include_str!("hero-ability-slots.json"))
      .expect("hero-ability-slots.json is malformed")
  })
}

/// Fold a legacy sound directory name into the codename it ships under today.
pub(crate) fn canonical_sound_codename(raw: &str) -> String {
  let lower = raw.to_ascii_lowercase();
  tables().legacy.get(&lower).cloned().unwrap_or(lower)
}

/// The four ability slots for a sound codename, ordered 1-4 (4 = ultimate).
pub(crate) fn ability_slots(codename: &str) -> Vec<(u8, &'static AbilitySlotMeta)> {
  let Some(slots) = tables().slots.get(codename) else {
    return Vec::new();
  };
  let mut out = Vec::new();
  for slot in 1u8..=4 {
    if let Some(meta) = slots.get(&slot.to_string()) {
      out.push((slot, meta));
    }
  }
  out
}

pub(crate) fn curated_slot(codename: &str, dev_token: &str) -> Option<u8> {
  tables()
    .curation
    .get(codename)
    .and_then(|tokens| tokens.get(dev_token))
    .copied()
}
