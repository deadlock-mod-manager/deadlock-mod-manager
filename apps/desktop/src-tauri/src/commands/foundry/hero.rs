use std::collections::HashMap;
use std::sync::OnceLock;

use serde::Deserialize;

pub(crate) use hero_parser::{canonical_sound_codename, sound_codename_for_hero};

pub(crate) fn panorama_codenames(hero_name: &str) -> Vec<&'static str> {
  match hero_name {
    "Abrams" => vec!["atlas", "bull"],
    "Apollo" => vec!["fencer"],
    "Baba" => vec!["baba"],
    "Bebop" => vec!["bebop"],
    "Billy" => vec!["punkgoat"],
    "Calico" => vec!["nano"],
    "Celeste" => vec!["unicorn"],
    "Deadman Danny" => vec!["deadpack"],
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
    "Nurse Harrow" => vec!["nurse"],
    "Paige" => vec!["bookworm"],
    "Paradox" => vec!["chrono"],
    "Pocket" => vec!["synth"],
    "Rat King" => vec!["ratking"],
    "Rem" => vec!["familiar"],
    "Seven" => vec!["gigawatt"],
    "Shiv" => vec!["shiv"],
    "Silver" => vec!["werewolf"],
    "Sinclair" => vec!["magician"],
    "Solomon" => vec!["chessmaster"],
    "Venator" => vec!["priest"],
    "Victor" => vec!["frank"],
    "Vindicta" => vec!["hornet"],
    "Violet" => vec!["artist"],
    "Viscous" => vec!["viscous"],
    "Vyper" => vec!["viper"],
    "Warden" => vec!["warden"],
    "Wraith" => vec!["wraith"],
    "Wrecker" => vec!["butcher"],
    "Yamato" => vec!["yamato"],
    _ => Vec::new(),
  }
}

pub(crate) fn art_names(hero_name: &str, codenames: &[&str]) -> Vec<String> {
  let mut names: Vec<String> = codenames.iter().map(|name| (*name).to_string()).collect();
  let words: Vec<String> = hero_name
    .to_ascii_lowercase()
    .split(|c: char| !c.is_ascii_alphanumeric())
    .filter(|word| !word.is_empty() && *word != "the")
    .map(str::to_string)
    .collect();
  if let (Some(first), Some(last)) = (words.first(), words.last()) {
    names.extend([words.join(""), words.join("_"), first.clone(), last.clone()]);
  }
  names.sort_by(|a, b| b.len().cmp(&a.len()).then_with(|| a.cmp(b)));
  names.dedup();
  names
}

pub(crate) fn card_prefixes(names: &[String]) -> Vec<String> {
  names
    .iter()
    .flat_map(|name| {
      [
        format!("panorama/images/heroes/{name}_"),
        format!("panorama/images/heroes/backgrounds/{name}_bg"),
        format!("panorama/images/heroes/guns/{name}_"),
        format!("panorama/images/hud/abilities/{name}/"),
        format!("panorama/images/hud/abilities/{name}_"),
      ]
    })
    .collect()
}

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

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct AbilitySlotMeta {
  pub(crate) token: String,
  pub(crate) display: String,
}

#[derive(Debug, Deserialize)]
struct AbilityTables {
  slots: HashMap<String, HashMap<String, AbilitySlotMeta>>,
  curation: HashMap<String, HashMap<String, u8>>,
}

fn tables() -> &'static AbilityTables {
  static TABLES: OnceLock<AbilityTables> = OnceLock::new();
  TABLES.get_or_init(|| {
    serde_json::from_str(include_str!("hero-ability-slots.json"))
      .expect("hero-ability-slots.json is malformed")
  })
}

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
