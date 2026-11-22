use clap::Parser;
use std::sync::LazyLock;

#[derive(Parser, Debug, Clone)]
#[command(name = "deadlock-mod-manager")]
#[command(about = "A tool for managing Deadlock game modifications")]
#[command(version)]
// Packagers add flags in launch wrappers (Nix adds --disable-auto-update), so
// a flag the user passes again must not abort startup.
#[command(args_override_self = true)]
pub struct CliArgs {
  /// Disable automatic updates
  #[arg(long, help = "Disable automatic updates on startup")]
  pub disable_auto_update: bool,

  /// Disable Linux GPU optimizations (enabled by default on Linux)
  #[arg(
    long,
    help = "Disable Linux GPU optimizations (enabled by default on Linux)"
  )]
  pub disable_linux_gpu_optimization: bool,

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

#[cfg(test)]
mod tests {
  use super::CliArgs;
  use clap::Parser;

  #[test]
  fn repeated_flags_do_not_abort_startup() {
    let args = CliArgs::try_parse_from([
      "deadlock-mod-manager",
      "--disable-auto-update",
      "--disable-auto-update",
      "deadlock-mod-manager://mod/1",
    ])
    .expect("a flag repeated by a launch wrapper must parse");

    assert!(args.disable_auto_update);
    assert_eq!(args._trailing, ["deadlock-mod-manager://mod/1"]);
  }
}
