use super::types::SessionClassification;

/// Windows' "the system is shutting down" exit (DBG_TERMINATE_PROCESS).
const EXIT_SYSTEM_SHUTDOWN: u32 = 0x4001_0004;

/// What a session left behind when it ended.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ExitSignals {
  pub exit_code: Option<u32>,
  pub dump_found: bool,
  /// `Some(true)`: console.log ends with the engine's shutdown lines.
  /// `Some(false)`: the log is ours but the lines are missing.
  /// `None`: no -condebug, or the log belongs to a later run.
  pub console_clean: Option<bool>,
  pub dmm_stopped: bool,
}

/// Crash signals win over clean ones: a dump is written only when the engine
/// faults or asserts, and an NTSTATUS error exit (0xC…, including the
/// 0xCFFFFFFF Steam reports for a hung game the user closed) is never a normal
/// quit. Exit code 1 is what a forced kill or a fatal error looks like, so on
/// its own it stays ambiguous; when the app did the killing, the session never
/// got to show how it would have ended.
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
      // Dumps and error statuses are crashes whatever else happened.
      (signals(Some(0), true, Some(true), false), Crash),
      (signals(None, true, None, false), Crash),
      (signals(Some(0xC000_0005), false, None, false), Crash),
      (signals(Some(0xC000_0005), false, None, true), Crash),
      (signals(Some(0xCFFF_FFFF), false, Some(true), false), Crash),
      (signals(Some(0xC000_0409), false, None, false), Crash),
      // Normal quits.
      (signals(Some(0), false, None, false), Clean),
      (signals(Some(0), false, Some(false), false), Clean),
      (
        signals(Some(EXIT_SYSTEM_SHUTDOWN), false, None, false),
        Clean,
      ),
      (signals(None, false, Some(true), false), Clean),
      (signals(Some(1), false, Some(true), false), Clean),
      // The app's own stop (taskkill exits with 1), unless the game had
      // already quit by itself.
      (signals(Some(1), false, None, true), Stopped),
      (signals(None, false, Some(false), true), Stopped),
      (signals(None, false, None, true), Stopped),
      (signals(Some(0), false, None, true), Clean),
      // Abnormal exits with no explanation.
      (signals(Some(1), false, None, false), Ambiguous),
      (signals(Some(1), false, Some(false), false), Ambiguous),
      (signals(Some(0x8000_0003), false, None, false), Ambiguous),
      (signals(None, false, Some(false), false), Ambiguous),
      // Nothing to go on (Linux without -condebug, Steam log unavailable).
      (signals(None, false, None, false), Unknown),
    ];

    for (input, expected) in cases {
      assert_eq!(classify(&input), expected, "{input:?}");
    }
  }
}
