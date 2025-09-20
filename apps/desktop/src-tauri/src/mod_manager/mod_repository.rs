use crate::mod_manager::file_tree::ModFileTree;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Represents a single mod in the system
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Mod {
  pub id: String,
  pub name: String,
  pub path: PathBuf,
  #[serde(default)]
  pub installed_vpks: Vec<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub file_tree: Option<ModFileTree>,
}

impl Mod {}

/// Manages the repository of installed and tracked mods
pub struct ModRepository {
  mods: HashMap<String, Mod>,
}

impl ModRepository {
  pub fn new() -> Self {
    Self {
      mods: HashMap::new(),
    }
  }

  /// Add a mod to the repository
  pub fn add_mod(&mut self, mod_entry: Mod) -> Option<Mod> {
    self.mods.insert(mod_entry.id.clone(), mod_entry)
  }

  /// Remove a mod from the repository
  pub fn remove_mod(&mut self, mod_id: &str) -> Option<Mod> {
    self.mods.remove(mod_id)
  }

  /// Get a mod by ID
  pub fn get_mod(&self, mod_id: &str) -> Option<&Mod> {
    self.mods.get(mod_id)
  }
}


impl Default for ModRepository {
  fn default() -> Self {
    Self::new()
  }
}
