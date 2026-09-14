use super::generated_hero_registry::{HERO_ALIASES, HERO_FUZZY_TOKENS, HERO_PHRASES};

const SKINS_SUPER_CATEGORY: &str = "Skins";

pub fn resolve_from_skin_category(
  super_category: Option<&str>,
  category: Option<&str>,
  submission_name: &str,
) -> Option<String> {
  let from_category = if super_category == Some(SKINS_SUPER_CATEGORY) {
    category
      .filter(|name| !matches!(*name, "Skins" | "Other"))
      .and_then(normalize)
  } else {
    None
  };

  from_category.or_else(|| guess(submission_name))
}

fn normalize(value: &str) -> Option<String> {
  let key = normalize_key(value);
  HERO_ALIASES.iter().find_map(|(hero, aliases)| {
    aliases
      .iter()
      .any(|alias| normalize_key(alias) == key)
      .then(|| (*hero).to_string())
  })
}

fn guess(value: &str) -> Option<String> {
  if let Some(hero) = normalize(value) {
    return Some(hero);
  }

  let normalized = normalize_key(value);
  let padded = format!(" {normalized} ");

  for (hero, aliases) in HERO_ALIASES {
    let alias_matches = aliases.iter().any(|alias| {
      let alias = normalize_key(alias);
      !alias.contains(' ') && padded.contains(&format!(" {alias} "))
    });
    let fuzzy_matches = patterns_for(HERO_FUZZY_TOKENS, hero)
      .iter()
      .any(|token| padded.contains(&format!(" {} ", normalize_key(token))));
    let phrase_matches = patterns_for(HERO_PHRASES, hero)
      .iter()
      .any(|phrase| padded.contains(&format!(" {} ", normalize_key(phrase))));

    if alias_matches || fuzzy_matches || phrase_matches {
      return Some((*hero).to_string());
    }
  }

  None
}

fn patterns_for<'a>(table: &'a [(&str, &[&str])], hero: &str) -> &'a [&'a str] {
  table
    .iter()
    .find_map(|(candidate, patterns)| (*candidate == hero).then_some(*patterns))
    .unwrap_or_default()
}

fn normalize_key(value: &str) -> String {
  let mut normalized = String::with_capacity(value.len());
  let mut pending_space = false;

  for character in value.trim().to_lowercase().chars() {
    match character {
      'a'..='z' | '0'..='9' => {
        if pending_space && !normalized.is_empty() {
          normalized.push(' ');
        }
        normalized.push(character);
        pending_space = false;
      }
      '&' => {
        if !normalized.is_empty() && !normalized.ends_with(' ') {
          normalized.push(' ');
        }
        normalized.push_str("and");
        pending_space = true;
      }
      '\'' | '`' => {}
      _ => pending_space = true,
    }
  }

  normalized.trim().to_string()
}

#[cfg(test)]
mod tests {
  use super::{guess, normalize, resolve_from_skin_category};

  #[test]
  fn generated_aliases_match_shared_registry_behavior() {
    assert_eq!(normalize("atlas"), Some("Abrams".to_string()));
    assert_eq!(normalize("MoKrill"), Some("Mo & Krill".to_string()));
    assert_eq!(
      guess("new atlas detective skin"),
      Some("Abrams".to_string())
    );
    assert_eq!(guess("brams fencer"), Some("Abrams".to_string()));
    assert_eq!(
      guess("New Lady-Geist recolor"),
      Some("Lady Geist".to_string())
    );
    assert_eq!(
      resolve_from_skin_category(Some("Skins"), Some("Drifter"), "Pink"),
      Some("Drifter".to_string())
    );
  }
}
