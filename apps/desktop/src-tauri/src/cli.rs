use clap::Parser;
use std::sync::LazyLock;

#[derive(Parser, Debug, Clone)]
#[command(name = "deadlock-mod-manager")]
#[command(about = "A tool for managing Deadlock game modifications")]
#[command(version)]
pub struct CliArgs {
  /// Disable automatic updates
  #[arg(long, help = "Disable automatic updates on startup")]
  pub disable_auto_update: bool,

  /// Enable Linux GPU optimizations
  #[arg(long, help = "Enable Linux GPU optimizations (fixes rendering issues on some hardware)")]
  pub linux_gpu_fix: bool,

  /// Deep link URL or other trailing arguments (passed by Windows when opening via protocol handler)
  #[arg(trailing_var_arg = true, allow_hyphen_values = true, hide = true)]
  pub _trailing: Vec<String>,
}

/// Global CLI arguments instance
static CLI_ARGS: LazyLock<CliArgs> = LazyLock::new(CliArgs::parse);

/// Get the parsed CLI arguments
pub fn get_cli_args() -> &'static CliArgs {
  &CLI_ARGS
}
