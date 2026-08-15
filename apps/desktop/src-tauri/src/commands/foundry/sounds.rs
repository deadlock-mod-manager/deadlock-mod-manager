//! Per-ability sound classification.
//!
//! Deadlock ability sounds live at `sounds/abilities/<sound_codename>/...`, but
//! the file names inside that folder are inconsistent: some mods keep the
//! engine's `aN` slot token, some name files after the ability's lore name, and
//! some use the internal dev token. The slot a file belongs to (1-3 plus 4 =
//! ultimate) is therefore resolved per FILE, in priority order:
//!
//!   1. an `aN` token in the path (folder `a4_x/`, bare `a4/`, or infix `_a4_`),
//!   2. a hand-curated dev-token override,
//!   3. the ability's display name or internal token appearing in the path,
//!   4. a bidirectional stem match between the file's dev token and a slot key.
//!
//! Anything that resolves to no slot still shows up, grouped into voice lines,
//! weapon sounds or a catch-all bucket, so nothing in the VPK is hidden from the
//! user.

use super::hero::{ability_slots, canonical_sound_codename, curated_slot, sound_codename_for_hero};
use super::types::{FoundryEntry, FoundrySoundGroup, FoundrySoundGroupKind};

/// The `sounds/abilities/<codename>/` prefix, returning the codename.
fn ability_codename(path: &str) -> Option<String> {
  let lower = path.to_ascii_lowercase();
  let rest = lower.strip_prefix("sounds/abilities/")?;
  let (codename, tail) = rest.split_once('/')?;
  if codename.is_empty() || tail.is_empty() {
    return None;
  }
  Some(canonical_sound_codename(codename))
}

fn voice_codename(path: &str) -> Option<String> {
  let lower = path.to_ascii_lowercase();
  let rest = lower
    .strip_prefix("sounds/vo/")
    .or_else(|| lower.strip_prefix("sounds/voice/"))?;
  let (codename, tail) = rest.split_once('/')?;
  if codename.is_empty() || tail.is_empty() {
    return None;
  }
  Some(canonical_sound_codename(codename))
}

fn is_weapon_sound(path: &str) -> bool {
  let lower = path.to_ascii_lowercase();
  lower.starts_with("sounds/weapons/") || lower.contains("/weapons/")
}

/// The `aN` slot token: folder `a4_name/`, bare folder `a4/`, or infix `_a4_`.
fn an_token_slot(path: &str) -> Option<u8> {
  let bytes = path.as_bytes();
  for (index, window) in bytes.windows(3).enumerate() {
    let leads = index == 0 || matches!(bytes[index - 1], b'/' | b'_');
    if !leads {
      continue;
    }
    if (window[0] == b'a' || window[0] == b'A')
      && window[1].is_ascii_digit()
      && matches!(window[2], b'_' | b'/')
    {
      let slot = window[1] - b'0';
      if (1..=4).contains(&slot) {
        return Some(slot);
      }
    }
  }
  None
}

/// The path segment after `sounds/abilities/<codename>/`, minus a leading
/// codename and/or `aN` segment: the file's internal ability ("dev") token.
fn dev_token(codename: &str, path: &str) -> String {
  let tail = ability_tail(path);
  let flattened = tail
    .trim_end_matches(".vsnd_c")
    .trim_end_matches(".vsnd")
    .replace('/', "_");
  let mut segments = flattened.split('_').filter(|s| !s.is_empty());
  let mut first = segments.next().unwrap_or("?");
  if first == codename {
    first = segments.next().unwrap_or("?");
  }
  if first.len() == 2 && first.starts_with('a') && first.as_bytes()[1].is_ascii_digit() {
    first = segments.next().unwrap_or("?");
  }
  first.to_string()
}

/// Everything after `sounds/abilities/<codename>/`.
fn ability_tail(path: &str) -> String {
  let lower = path.to_ascii_lowercase();
  lower
    .strip_prefix("sounds/abilities/")
    .and_then(|rest| rest.split_once('/'))
    .map(|(_, tail)| tail.to_string())
    .unwrap_or(lower)
}

