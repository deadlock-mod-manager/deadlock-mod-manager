use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmpSystemInfo {
    pub os_name: String,
    pub os_version: String,
    pub cpu_arch: String,
    pub cpu_info: String,
    pub cpu_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmpExceptionInfo {
    pub exception_code: String,
    pub exception_address: String,
    pub thread_id: u32,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmpThreadInfo {
    pub thread_id: u32,
    pub stack_start: String,
    pub stack_end: String,
    pub is_crashing_thread: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmpModuleInfo {
    pub name: String,
    pub base_address: String,
    pub size: u64,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmpParsed {
    pub file_path: String,
    pub file_size: u64,
    /// When the dump was written.
    pub crash_time: Option<DateTime<Utc>>,
    pub process_create_time: Option<DateTime<Utc>>,
    pub crash_reason: String,
    pub system_info: Option<DmpSystemInfo>,
    pub exception_info: Option<DmpExceptionInfo>,
    pub threads: Vec<DmpThreadInfo>,
    pub modules: Vec<DmpModuleInfo>,
    pub raw_text: String,
}

/// The text Source 2 writes into the dump's comment stream: a crash kind line,
/// then `Key: value` and `Key( value )` lines.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DmpComment {
    /// First line, e.g. `Crash` or `error`.
    pub kind: Option<String>,
    pub abort_message: Option<String>,
    /// Engine uptime when the dump was written.
    pub uptime_secs: Option<f64>,
    /// Source 2 addons from the `Addons:` line. These are server/workshop
    /// addons, not the VPKs gameinfo.gi mounts from `citadel/addons`, so an
    /// empty list does not mean mods weren't loaded. `None` when the line is
    /// missing.
    pub addons: Option<Vec<String>>,
    pub command_line: Option<String>,
    pub build: Option<String>,
}

/// What crash detection needs from a dump, without walking threads or modules.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmpSummary {
    /// When the dump was written (header timestamp).
    pub dump_time: Option<DateTime<Utc>>,
    pub process_id: Option<u32>,
    pub process_create_time: Option<DateTime<Utc>>,
    pub exception_code: Option<u32>,
    pub comment: Option<DmpComment>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DmpParseOptions {
    pub include_modules: bool,
    pub include_threads: bool,
    pub max_modules: Option<usize>,
}
