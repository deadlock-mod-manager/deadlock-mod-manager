use crate::errors::Error;
use crate::mod_manager::filesystem_helper::FileSystemHelper;
use chrono;
use log;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Manages mods using the addons folder approach with subdirectories
pub struct AddonsManager {
    filesystem: FileSystemHelper,
}

/// Represents an active mod entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveMod {
    pub id: String,
    pub name: String,
    pub vpks: Vec<String>,
    pub folder_name: String,
}

/// Represents the active mods manifest
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveModsManifest {
    pub active_mods: Vec<ActiveMod>,
    pub last_updated: String,
}

/// Represents a mod in the catalog
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModCatalogEntry {
    pub id: String,
    pub name: String,
    pub folder_name: String,
    pub vpks: Vec<String>,
    pub installed_at: String,
    pub enabled: bool,
}

/// Represents the mods catalog
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModsCatalog {
    pub mods: HashMap<String, ModCatalogEntry>,
    pub last_updated: String,
}

impl AddonsManager {
    pub fn new() -> Self {
        Self {
            filesystem: FileSystemHelper::new(),
        }
    }

    /// Get the addons directory path
    pub fn get_addons_path(&self, game_path: &Path) -> PathBuf {
        game_path.join("game").join("citadel").join("addons")
    }

    /// Sanitize mod name for folder/file naming
    fn sanitize_name(&self, name: &str) -> String {
        // Replace invalid characters with underscores
        let sanitized = name
            .chars()
            .map(|c| if c.is_alphanumeric() || c == ' ' { c } else { '_' })
            .collect::<String>();
        
        // Replace multiple spaces with single underscore
        let sanitized = Regex::new(r"\s+").unwrap()
            .replace_all(&sanitized, "_");
        
        // Remove leading/trailing underscores
        sanitized.trim_matches('_').to_string()
    }

    /// Get the next available VPK number for a mod
    fn get_next_vpk_number(&self, addons_path: &Path, mod_name: &str) -> Result<u32, Error> {
        let sanitized_name = self.sanitize_name(mod_name);
        let mod_folder = addons_path.join(&sanitized_name);
        let mut highest = 0;

        // Check for active mods in the mod subfolder
        if mod_folder.exists() {
            let vpk_pattern = Regex::new(r"pak(\d+)_dir\.vpk").unwrap();
            
            for entry in fs::read_dir(&mod_folder)? {
                let entry = entry?;
                let path = entry.path();
                
                if path.is_file() && path.extension().map_or(false, |ext| ext == "vpk") {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if let Some(captures) = vpk_pattern.captures(name) {
                            if let Ok(num) = captures[1].parse::<u32>() {
                                highest = highest.max(num);
                            }
                        }
                    }
                }
            }
        }

        // Also check for disabled mods in root addons folder
        let disabled_pattern = Regex::new(&format!(r"_{}_pak(\d+)_dir\.vpk", regex::escape(&sanitized_name))).unwrap();
        
