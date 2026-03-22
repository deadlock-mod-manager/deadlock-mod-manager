use dmp_parser::{DmpParseOptions, DmpParser};
use std::env;
use std::process::ExitCode;

fn main() -> ExitCode {
  let args: Vec<String> = env::args().collect();

  if args.len() < 2 {
    eprintln!("Usage: dmp-parser-cli <path-to-dmp-file> [--json]");
    eprintln!("  --json    Output as JSON instead of human-readable text");
    return ExitCode::from(1);
  }

  let file_path = &args[1];
  let json_output = args.iter().any(|arg| arg == "--json");

  let options = DmpParseOptions {
    include_modules: true,
    include_threads: true,
    max_modules: Some(50),
  };

  match DmpParser::parse_file(file_path, options) {
    Ok(parsed) => {
      if json_output {
        match serde_json::to_string_pretty(&parsed) {
          Ok(json) => println!("{json}"),
          Err(e) => {
            eprintln!("Error serializing to JSON: {e}");
            return ExitCode::from(1);
          }
        }
      } else {
        println!("{}", parsed.raw_text);
      }
      ExitCode::SUCCESS
    }
    Err(e) => {
      eprintln!("Error parsing minidump: {e}");
      ExitCode::from(1)
    }
  }
}
