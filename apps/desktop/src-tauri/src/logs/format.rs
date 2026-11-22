use std::borrow::Cow;
use std::fmt::{Arguments, Write};

use log::kv::{Key, Value, VisitSource};
use log::{Level, Record};
use tauri_plugin_log::WEBVIEW_TARGET;
use tauri_plugin_log::fern::FormatCallback;

const CRATE_PREFIX: &str = "desktop_lib::";
const MODULE_KEY: &str = "module";
const SOURCE_WIDTH: usize = 24;

const RESET: &str = "\x1b[0m";
const DIM: &str = "\x1b[2m";
const BOLD: &str = "\x1b[1m";
const RED: &str = "\x1b[31m";
const GREEN: &str = "\x1b[32m";
const YELLOW: &str = "\x1b[33m";
const BLUE: &str = "\x1b[34m";
const MAGENTA: &str = "\x1b[35m";
const CYAN: &str = "\x1b[36m";

/// Matches tauri-plugin-log's default layout so the log files stay unchanged.
pub fn plain(out: FormatCallback, message: &Arguments, record: &Record) {
  out.finish(format_args!(
    "{}[{}][{}] {}",
    chrono::Utc::now().format("[%Y-%m-%d][%H:%M:%S]"),
    record.target(),
    record.level(),
    message
  ));
}

/// Colored, compact layout for the dev terminal.
pub fn pretty(out: FormatCallback, message: &Arguments, record: &Record) {
  let (source, source_color) = source(record);
  let (ellipsis, source) = truncate_start(&source, SOURCE_WIDTH);
  let source_width = SOURCE_WIDTH - ellipsis.chars().count();
  let (level_color, message_color) = match record.level() {
    Level::Error => (RED, RED),
    Level::Warn => (YELLOW, YELLOW),
    Level::Info => (GREEN, ""),
    Level::Debug => (BLUE, DIM),
    Level::Trace => (MAGENTA, DIM),
  };

  let mut fields = FieldWriter::default();
  let _ = record.key_values().visit(&mut fields);

  out.finish(format_args!(
    "{DIM}{time}{RESET} {BOLD}{level_color}{level:<5}{RESET} {source_color}{ellipsis}{source:<source_width$}{RESET} {message_color}{message}{RESET}{fields}",
    time = chrono::Local::now().format("%H:%M:%S%.3f"),
    level = record.level(),
    fields = fields.0,
  ));
}

/// Short source label: Rust module path without the crate prefix, or
/// `web:<module>` for webview logs (instead of the full JS stack location).
fn source<'a>(record: &Record<'a>) -> (Cow<'a, str>, &'static str) {
  let target = record.target();
  if target.starts_with(WEBVIEW_TARGET) {
    let module = match record.key_values().get(Key::from_str(MODULE_KEY)) {
      Some(module) => Cow::Owned(format!("web:{module}")),
      None => Cow::Borrowed("web"),
    };
    return (module, MAGENTA);
  }
  let target = target.strip_prefix(CRATE_PREFIX).unwrap_or(target);
  (Cow::Borrowed(target), CYAN)
}

/// Keeps the last `width - 1` chars behind an ellipsis when `value` is too long.
fn truncate_start(value: &str, width: usize) -> (&'static str, &str) {
  match value.char_indices().nth_back(width - 1) {
    Some(_) => {
      let start = value
        .char_indices()
        .nth_back(width - 2)
        .map_or(0, |(i, _)| i);
      ("…", &value[start..])
    }
    None => ("", value),
  }
}

#[derive(Default)]
struct FieldWriter(String);

impl<'kvs> VisitSource<'kvs> for FieldWriter {
  fn visit_pair(&mut self, key: Key<'kvs>, value: Value<'kvs>) -> Result<(), log::kv::Error> {
    if key.as_str() != MODULE_KEY {
      let _ = write!(self.0, " {DIM}{key}={value}{RESET}");
    }
    Ok(())
  }
}