        for entry in fs::read_dir(addons_path)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_file() && path.extension().map_or(false, |ext| ext == "vpk") {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if let Some(captures) = disabled_pattern.captures(name) {
                        if let Ok(num) = captures[1].parse::<u32>() {
                            highest = highest.max(num);
                        }
                    }
                }
            }
        }

        // Return the next available number (highest + 1)
        Ok(highest + 1)
    }

    /// Install a mod to the addons folder (initially disabled)
    pub fn install_mod(
        &self,
        mod_id: &str,
        mod_name: &str,
        vpk_paths: &[PathBuf],
        game_path: &Path,
    ) -> Result<Vec<String>, Error> {
        let addons_path = self.get_addons_path(game_path);
        self.filesystem.create_directories(&addons_path)?;

        let sanitized_name = self.sanitize_name(mod_name);
        let mut installed_vpks = Vec::new();
        let mut current_number = self.get_next_vpk_number(&addons_path, mod_name)?;

        // Install VPKs as disabled mods (with _ prefix)
        for vpk_path in vpk_paths {
            let disabled_name = format!("_{}_pak{:02}_dir.vpk", sanitized_name, current_number);
            let disabled_path = addons_path.join(&disabled_name);

            self.filesystem.copy_file(vpk_path, &disabled_path)?;
            installed_vpks.push(disabled_name.clone());

            log::info!("Installed disabled VPK: {} as {} (pak{:02})", vpk_path.display(), disabled_name, current_number);
            current_number += 1;
        }

        // Update mods catalog
        self.update_mods_catalog(mod_id, mod_name, &installed_vpks, &addons_path, false)?;

        Ok(installed_vpks)
    }

    /// Activate a mod (move from disabled to active subfolder)
    pub fn activate_mod(
        &self,
        mod_id: &str,
        mod_name: &str,
        vpk_names: &[String],
        game_path: &Path,
    ) -> Result<(), Error> {
        let addons_path = self.get_addons_path(game_path);
        let sanitized_name = self.sanitize_name(mod_name);
        let mod_folder = addons_path.join(&sanitized_name);

        // Create mod subfolder
        self.filesystem.create_directories(&mod_folder)?;

        // Move VPKs from disabled to active
        for vpk_name in vpk_names {
            let disabled_path = addons_path.join(vpk_name);
            let clean_name = vpk_name.replace(&format!("_{}_", sanitized_name), "");
            let active_path = mod_folder.join(&clean_name);

            if disabled_path.exists() {
                self.filesystem.move_file(&disabled_path, &active_path)?;
                log::info!("Activated VPK: {} -> {}", vpk_name, clean_name);
            }
        }

        // Update manifests
        self.update_active_mods_manifest(mod_id, mod_name, vpk_names, &addons_path)?;
        self.update_mods_catalog(mod_id, mod_name, vpk_names, &addons_path, true)?;
        self.update_gameinfo_gi(game_path)?;

        Ok(())
    }

    /// Deactivate a mod (move from active subfolder to disabled)
    pub fn deactivate_mod(
        &self,
        mod_id: &str,
        mod_name: &str,
        vpk_names: &[String],
        game_path: &Path,
    ) -> Result<(), Error> {
        let addons_path = self.get_addons_path(game_path);
        let sanitized_name = self.sanitize_name(mod_name);
        let mod_folder = addons_path.join(&sanitized_name);

        // Move VPKs from active to disabled
        for vpk_name in vpk_names {
            let clean_name = vpk_name.replace(&format!("_{}_", sanitized_name), "");
            let active_path = mod_folder.join(&clean_name);
            let disabled_name = format!("_{}_{}", sanitized_name, clean_name);
            let disabled_path = addons_path.join(&disabled_name);

            if active_path.exists() {
                self.filesystem.move_file(&active_path, &disabled_path)?;
                log::info!("Deactivated VPK: {} -> {}", clean_name, disabled_name);
            }
        }

        // Remove empty mod folder
        if mod_folder.exists() && fs::read_dir(&mod_folder)?.next().is_none() {
            self.filesystem.remove_directory(&mod_folder)?;
        }

        // Update manifests
        self.remove_from_active_mods_manifest(mod_id, &addons_path)?;
        self.update_mods_catalog(mod_id, mod_name, vpk_names, &addons_path, false)?;
        self.update_gameinfo_gi(game_path)?;

        Ok(())
    }

    /// Remove a mod completely
    pub fn remove_mod(
        &self,
        mod_id: &str,
        mod_name: &str,
        vpk_names: &[String],
        game_path: &Path,
    ) -> Result<(), Error> {
        let addons_path = self.get_addons_path(game_path);
        let sanitized_name = self.sanitize_name(mod_name);

        // Remove all VPK files (both active and disabled)
        for vpk_name in vpk_names {
            let vpk_path = addons_path.join(vpk_name);
            if vpk_path.exists() {
                self.filesystem.remove_file(&vpk_path)?;
                log::info!("Removed VPK: {}", vpk_name);
            }
        }

        // Remove mod subfolder if it exists
        let mod_folder = addons_path.join(&sanitized_name);
        if mod_folder.exists() {
            self.filesystem.remove_directory(&mod_folder)?;
        }

        // Update manifests
        self.remove_from_active_mods_manifest(mod_id, &addons_path)?;
        self.remove_from_mods_catalog(mod_id, &addons_path)?;
        self.update_gameinfo_gi(game_path)?;

        Ok(())
    }

    /// Update the active mods manifest
    fn update_active_mods_manifest(
        &self,
        mod_id: &str,
        mod_name: &str,
        vpk_names: &[String],
        addons_path: &Path,
    ) -> Result<(), Error> {
        let manifest_path = addons_path.join("active_mods.json");
        let mut manifest = if manifest_path.exists() {
            let content = fs::read_to_string(&manifest_path)?;
            serde_json::from_str::<ActiveModsManifest>(&content).unwrap_or_else(|_| ActiveModsManifest {
                active_mods: Vec::new(),
                last_updated: chrono::Utc::now().to_rfc3339(),
            })
        } else {
            ActiveModsManifest {
                active_mods: Vec::new(),
                last_updated: chrono::Utc::now().to_rfc3339(),
            }
        };

        // Remove existing entry if it exists
        manifest.active_mods.retain(|m| m.id != mod_id);

        // Add new entry
        let clean_vpks: Vec<String> = vpk_names
            .iter()
            .map(|name| name.replace(&format!("_{}_", self.sanitize_name(mod_name)), ""))
            .collect();

        manifest.active_mods.push(ActiveMod {
            id: mod_id.to_string(),
            name: mod_name.to_string(),
            vpks: clean_vpks,
            folder_name: self.sanitize_name(mod_name),
        });

        manifest.last_updated = chrono::Utc::now().to_rfc3339();

        let content = serde_json::to_string_pretty(&manifest)?;
        fs::write(&manifest_path, content)?;

        Ok(())
    }

    /// Remove mod from active mods manifest
    fn remove_from_active_mods_manifest(&self, mod_id: &str, addons_path: &Path) -> Result<(), Error> {
        let manifest_path = addons_path.join("active_mods.json");
        if !manifest_path.exists() {
            return Ok(());
        }

        let content = fs::read_to_string(&manifest_path)?;
        let mut manifest = serde_json::from_str::<ActiveModsManifest>(&content)?;

        manifest.active_mods.retain(|m| m.id != mod_id);
        manifest.last_updated = chrono::Utc::now().to_rfc3339();

        let content = serde_json::to_string_pretty(&manifest)?;
        fs::write(&manifest_path, content)?;

        Ok(())
    }

    /// Update the mods catalog
    fn update_mods_catalog(
        &self,
        mod_id: &str,
        mod_name: &str,
        vpk_names: &[String],
        addons_path: &Path,
        enabled: bool,
    ) -> Result<(), Error> {
        let catalog_path = addons_path.join("mods_catalog.json");
        let mut catalog = if catalog_path.exists() {
            let content = fs::read_to_string(&catalog_path)?;
            serde_json::from_str::<ModsCatalog>(&content).unwrap_or_else(|_| ModsCatalog {
                mods: HashMap::new(),
                last_updated: chrono::Utc::now().to_rfc3339(),
            })
        } else {
            ModsCatalog {
                mods: HashMap::new(),
                last_updated: chrono::Utc::now().to_rfc3339(),
            }
        };

        catalog.mods.insert(mod_id.to_string(), ModCatalogEntry {
            id: mod_id.to_string(),
            name: mod_name.to_string(),
            folder_name: self.sanitize_name(mod_name),
            vpks: vpk_names.to_vec(),
            installed_at: chrono::Utc::now().to_rfc3339(),
            enabled,
        });

        catalog.last_updated = chrono::Utc::now().to_rfc3339();

        let content = serde_json::to_string_pretty(&catalog)?;
        fs::write(&catalog_path, content)?;

        Ok(())
    }

    /// Remove mod from mods catalog
    fn remove_from_mods_catalog(&self, mod_id: &str, addons_path: &Path) -> Result<(), Error> {
        let catalog_path = addons_path.join("mods_catalog.json");
        if !catalog_path.exists() {
            return Ok(());
        }

        let content = fs::read_to_string(&catalog_path)?;
        let mut catalog = serde_json::from_str::<ModsCatalog>(&content)?;

        catalog.mods.remove(mod_id);
        catalog.last_updated = chrono::Utc::now().to_rfc3339();

        let content = serde_json::to_string_pretty(&catalog)?;
        fs::write(&catalog_path, content)?;

        Ok(())
    }

    /// Update gameinfo.gi with active mod search paths
    fn update_gameinfo_gi(&self, game_path: &Path) -> Result<(), Error> {
        let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");
        if !gameinfo_path.exists() {
            log::warn!("gameinfo.gi not found at: {:?}", gameinfo_path);
            return Ok(());
        }

        // Read current gameinfo.gi
        let content = fs::read_to_string(&gameinfo_path)?;
        
        // Read active mods manifest
        let addons_path = self.get_addons_path(game_path);
        let manifest_path = addons_path.join("active_mods.json");
        let active_mods = if manifest_path.exists() {
            let manifest_content = fs::read_to_string(&manifest_path)?;
            let manifest: ActiveModsManifest = serde_json::from_str(&manifest_content)?;
            manifest.active_mods
        } else {
            Vec::new()
        };

        // Generate new search paths
        let mut search_paths = Vec::new();
        
        // Add active mod paths
        for active_mod in &active_mods {
            search_paths.push(format!("    Game    citadel/addons/{}", active_mod.folder_name));
        }
        
        // Add base addons path
        search_paths.push("    Game    citadel/addons".to_string());
        search_paths.push("    Game    citadel/maps".to_string());

        // Update gameinfo.gi content
        let updated_content = self.update_gameinfo_search_paths(&content, &search_paths)?;
        
        // Write back to file
        fs::write(&gameinfo_path, updated_content)?;
        
        log::info!("Updated gameinfo.gi with {} active mod search paths", active_mods.len());
        Ok(())
    }

    /// Update search paths in gameinfo.gi content
    fn update_gameinfo_search_paths(&self, content: &str, search_paths: &[String]) -> Result<String, Error> {
        let search_paths_section = format!("SearchPaths\n{{\n{}\n}}", search_paths.join("\n"));
        
        // Find and replace the SearchPaths section
        let pattern = Regex::new(r"SearchPaths\s*\{[^}]*\}").unwrap();
        let updated_content = if pattern.is_match(content) {
            pattern.replace(content, &search_paths_section).to_string()
        } else {
            // If no SearchPaths section found, add it after the first {
            let first_brace = content.find('{').ok_or_else(|| Error::InvalidGameInfo)?;
            let mut result = content.to_string();
            result.insert_str(first_brace + 1, &format!("\n{}\n", search_paths_section));
            result
        };

        Ok(updated_content)
    }

    /// Get all installed mods (both active and disabled)
    pub fn get_installed_mods(&self, game_path: &Path) -> Result<Vec<ModCatalogEntry>, Error> {
        let addons_path = self.get_addons_path(game_path);
        let catalog_path = addons_path.join("mods_catalog.json");
        
        if !catalog_path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&catalog_path)?;
        let catalog: ModsCatalog = serde_json::from_str(&content)?;
        
        Ok(catalog.mods.values().cloned().collect())
    }

    /// Get active mods
    pub fn get_active_mods(&self, game_path: &Path) -> Result<Vec<ActiveMod>, Error> {
        let addons_path = self.get_addons_path(game_path);
        let manifest_path = addons_path.join("active_mods.json");
        
        if !manifest_path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&manifest_path)?;
        let manifest: ActiveModsManifest = serde_json::from_str(&content)?;
        
        Ok(manifest.active_mods)
    }
}

impl Default for AddonsManager {
    fn default() -> Self {
        Self::new()
    }
}