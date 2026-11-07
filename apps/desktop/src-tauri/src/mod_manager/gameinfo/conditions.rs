/// Deadlock's desktop client platforms. Platform conditions are resolved only
/// when deriving new mounts; unknown engine symbols leave the file unchanged.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Platform {
  Windows,
  Linux,
  MacOs,
}

impl Platform {
  /// Deadlock's win64 client runs natively on Windows and under Proton on Linux.
  /// The manager's host OS must not select different engine search paths.
  pub const CLIENT: Self = Self::Windows;

  fn symbol(self, name: &str) -> Option<bool> {
    match name.to_ascii_uppercase().as_str() {
      "WIN32" | "WIN64" | "WINDOWS" => Some(self == Self::Windows),
      "LINUX" => Some(self == Self::Linux),
      "OSX" | "OSX64" => Some(self == Self::MacOs),
      "POSIX" => Some(self != Self::Windows),
      "X360" | "PS3" | "GAMECONSOLE" => Some(false),
      _ => None,
    }
  }
}

pub(super) fn matches(raw: &str, platform: Platform) -> Result<bool, String> {
  let expression = raw
    .strip_prefix('[')
    .and_then(|text| text.strip_suffix(']'))
    .ok_or_else(|| format!("Invalid SearchPaths condition {raw}"))?;
  let mut parser = Expression {
    remaining: expression,
    platform,
  };
  let value = parser.or().map_err(|reason| {
    format!("Cannot resolve SearchPaths condition {raw}: {reason}; the file was left unchanged")
  })?;
  if !parser.remaining.trim().is_empty() {
    return Err(format!(
      "Invalid SearchPaths condition {raw}; the file was left unchanged"
    ));
  }
  Ok(value)
}

struct Expression<'a> {
  remaining: &'a str,
  platform: Platform,
}

impl Expression<'_> {
  fn take(&mut self, token: &str) -> bool {
    self.remaining = self.remaining.trim_start();
    if let Some(rest) = self.remaining.strip_prefix(token) {
      self.remaining = rest;
      true
    } else {
      false
    }
  }

  fn or(&mut self) -> Result<bool, String> {
    let mut value = self.and()?;
    while self.take("||") {
      value |= self.and()?;
    }
    Ok(value)
  }

  fn and(&mut self) -> Result<bool, String> {
    let mut value = self.atom()?;
    while self.take("&&") {
      value &= self.atom()?;
    }
    Ok(value)
  }

  fn atom(&mut self) -> Result<bool, String> {
    if self.take("!") {
      return Ok(!self.atom()?);
    }
    if self.take("(") {
      let value = self.or()?;
      if !self.take(")") {
        return Err("missing ')'".into());
      }
      return Ok(value);
    }
    self.take("$");
    let length = self
      .remaining
      .find(|character: char| !character.is_ascii_alphanumeric() && character != '_')
      .unwrap_or(self.remaining.len());
    let name = &self.remaining[..length];
    self.remaining = &self.remaining[length..];
    self
      .platform
      .symbol(name)
      .ok_or_else(|| format!("unsupported symbol {name:?}"))
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn platform_conditions_keep_boolean_precedence_and_negation() {
    for platform in [Platform::Windows, Platform::Linux, Platform::MacOs] {
      assert_eq!(
        matches("[$WIN64]", platform).unwrap(),
        platform == Platform::Windows
      );
      assert_eq!(
        matches("[!$LINUX]", platform).unwrap(),
        platform != Platform::Linux
      );
      assert_eq!(
        matches("[$LINUX || $OSX]", platform).unwrap(),
        platform != Platform::Windows
      );
      assert_eq!(
        matches("[!($WIN32 || $OSX) && $POSIX]", platform).unwrap(),
        platform == Platform::Linux
      );
      assert_eq!(
        matches("[$WIN64 || $LINUX && !$POSIX]", platform).unwrap(),
        platform == Platform::Windows
      );
    }
  }

  #[test]
  fn unsupported_or_malformed_conditions_do_not_guess() {
    for raw in ["[$CUSTOM]", "[$WIN64 &&]", "[($LINUX]", "[$WIN64 trailing]"] {
      assert!(matches(raw, Platform::Windows).is_err(), "accepted {raw}");
    }
  }
}
