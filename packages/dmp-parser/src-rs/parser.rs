use crate::error::{DmpError, Result};
use crate::types::{
  DmpExceptionInfo, DmpModuleInfo, DmpParseOptions, DmpParsed, DmpSystemInfo, DmpThreadInfo,
};
use chrono::{DateTime, Utc};
use minidump::{Minidump, MinidumpModuleList, MinidumpSystemInfo, MinidumpThreadList, Module};
use std::path::Path;

pub struct DmpParser;

impl DmpParser {
  pub fn parse_file<P: AsRef<Path>>(path: P, options: DmpParseOptions) -> Result<DmpParsed> {
    let path = path.as_ref();

    if !path.exists() {
      return Err(DmpError::FileNotFound(path.display().to_string()));
    }

    let file_size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);

    let dump = Minidump::read_path(path)
      .map_err(|e| DmpError::ParseError(format!("Failed to read minidump: {e}")))?;

    Self::parse_minidump(&dump, path.display().to_string(), file_size, options)
  }

  fn parse_minidump<'a, T: std::ops::Deref<Target = [u8]> + 'a>(
    dump: &Minidump<'a, T>,
    file_path: String,
    file_size: u64,
    options: DmpParseOptions,
  ) -> Result<DmpParsed> {
    let mut raw_text = String::new();
    raw_text.push_str("=== MINIDUMP ANALYSIS ===\n");
    raw_text.push_str(&format!("File: {file_path}\n"));
    raw_text.push_str(&format!("Size: {} bytes\n\n", file_size));

    let system_info = Self::extract_system_info(dump, &mut raw_text);
    let exception_info = Self::extract_exception_info(dump, &mut raw_text);
    let crash_time = Self::extract_crash_time(dump);

    let threads = if options.include_threads {
      Self::extract_threads(dump, &exception_info, &mut raw_text)
    } else {
      Vec::new()
    };

    let modules = if options.include_modules {
      Self::extract_modules(dump, options.max_modules, &mut raw_text)
    } else {
      Vec::new()
    };

    let crash_reason = exception_info
      .as_ref()
      .map(|e| e.description.clone())
      .unwrap_or_else(|| "Unknown crash reason".to_string());

    Ok(DmpParsed {
      file_path,
      file_size,
      crash_time,
      crash_reason,
      system_info,
      exception_info,
      threads,
      modules,
      raw_text,
    })
  }

  fn extract_system_info<'a, T: std::ops::Deref<Target = [u8]> + 'a>(
    dump: &Minidump<'a, T>,
    raw_text: &mut String,
  ) -> Option<DmpSystemInfo> {
    let sys_info: MinidumpSystemInfo = dump.get_stream().ok()?;

    let os_name = format!("{:?}", sys_info.os);
    let os_version = sys_info
      .csd_version()
      .map(|s| s.to_string())
      .unwrap_or_else(|| "Unknown".to_string());
    let cpu_arch = format!("{:?}", sys_info.cpu);
    let cpu_info = sys_info
      .cpu_info()
      .map(|s| s.to_string())
      .unwrap_or_else(|| "Unknown".to_string());
    let cpu_count = sys_info.raw.number_of_processors.into();

    raw_text.push_str("=== SYSTEM INFO ===\n");
    raw_text.push_str(&format!("OS: {os_name} {os_version}\n"));
    raw_text.push_str(&format!("CPU: {cpu_arch} ({cpu_info})\n"));
    raw_text.push_str(&format!("CPU Count: {cpu_count}\n\n"));

    Some(DmpSystemInfo {
      os_name,
      os_version,
      cpu_arch,
      cpu_info,
      cpu_count,
    })
  }

  fn extract_exception_info<'a, T: std::ops::Deref<Target = [u8]> + 'a>(
    dump: &Minidump<'a, T>,
    raw_text: &mut String,
  ) -> Option<DmpExceptionInfo> {
    let exception: minidump::MinidumpException = dump.get_stream().ok()?;

    let raw = exception.raw;
    let exception_code = format!("0x{:08X}", raw.exception_record.exception_code);
    let exception_address = format!("0x{:016X}", raw.exception_record.exception_address);
    let thread_id = raw.thread_id;

    let description = Self::get_exception_description(raw.exception_record.exception_code);

    raw_text.push_str("=== EXCEPTION INFO ===\n");
    raw_text.push_str(&format!("Exception Code: {exception_code}\n"));
    raw_text.push_str(&format!("Exception Address: {exception_address}\n"));
    raw_text.push_str(&format!("Thread ID: {thread_id}\n"));
    raw_text.push_str(&format!("Description: {description}\n\n"));

    Some(DmpExceptionInfo {
      exception_code,
      exception_address,
      thread_id,
      description,
    })
  }

  fn extract_crash_time<'a, T: std::ops::Deref<Target = [u8]> + 'a>(
    dump: &Minidump<'a, T>,
  ) -> Option<DateTime<Utc>> {
    let misc_info: minidump::MinidumpMiscInfo = dump.get_stream().ok()?;

    misc_info
      .raw
      .process_create_time()
      .and_then(|t| DateTime::from_timestamp(i64::from(*t), 0))
  }

  fn extract_threads<'a, T: std::ops::Deref<Target = [u8]> + 'a>(
    dump: &Minidump<'a, T>,
    exception_info: &Option<DmpExceptionInfo>,
    raw_text: &mut String,
  ) -> Vec<DmpThreadInfo> {
    let thread_list: MinidumpThreadList = match dump.get_stream() {
      Ok(t) => t,
      Err(_) => return Vec::new(),
    };

    let crashing_thread_id = exception_info.as_ref().map(|e| e.thread_id);

    raw_text.push_str("=== THREADS ===\n");

    let threads: Vec<DmpThreadInfo> = thread_list
      .threads
      .iter()
      .map(|thread| {
        let thread_id = thread.raw.thread_id;
        let is_crashing = crashing_thread_id == Some(thread_id);
        let stack = &thread.raw.stack;

        let info = DmpThreadInfo {
          thread_id,
          stack_start: format!("0x{:016X}", stack.start_of_memory_range),
          stack_end: format!(
            "0x{:016X}",
            stack.start_of_memory_range + u64::from(stack.memory.data_size)
          ),
          is_crashing_thread: is_crashing,
        };

        raw_text.push_str(&format!(
          "Thread {}{}: Stack 0x{:016X} - 0x{:016X}\n",
          thread_id,
          if is_crashing { " [CRASHED]" } else { "" },
          stack.start_of_memory_range,
          stack.start_of_memory_range + u64::from(stack.memory.data_size)
        ));

        info
      })
      .collect();

    raw_text.push('\n');
    threads
  }

  fn extract_modules<'a, T: std::ops::Deref<Target = [u8]> + 'a>(
    dump: &Minidump<'a, T>,
    max_modules: Option<usize>,
    raw_text: &mut String,
  ) -> Vec<DmpModuleInfo> {
    let module_list: MinidumpModuleList = match dump.get_stream() {
      Ok(m) => m,
      Err(_) => return Vec::new(),
    };

    raw_text.push_str("=== LOADED MODULES ===\n");

    let modules: Vec<DmpModuleInfo> = module_list
      .iter()
      .take(max_modules.unwrap_or(usize::MAX))
      .map(|module| {
        let name = module
          .name
          .rsplit(['/', '\\'])
          .next()
          .unwrap_or(&module.name)
          .to_string();
        let base_address = format!("0x{:016X}", module.base_address());
        let size = module.size();
        let version = module.version().map(|v| v.to_string());

        raw_text.push_str(&format!("{}: {} ({} bytes)\n", name, base_address, size));

        DmpModuleInfo {
          name,
          base_address,
          size,
          version,
        }
      })
      .collect();

    raw_text.push('\n');
    modules
  }

  fn get_exception_description(code: u32) -> String {
    match code {
      0xC0000005 => "Access Violation (EXCEPTION_ACCESS_VIOLATION)".to_string(),
      0xC0000006 => "In Page Error (EXCEPTION_IN_PAGE_ERROR)".to_string(),
      0xC0000008 => "Invalid Handle (EXCEPTION_INVALID_HANDLE)".to_string(),
      0xC000001D => "Illegal Instruction (EXCEPTION_ILLEGAL_INSTRUCTION)".to_string(),
      0xC0000025 => "Non-Continuable Exception (EXCEPTION_NONCONTINUABLE_EXCEPTION)".to_string(),
      0xC0000026 => "Invalid Disposition (EXCEPTION_INVALID_DISPOSITION)".to_string(),
      0xC000008C => "Array Bounds Exceeded (EXCEPTION_ARRAY_BOUNDS_EXCEEDED)".to_string(),
      0xC000008D => "Float Denormal Operand (EXCEPTION_FLT_DENORMAL_OPERAND)".to_string(),
      0xC000008E => "Float Divide by Zero (EXCEPTION_FLT_DIVIDE_BY_ZERO)".to_string(),
      0xC000008F => "Float Inexact Result (EXCEPTION_FLT_INEXACT_RESULT)".to_string(),
      0xC0000090 => "Float Invalid Operation (EXCEPTION_FLT_INVALID_OPERATION)".to_string(),
      0xC0000091 => "Float Overflow (EXCEPTION_FLT_OVERFLOW)".to_string(),
      0xC0000092 => "Float Stack Check (EXCEPTION_FLT_STACK_CHECK)".to_string(),
      0xC0000093 => "Float Underflow (EXCEPTION_FLT_UNDERFLOW)".to_string(),
      0xC0000094 => "Integer Divide by Zero (EXCEPTION_INT_DIVIDE_BY_ZERO)".to_string(),
      0xC0000095 => "Integer Overflow (EXCEPTION_INT_OVERFLOW)".to_string(),
      0xC0000096 => "Privileged Instruction (EXCEPTION_PRIV_INSTRUCTION)".to_string(),
      0xC00000FD => "Stack Overflow (EXCEPTION_STACK_OVERFLOW)".to_string(),
      0xC0000135 => "DLL Not Found (STATUS_DLL_NOT_FOUND)".to_string(),
      0xC0000142 => "DLL Init Failed (STATUS_DLL_INIT_FAILED)".to_string(),
      0x80000001 => "Guard Page Violation (STATUS_GUARD_PAGE_VIOLATION)".to_string(),
      0x80000003 => "Breakpoint (EXCEPTION_BREAKPOINT)".to_string(),
      0x80000004 => "Single Step (EXCEPTION_SINGLE_STEP)".to_string(),
      _ => format!("Unknown Exception (0x{code:08X})"),
    }
  }
}
