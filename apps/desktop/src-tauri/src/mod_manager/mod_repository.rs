use crate::mod_manager::file_tree::ModFileTree;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Represents a single mod in the system
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Mod {
  pub id: String,
  pub name: String,
  #[serde(default)]
  pub installed_vpks: Vec<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub file_tree: Option<ModFileTree>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub install_order: Option<u32>,
  #[serde(default)]
  pub original_vpk_names: Vec<String>,
}

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

  /// Get all mods as an iterator
  pub fn get_all_mods(&self) -> impl Iterator<Item = &Mod> {
    self.mods.values()
  }
}

impl Default for ModRepository {
  fn default() -> Self {
    Self::new()
  }
}
