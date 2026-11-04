mod state;
#[cfg(test)]
mod tests;
mod workflow;

use dmm_plugin_sdk::{Host, PluginError, Value, codes, export_plugin};

pub fn handle(command: &str, payload: Value, host: &mut impl Host) -> Result<Value, PluginError> {
  match command {
    "tick" => workflow::tick(host),
    "status" => workflow::status(host),
    "deploy" => workflow::deploy(host, payload),
    "configure" => workflow::configure(host, payload),
    "setUiState" => workflow::set_ui_state(host, payload),
    other => Err(PluginError::new(
      codes::UNKNOWN_COMMAND,
      format!("Unknown command {other}"),
    )),
  }
}

export_plugin!(handle);
