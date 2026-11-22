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
    pub faulting_module: Option<String>,
    pub access: Option<String>,
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
    pub crash_time: Option<DateTime<Utc>>,
    pub process_create_time: Option<DateTime<Utc>>,
    pub crash_reason: String,
    pub system_info: Option<DmpSystemInfo>,
    pub exception_info: Option<DmpExceptionInfo>,
    pub threads: Vec<DmpThreadInfo>,
    pub modules: Vec<DmpModuleInfo>,
    pub raw_text: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DmpComment {
    pub kind: Option<String>,
    pub abort_message: Option<String>,
    pub uptime_secs: Option<f64>,
    pub addons: Option<Vec<String>>,
    pub command_line: Option<String>,
    pub build: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmpSummary {
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
