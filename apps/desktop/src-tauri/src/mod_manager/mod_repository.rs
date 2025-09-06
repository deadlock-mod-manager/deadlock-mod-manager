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

impl Mod {
    pub fn new(id: String, name: String, path: PathBuf) -> Self {
        Self {
            id,
            name,
            path,
            installed_vpks: Vec::new(),
            file_tree: None,
        }
    }

    pub fn with_vpks(mut self, vpks: Vec<String>) -> Self {
        self.installed_vpks = vpks;
        self
    }

    pub fn with_file_tree(mut self, file_tree: ModFileTree) -> Self {
        self.file_tree = Some(file_tree);
        self
    }

    pub fn is_installed(&self) -> bool {
        !self.installed_vpks.is_empty()
    }

    pub fn has_file_tree(&self) -> bool {
        self.file_tree.is_some()
    }
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

    /// Get a mutable reference to a mod by ID
    pub fn get_mod_mut(&mut self, mod_id: &str) -> Option<&mut Mod> {
        self.mods.get_mut(mod_id)
    }

    /// Check if a mod exists in the repository
    pub fn contains_mod(&self, mod_id: &str) -> bool {
        self.mods.contains_key(mod_id)
    }

    /// List all mod IDs
    pub fn list_mod_ids(&self) -> Vec<&String> {
        self.mods.keys().collect()
    }

    /// List all mods
    pub fn list_mods(&self) -> Vec<&Mod> {
        self.mods.values().collect()
    }

    /// List all mods as clones
    pub fn list_mods_cloned(&self) -> Vec<Mod> {
        self.mods.values().cloned().collect()
    }

    /// Get the number of mods in the repository
    pub fn count(&self) -> usize {
        self.mods.len()
    }

    /// Check if the repository is empty
    pub fn is_empty(&self) -> bool {
        self.mods.is_empty()
    }

    /// Update VPK list for a specific mod
    pub fn update_mod_vpks(&mut self, mod_id: &str, vpks: Vec<String>) -> Result<(), String> {
        if let Some(mod_entry) = self.mods.get_mut(mod_id) {
            mod_entry.installed_vpks = vpks;
            Ok(())
        } else {
            Err(format!("Mod with ID '{}' not found", mod_id))
        }
    }

    /// Update file tree for a specific mod
    pub fn update_mod_file_tree(
        &mut self,
        mod_id: &str,
        file_tree: ModFileTree,
    ) -> Result<(), String> {
        if let Some(mod_entry) = self.mods.get_mut(mod_id) {
            mod_entry.file_tree = Some(file_tree);
            Ok(())
        } else {
            Err(format!("Mod with ID '{}' not found", mod_id))
        }
    }

    /// Get all VPKs from all installed mods
    pub fn get_all_installed_vpks(&self) -> Vec<String> {
        self.mods
            .values()
            .flat_map(|mod_entry| &mod_entry.installed_vpks)
            .cloned()
            .collect()
    }

    /// Find mods that contain a specific VPK file
    pub fn find_mods_with_vpk(&self, vpk_name: &str) -> Vec<&Mod> {
        self.mods
            .values()
            .filter(|mod_entry| mod_entry.installed_vpks.contains(&vpk_name.to_string()))
            .collect()
    }

    /// Get installed mods (mods that have VPK files)
    pub fn get_installed_mods(&self) -> Vec<&Mod> {
        self.mods
            .values()
            .filter(|mod_entry| mod_entry.is_installed())
            .collect()
    }

    /// Get uninstalled mods (mods without VPK files)
    pub fn get_uninstalled_mods(&self) -> Vec<&Mod> {
        self.mods
            .values()
            .filter(|mod_entry| !mod_entry.is_installed())
            .collect()
    }

    /// Clear all mods from the repository
    pub fn clear(&mut self) {
        self.mods.clear();
    }

    /// Get statistics about the repository
    pub fn get_stats(&self) -> ModRepositoryStats {
        let total_mods = self.mods.len();
        let installed_mods = self.get_installed_mods().len();
        let total_vpks = self.get_all_installed_vpks().len();
        let mods_with_file_trees = self.mods.values().filter(|m| m.has_file_tree()).count();

        ModRepositoryStats {
            total_mods,
            installed_mods,
            uninstalled_mods: total_mods - installed_mods,
            total_vpks,
            mods_with_file_trees,
        }
    }

    /// Import mods from a HashMap (useful for loading from storage)
    pub fn import_mods(&mut self, mods: HashMap<String, Mod>) {
        self.mods = mods;
    }

    /// Export mods as HashMap (useful for saving to storage)
    pub fn export_mods(&self) -> &HashMap<String, Mod> {
        &self.mods
    }
}

/// Statistics about the mod repository
#[derive(Debug, Clone)]
pub struct ModRepositoryStats {
    pub total_mods: usize,
    pub installed_mods: usize,
    pub uninstalled_mods: usize,
    pub total_vpks: usize,
    pub mods_with_file_trees: usize,
}

impl Default for ModRepository {
    fn default() -> Self {
        Self::new()
    }
}
