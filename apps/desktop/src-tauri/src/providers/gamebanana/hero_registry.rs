use super::generated_hero_registry::{HERO_ALIASES, HERO_FUZZY_TOKENS, HERO_PHRASES};

pub const SKINS_CATEGORY: &str = "Skins";

/// A submission's GameBanana category names, from the top level down.
#[derive(Default)]
pub struct CategoryPath<'a> {
  pub root: Option<&'a str>,
  pub parent: Option<&'a str>,
  pub category: Option<&'a str>,
}

pub fn resolve_from_skin_category(path: CategoryPath<'_>, submission_name: &str) -> Option<String> {
  hero_from_category_path(&path).or_else(|| guess(submission_name))
}

// Skins nest as Skins > hero > style (e.g. Faithful/Vanilla+), so the hero is
// the category or its parent. Profiles omit the root; no other root has
// hero-named children, so a parent naming a hero is enough on its own.
fn hero_from_category_path(path: &CategoryPath<'_>) -> Option<String> {
  let root = path.root.filter(|root| !root.is_empty());
  if root.is_some_and(|root| root != SKINS_CATEGORY) {
    return None;
  }
  let is_skin = root == Some(SKINS_CATEGORY) || path.parent == Some(SKINS_CATEGORY);
  is_skin
    .then(|| path.category.and_then(normalize))
    .flatten()
    .or_else(|| path.parent.and_then(normalize))
}

pub fn normalize(value: &str) -> Option<String> {
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
  use super::{CategoryPath, guess, normalize, resolve_from_skin_category};

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
      resolve_from_skin_category(
        CategoryPath {
          parent: Some("Skins"),
          category: Some("Drifter"),
          ..Default::default()
        },
        "Pink"
      ),
      Some("Drifter".to_string())
    );
  }

  #[test]
  fn resolves_heroes_by_codename_and_multi_word_name() {
    assert_eq!(
      resolve_from_skin_category(
        CategoryPath {
          parent: Some("Skins"),
          category: Some("RatKing"),
          ..Default::default()
        },
        "Recolor"
      ),
      Some("Rat King".to_string())
    );
    assert_eq!(normalize("chessmaster"), Some("Solomon".to_string()));
    assert_eq!(
      guess("Deadman Danny Crash Test"),
      Some("Deadman Danny".to_string())
    );
    assert_eq!(guess("Nurse Harrow VO"), Some("Nurse Harrow".to_string()));
    assert_eq!(guess("Violet Painter Outfit"), Some("Violet".to_string()));
    assert_eq!(
      guess("Warden as Makina from Deadman Wonderland"),
      Some("Warden".to_string())
    );
    assert_eq!(guess("Harrow Grey Talon"), Some("Grey Talon".to_string()));
  }

  #[test]
  fn reads_the_hero_from_a_skin_subcategory_parent() {
    let nested = |root| CategoryPath {
      root,
      parent: Some("Nurse Harrow"),
      category: Some("Faithful/Vanilla+"),
    };
    assert_eq!(
      resolve_from_skin_category(nested(None), "Nurse Sparrow"),
      Some("Nurse Harrow".to_string())
    );
    assert_eq!(
      resolve_from_skin_category(nested(Some("Skins")), "Nurse Sparrow"),
      Some("Nurse Harrow".to_string())
    );
    assert_eq!(
      resolve_from_skin_category(nested(Some("Model Replacement")), "Walker"),
      None
    );
  }
}