/// Per-slot match keys: the ability's internal token plus the words of its
/// display name, both filtered to >= 4 characters so short generic words like
/// "of" or "the" can't claim a file.
fn slot_keys(codename: &str) -> Vec<(u8, Vec<String>)> {
  ability_slots(codename)
    .into_iter()
    .map(|(slot, meta)| {
      let mut keys = Vec::new();
      if meta.token.len() >= 4 {
        keys.push(meta.token.to_ascii_lowercase());
      }
      for word in meta
        .display
        .to_ascii_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
      {
        if word.len() >= 4 && !keys.iter().any(|key| key == word) {
          keys.push(word.to_string());
        }
      }
      (slot, keys)
    })
    .collect()
}

/// Resolve a `sounds/abilities/<codename>/...` path to an ability slot, or
/// `None` when nothing matches (movement, generic or unmapped ability sounds).
fn resolve_ability_slot(codename: &str, path: &str) -> Option<u8> {
  if let Some(slot) = an_token_slot(&path.to_ascii_lowercase()) {
    return Some(slot);
  }

  let tail = ability_tail(path);
  let token = dev_token(codename, path);

  if let Some(slot) = curated_slot(codename, &token) {
    return Some(slot);
  }

  let keys = slot_keys(codename);

  // Longest key first, so a specific ability token wins over a short word that
  // happens to appear in several display names.
  let mut by_specificity = keys.clone();
  by_specificity
    .sort_by_key(|(_, keys)| std::cmp::Reverse(keys.iter().map(String::len).max().unwrap_or(0)));
  for (slot, slot_keys) in &by_specificity {
    if slot_keys.iter().any(|key| tail.contains(key.as_str())) {
      return Some(*slot);
    }
  }

  // Bidirectional stem: the file's dev token is contained in a slot key, or the
  // other way round.
  for (slot, slot_keys) in &keys {
    for key in slot_keys {
      if token == *key
        || (token.len() >= 4 && key.contains(&token))
        || (key.len() >= 4 && token.contains(key.as_str()))
      {
        return Some(*slot);
      }
    }
  }

  None
}

fn push_group(
  groups: &mut Vec<FoundrySoundGroup>,
  id: &str,
  kind: FoundrySoundGroupKind,
  slot: Option<u8>,
  label: String,
) {
  groups.push(FoundrySoundGroup {
    id: id.to_string(),
    kind,
    slot,
    label,
    entries: Vec::new(),
  });
}

fn group_index(groups: &[FoundrySoundGroup], id: &str) -> Option<usize> {
  groups.iter().position(|group| group.id == id)
}

/// Group a skin's sound entries into ability slots, voice lines, weapon sounds
/// and a catch-all, in the order the sound browser renders them. Groups with no
/// entries are dropped, so the UI never shows an empty section.
pub(crate) fn group_sounds(
  hero_display: Option<&str>,
  entries: &[FoundryEntry],
) -> Vec<FoundrySoundGroup> {
  let hero_codename = hero_display.and_then(sound_codename_for_hero);

  let mut groups: Vec<FoundrySoundGroup> = Vec::new();
  if let Some(codename) = hero_codename {
    for (slot, meta) in ability_slots(codename) {
      let label = if meta.display.trim().is_empty() {
        format!("Ability {slot}")
      } else {
        meta.display.clone()
      };
      push_group(
        &mut groups,
        &format!("ability-{slot}"),
        FoundrySoundGroupKind::Ability,
        Some(slot),
        label,
      );
    }
  }
  push_group(
    &mut groups,
    "ability-unmapped",
    FoundrySoundGroupKind::Ability,
    None,
    "Other abilities".to_string(),
  );
  push_group(
    &mut groups,
    "voice",
    FoundrySoundGroupKind::Voice,
    None,
    "Voice lines".to_string(),
  );
  push_group(
    &mut groups,
    "weapon",
    FoundrySoundGroupKind::Weapon,
    None,
    "Weapon".to_string(),
  );
  push_group(
    &mut groups,
    "soundevents",
    FoundrySoundGroupKind::Soundevents,
    None,
    "Sound events".to_string(),
  );
  push_group(
    &mut groups,
    "other",
    FoundrySoundGroupKind::Other,
    None,
    "Other sounds".to_string(),
  );

  for entry in entries {
    let target = classify_sound(hero_codename, entry);
    if let Some(index) = group_index(&groups, &target) {
      groups[index].entries.push(entry.clone());
    }
  }

  groups.retain(|group| !group.entries.is_empty());
  for group in &mut groups {
    group.entries.sort_by(|a, b| a.path.cmp(&b.path));
  }
  groups
}

