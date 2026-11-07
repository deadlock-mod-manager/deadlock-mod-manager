use kv_parser::{KvError, ParseOptions, SourceDocument};

pub(crate) use kv_parser::{
  LineComment as Comment, SourceKind as SiteKind, SourceSite as Site, line_end, line_start,
};

#[derive(Debug, thiserror::Error)]
pub(crate) enum ParseError {
  #[error("gameinfo.gi could not be parsed: {0}")]
  KeyValues(#[from] KvError),
  #[error("gameinfo.gi has no GameInfo block")]
  MissingRoot,
}

/// A GameInfo view of the parser's lossless source inspection.
pub(crate) struct Document {
  pub sites: Vec<Site>,
  pub comments: Vec<Comment>,
}

impl Document {
  pub fn parse(text: &str) -> Result<Self, ParseError> {
    // Source 2 reads backslashes literally in gameinfo.gi.
    let document = SourceDocument::parse(
      text,
      ParseOptions {
        allow_escape_sequences: false,
        ..ParseOptions::default()
      },
    )?;
    let body = document
      .sites
      .iter()
      .find_map(|site| {
        if site.path.len() == 1
          && site.path[0].eq_ignore_ascii_case("GameInfo")
          && let SiteKind::Object { open, close } = site.kind
        {
          return Some(open + 1..close);
        }
        None
      })
      .ok_or(ParseError::MissingRoot)?;
    let sites = document
      .sites
      .into_iter()
      .filter(|site| body.contains(&site.key_start))
      .map(|mut site| {
        site.path.remove(0);
        site
      })
      .collect();
    Ok(Self {
      sites,
      comments: document.comments,
    })
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::gameinfo::client_symbol;

  #[test]
  fn malformed_trailing_input_is_rejected_before_editing() {
    let valid = "GameInfo { FileSystem { SearchPaths { Game citadel } } }";
    for tail in [" /*", " { }", " [", " }"] {
      assert!(
        Document::parse(&format!("{valid}{tail}")).is_err(),
        "accepted {tail:?}"
      );
    }
  }

  #[test]
  fn selects_gameinfo_and_keeps_conditions_on_the_root_and_its_ancestors() {
    let text = "Other { Item ignored }\nGameInfo { FileSystem { SearchPaths { Game citadel [$WIN64] } [$LINUX || $WIN64] } } [!$GAMECONSOLE]";
    let document = Document::parse(text).unwrap();
    let game = document
      .sites
      .iter()
      .find(|site| site.path.last().unwrap() == "Game")
      .unwrap();
    assert_eq!(game.path, ["FileSystem", "SearchPaths", "Game"]);
    assert_eq!(
      game.conditions,
      ["[!$GAMECONSOLE]", "[$LINUX || $WIN64]", "[$WIN64]"]
    );
    assert!(game.applies(client_symbol).unwrap());
    assert!(
      !document
        .sites
        .iter()
        .any(|site| site.path.last().unwrap() == "Item")
    );
  }

  #[test]
  fn a_non_gameinfo_document_has_no_game_root() {
    assert!(matches!(
      Document::parse("Root { Item value }"),
      Err(ParseError::MissingRoot)
    ));
  }
}
