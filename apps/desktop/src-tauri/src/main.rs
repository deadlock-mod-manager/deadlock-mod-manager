// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  desktop_lib::cli::get_cli_args();
  desktop_lib::run()
}