fn classify_sound(hero_codename: Option<&str>, entry: &FoundryEntry) -> String {
  if entry.ext == "vsndevts_c" || entry.ext == "vsndstck_c" {
    return "soundevents".to_string();
  }

  if let Some(codename) = ability_codename(&entry.path) {
    // A skin VPK can carry a stray file for another hero; keep those out of the
    // ability slots (which belong to the loaded hero) but still list them.
    if hero_codename.is_some_and(|hero| hero == codename)
      && let Some(slot) = resolve_ability_slot(&codename, &entry.path)
    {
      return format!("ability-{slot}");
    }
    return "ability-unmapped".to_string();
  }

  if voice_codename(&entry.path).is_some() {
    return "voice".to_string();
  }

  if is_weapon_sound(&entry.path) {
    return "weapon".to_string();
  }

  "other".to_string()
}

/// Extract a browser-playable MP3 payload from a compiled `.vsnd_c`.
///
/// A `.vsnd_c` is a resource container whose DATA block is followed by the raw
/// encoded audio. Deadlock ships most clips as MP3, so the payload is found by
/// skipping the resource header and scanning forward for the first MPEG frame
/// sync. Clips in other codecs (ADPCM, PCM) return `None` — they simply have no
/// preview rather than failing the whole sound tab.
pub(crate) fn find_mp3_payload(bytes: &[u8]) -> Option<&[u8]> {
  if bytes.len() < 8 {
    return None;
  }

  let resource_size = u32::from_le_bytes(bytes[0..4].try_into().ok()?) as usize;
  let start = resource_size.min(bytes.len());
  let payload = &bytes[start..];
  for index in 0..payload.len().saturating_sub(1) {
    if payload[index] == 0xff && matches!(payload[index + 1], 0xfb | 0xf3 | 0xf2 | 0xfa) {
      return Some(&payload[index..]);
    }
  }
  None
}

#[cfg(test)]
mod tests {
  use super::super::types::{FoundryCategory, FoundryEntrySource};
  use super::*;

  fn entry(path: &str) -> FoundryEntry {
    FoundryEntry {
      path: path.to_string(),
      filename: path.rsplit('/').next().unwrap_or(path).to_string(),
      ext: "vsnd_c".to_string(),
      size: 0,
      category: FoundryCategory::Sound,
      source: FoundryEntrySource::Mod,
    }
  }

  #[test]
  fn an_token_wins_over_everything() {
    assert_eq!(
      resolve_ability_slot("haze", "sounds/abilities/haze/a4_flurry/shot.vsnd_c"),
      Some(4)
    );
    assert_eq!(
      resolve_ability_slot("haze", "sounds/abilities/haze/haze_a2_cast.vsnd_c"),
      Some(2)
    );
  }

  #[test]
  fn display_name_matches_lore_named_files() {
    assert_eq!(
      resolve_ability_slot(
        "kelvin",
        "sounds/abilities/kelvin/frozen_shelter_cast.vsnd_c"
      ),
      Some(4)
    );
  }

  #[test]
  fn curated_token_overrides_name_match() {
    assert_eq!(
      resolve_ability_slot("wraith", "sounds/abilities/wraith/royalflush_cast.vsnd_c"),
      Some(1)
    );
  }

  #[test]
  fn unknown_ability_falls_back_to_the_unmapped_bucket() {
    let groups = group_sounds(
      Some("Haze"),
      &[entry("sounds/abilities/haze/footstep_generic.vsnd_c")],
    );
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].id, "ability-unmapped");
  }

  #[test]
  fn voice_and_weapon_get_their_own_groups() {
    let groups = group_sounds(
      Some("Haze"),
      &[
        entry("sounds/vo/haze/haze_kill_01.vsnd_c"),
        entry("sounds/weapons/haze/smg_fire.vsnd_c"),
      ],
    );
    let ids = groups.iter().map(|g| g.id.as_str()).collect::<Vec<_>>();
    assert_eq!(ids, vec!["voice", "weapon"]);
  }

  #[test]
  fn legacy_sound_directories_fold_into_the_current_codename() {
    assert_eq!(
      ability_codename("sounds/abilities/archer/shot.vsnd_c").as_deref(),
      Some("orion")
    );
  }
}
