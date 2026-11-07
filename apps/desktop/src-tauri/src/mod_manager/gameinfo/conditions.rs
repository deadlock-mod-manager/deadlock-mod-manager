/// Engine symbols for Deadlock's Windows client, including when run under
/// Proton. The manager's host OS does not select the game's search paths.
pub(crate) fn client_symbol(name: &str) -> Option<bool> {
  match name.to_ascii_uppercase().as_str() {
    "WIN32" | "WIN64" | "WINDOWS" => Some(true),
    "LINUX" | "OSX" | "OSX64" | "POSIX" | "X360" | "PS3" | "GAMECONSOLE" => Some(false),
    _ => None,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn deadlock_client_symbols_are_independent_of_the_manager_host() {
    for name in ["WIN32", "WIN64", "WINDOWS", "win64"] {
      assert_eq!(client_symbol(name), Some(true));
    }
    for name in [
      "LINUX",
      "OSX",
      "OSX64",
      "POSIX",
      "X360",
      "PS3",
      "GAMECONSOLE",
    ] {
      assert_eq!(client_symbol(name), Some(false));
    }
    assert_eq!(client_symbol("CUSTOM"), None);
  }
}
