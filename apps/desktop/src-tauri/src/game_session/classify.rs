use super::types::SessionClassification;

const EXIT_SYSTEM_SHUTDOWN: u32 = 0x4001_0004;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ExitSignals {
  pub exit_code: Option<u32>,
  pub dump_found: bool,
  pub console_clean: Option<bool>,
  pub dmm_stopped: bool,
}

pub fn classify(signals: &ExitSignals) -> SessionClassification {
  if signals.dump_found || signals.exit_code.is_some_and(is_error_status) {
    return SessionClassification::Crash;
  }
  if matches!(signals.exit_code, Some(0 | EXIT_SYSTEM_SHUTDOWN))
    || signals.console_clean == Some(true)
  {
    return SessionClassification::Clean;
  }
  if signals.dmm_stopped {
    return SessionClassification::Stopped;
  }
  if signals.exit_code.is_some() || signals.console_clean == Some(false) {
    return SessionClassification::Ambiguous;
  }
  SessionClassification::Unknown
}

fn is_error_status(code: u32) -> bool {
  code & 0xF000_0000 == 0xC000_0000
}

#[cfg(test)]
mod tests {
  use super::*;
  use SessionClassification::*;

  fn signals(
    exit_code: Option<u32>,
    dump_found: bool,
    console_clean: Option<bool>,
    dmm_stopped: bool,
  ) -> ExitSignals {
    ExitSignals {
      exit_code,
      dump_found,
      console_clean,
      dmm_stopped,
    }
  }

  #[test]
  fn classification_table() {
    let cases = [
      (signals(Some(0), true, Some(true), false), Crash),
      (signals(None, true, None, false), Crash),
      (signals(Some(0xC000_0005), false, None, false), Crash),
      (signals(Some(0xC000_0005), false, None, true), Crash),
      (signals(Some(0xCFFF_FFFF), false, Some(true), false), Crash),
      (signals(Some(0xC000_0409), false, None, false), Crash),
      (signals(Some(0), false, None, false), Clean),
      (signals(Some(0), false, Some(false), false), Clean),
      (
        signals(Some(EXIT_SYSTEM_SHUTDOWN), false, None, false),
        Clean,
      ),
      (signals(None, false, Some(true), false), Clean),
      (signals(Some(1), false, Some(true), false), Clean),
      (signals(Some(1), false, None, true), Stopped),
      (signals(None, false, Some(false), true), Stopped),
      (signals(None, false, None, true), Stopped),
      (signals(Some(0), false, None, true), Clean),
      (signals(Some(1), false, None, false), Ambiguous),
      (signals(Some(1), false, Some(false), false), Ambiguous),
      (signals(Some(0x8000_0003), false, None, false), Ambiguous),
      (signals(None, false, Some(false), false), Ambiguous),
      (signals(None, false, None, false), Unknown),
    ];

    for (input, expected) in cases {
      assert_eq!(classify(&input), expected, "{input:?}");
    }
  }
}
