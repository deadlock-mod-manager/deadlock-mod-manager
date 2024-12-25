use crate::errors::Error;
use keyvalues_serde;
use log;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::fs::File;
use std::path::PathBuf;
use sysinfo::System;
use tempfile;
use unrar::Archive;
use winreg::enums::*;
use winreg::RegKey;
use zip;

type LibraryFolders = HashMap<String, LibraryFolder>;

const DEADLOCK_PROCESS_NAME: &str = "project8.exe";
const DEADLOCK_APP_ID: &str = "1422450";
const MODDED_SEARCH_PATHS: &str = r#"
		SearchPaths
        {  
            Game                citadel/addons
            Mod                 citadel
            Write               citadel          
            Game                citadel
            Write               core
            Mod                 core
            Game                core        
        }
            "#;

const VANILLA_SEARCH_PATHS: &str = r#"
		SearchPaths
        {  
            Game                citadel
            Write               citadel          
            Game                citadel
            Write               core
            Game                core        
        }
            "#;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Mod {
    id: String,
    name: String,
    path: PathBuf,
    #[serde(default)]
    installed_vpks: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct LibraryFolder {
    path: String,
    label: String,
    contentid: String,
    totalsize: String,
    #[serde(rename = "update_clean_bytes_tally")]
    update_clean_bytes_tally: String,
    #[serde(rename = "time_last_update_verified")]
    time_last_update_verified: String,
    apps: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct AppManifest {
    name: String,
    installdir: String,
}

#[derive(Debug)]
pub struct ModManager {
    steam_path: Option<PathBuf>,
    game_path: Option<PathBuf>,
    game_setup: bool,
    mods: HashMap<String, Mod>,
    system: System,
}

impl ModManager {
    pub fn new() -> Self {
        ModManager {
            steam_path: None,
            game_path: None,
            game_setup: false,
            mods: HashMap::new(),
            system: System::new_all(),
        }
    }

    #[cfg(target_os = "windows")]
    pub fn find_steam(&mut self) -> Result<PathBuf, Error> {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let steam_key = hklm.open_subkey(r"SOFTWARE\WOW6432Node\Valve\Steam")?;
        let install_path: String = steam_key.get_value("InstallPath")?;
        let steam_path = PathBuf::from(install_path);

        log::info!("Steam path from registry: {:?}", steam_path);

        if steam_path.exists() {
            self.steam_path = Some(steam_path.clone());
            log::info!("Steam path found: {:?}", steam_path);
            Ok(steam_path)
        } else {
            let default_path = PathBuf::from(r"C:\Program Files (x86)\Steam");
            if default_path.exists() {
                self.steam_path = Some(default_path.clone());
                Ok(default_path)
            } else {
                Err(Error::SteamNotFound)
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn find_steam(&mut self) -> Result<PathBuf, Error> {
        Err(Error::GamePathNotSet)
    }

    pub fn find_game(&mut self) -> Result<PathBuf, Error> {
        self.find_steam()?;
        if let Some(steam_path) = &self.steam_path {
            let vdf_path = steam_path.join("steamapps").join("libraryfolders.vdf");
            let content = fs::read_to_string(&vdf_path)?;
            let lib_folders: LibraryFolders = keyvalues_serde::from_str(&content)?;

            // Check each library folder for Deadlock
            for (_key, folder) in lib_folders {
                if folder.apps.contains_key(DEADLOCK_APP_ID) {
                    // Found the library containing Deadlock
                    let library_path = PathBuf::from(folder.path);
                    let manifest_path = library_path
                        .join("steamapps")
                        .join(format!("appmanifest_{}.acf", DEADLOCK_APP_ID));

                    // Read the manifest to get the install directory name
                    let manifest_content = fs::read_to_string(manifest_path)?;
                    let app_manifest: AppManifest = keyvalues_serde::from_str(&manifest_content)?;

                    let game_path = library_path
                        .join("steamapps")
                        .join("common")
                        .join(app_manifest.installdir);

                    if game_path.exists() {
                        log::info!("Game path found: {:?}", game_path);
                        self.game_path = Some(game_path.clone());
                        return Ok(game_path);
                    }
                }
            }
        }

        Err(Error::GameNotFound)
    }

    pub fn check_if_game_running(&mut self) -> Result<(), Error> {
        self.system.refresh_all();
        let processes = self
            .system
            .processes_by_name(DEADLOCK_PROCESS_NAME.as_ref());
        if processes.count() > 0 {
            return Err(Error::GameRunning);
        }
        Ok(())
    }

    pub fn stop_game(&mut self) -> Result<(), Error> {
        self.system.refresh_all();
        let mut stopped = false;
        let processes = self
            .system
            .processes_by_name(DEADLOCK_PROCESS_NAME.as_ref());
        log::info!("Stopping game...");

        for process in processes {
            log::info!("Killing process: {:?}", process.pid());
            process.kill();
            stopped = true;
        }

        if !stopped {
            return Err(Error::GameNotRunning);
        }

        Ok(())
    }

    fn modify_search_paths(&self, gameinfo_path: &PathBuf, vanilla: bool) -> Result<(), Error> {
        log::info!(
            "Modifying search paths for gameinfo.gi: {:?}",
            gameinfo_path
        );

        // Read gameinfo.gi
        let gameinfo_content = fs::read_to_string(&gameinfo_path)?;

        // Backup gameinfo.gi to gameinfo.gi.bak
        let backup_path = gameinfo_path.with_extension("gi.bak");
        if !backup_path.exists() {
            fs::copy(&gameinfo_path, &backup_path)?;
        }

        // Find the SearchPaths section
        let search_paths_start = gameinfo_content
            .find("SearchPaths")
            .ok_or_else(|| Error::GameConfigParse("SearchPaths section not found".into()))?;
        let relative_end = gameinfo_content[search_paths_start..]
            .find("}")
            .ok_or_else(|| {
                Error::GameConfigParse("Could not find end of SearchPaths section".into())
            })?;

        let search_paths_end = search_paths_start + relative_end + 1;
        let search_paths_section = &gameinfo_content[search_paths_start - 1..search_paths_end];

        // Use the appropriate search paths based on vanilla flag
        let new_search_paths_section = if vanilla {
            VANILLA_SEARCH_PATHS
        } else {
            MODDED_SEARCH_PATHS
        };

        // Replace the old search paths section with the new one
        let gameinfo_content =
            gameinfo_content.replace(search_paths_section, new_search_paths_section);

        log::info!("Writing gameinfo.gi: {:?}", gameinfo_path);
        log::info!("> New search paths section: {:?}", new_search_paths_section);
        fs::write(gameinfo_path, gameinfo_content)?;

        Ok(())
    }

    pub fn setup_game_for_mods(&mut self) -> Result<(), Error> {
        self.check_if_game_running()?;

        if self.game_setup {
            log::info!("Game already setup");
            return Ok(());
        }

        if let Some(game_path) = &self.game_path {
            // mods path: game_path/game/citadel/addons/
            let mods_path = game_path.join("game").join("citadel").join("addons");
            if !mods_path.exists() {
                log::info!("Creating mods path: {:?}", mods_path);
                fs::create_dir_all(mods_path)?;
            }

            let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");
            self.modify_search_paths(&gameinfo_path, false)?;

            // Mark game as setup
            self.game_setup = true;

            Ok(())
        } else {
            Err(Error::GamePathNotSet)
        }
    }

    fn copy_vpks_from_temp(
        &self,
        temp_dir: &std::path::Path,
        mod_files_path: &std::path::Path,
    ) -> Result<Vec<String>, Error> {
        let mut installed_vpks = Vec::new();

        for entry in fs::read_dir(temp_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_dir() {
                let mut sub_vpks = self.copy_vpks_from_temp(&path, mod_files_path)?;
                installed_vpks.append(&mut sub_vpks);
            } else if path.extension().map_or(false, |ext| ext == "vpk") {
                let vpk_name = path.file_name().unwrap().to_string_lossy().to_string();
                fs::copy(&path, mod_files_path.join(&vpk_name))?;
                installed_vpks.push(vpk_name);
            }
        }
        Ok(installed_vpks)
    }

    fn extract_zip(&self, path: &PathBuf, temp_dir: &std::path::Path) -> Result<(), Error> {
        let zip_file = File::open(path)?;
        let mut archive = zip::ZipArchive::new(zip_file)?;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i)?;
            if !file.name().ends_with(".vpk") {
                // Still extract directories and non-VPK files to maintain structure
                let outpath = temp_dir.join(file.name());
                if let Some(p) = outpath.parent() {
                    fs::create_dir_all(p)?;
                }
                if !file.name().ends_with('/') {
                    let mut outfile = fs::File::create(&outpath)?;
                    std::io::copy(&mut file, &mut outfile)?;
                }
            } else {
                let outpath = temp_dir.join(file.name());
                if let Some(p) = outpath.parent() {
                    fs::create_dir_all(p)?;
                }
                let mut outfile = fs::File::create(&outpath)?;
                std::io::copy(&mut file, &mut outfile)?;
            }
        }
        Ok(())
    }

    fn extract_rar(&self, path: &PathBuf, temp_dir: &std::path::Path) -> Result<(), Error> {
        let mut archive = Archive::new(path.to_string_lossy().as_ref()).open_for_processing()?;

        while let Some(header) = archive.read_header()? {
            archive = if !header.entry().is_file() {
                header.skip()?
            } else {
                // Extract everything to maintain directory structure
                header.extract_with_base(&temp_dir)?
            };
        }
        Ok(())
    }

    pub fn install_mod(&mut self, mut deadlock_mod: Mod) -> Result<Mod, Error> {
        log::info!("Starting installation of mod: {}", deadlock_mod.name);

        if !deadlock_mod.path.exists() {
            return Err(Error::ModFileNotFound);
        }

        if !self.game_setup {
            log::info!("Setting up game for mods...");
            self.setup_game_for_mods()?;
        }

        if self.mods.contains_key(&deadlock_mod.id) {
            log::warn!("Mod {} already installed", deadlock_mod.name);
            return Err(Error::ModAlreadyInstalled(deadlock_mod.name));
        }

        if let Some(game_path) = &self.game_path {
            let mod_files_path = deadlock_mod.path.join("files");
            log::info!("Creating mod files directory at: {:?}", mod_files_path);
            fs::create_dir_all(&mod_files_path)?;

            let mut all_vpks = Vec::new();

            for entry in fs::read_dir(&deadlock_mod.path)? {
                let entry = entry?;
                let path = entry.path();

                let temp_dir = tempfile::tempdir()?;
                log::info!("Processing file: {:?}", path);

                match path.extension().and_then(|ext| ext.to_str()) {
                    Some("zip") => {
                        log::info!("Extracting ZIP file...");
                        self.extract_zip(&path, temp_dir.path())?
                    }
                    Some("rar") => {
                        log::info!("Extracting RAR file...");
                        self.extract_rar(&path, temp_dir.path())?
                    }
                    _ => continue,
                }

                log::info!("Copying VPK files to mod directory...");
                let mut vpks = self.copy_vpks_from_temp(temp_dir.path(), &mod_files_path)?;
                all_vpks.append(&mut vpks);
            }

            if all_vpks.is_empty() {
                log::error!("No VPK files found in mod");
                return Err(Error::ModInvalid("No VPK files found in mod".into()));
            }

            let addons_path = game_path.join("game").join("citadel").join("addons");
            log::info!("Installing VPK files to game addons: {:?}", addons_path);
            self.copy_vpks_from_temp(&mod_files_path, &addons_path)?;

            // Store the list of installed VPKs
            deadlock_mod.installed_vpks = all_vpks;

            log::info!("Adding mod to managed mods list");
            self.mods
                .insert(deadlock_mod.id.clone(), deadlock_mod.clone());

            log::info!("Mod installation completed successfully");
            Ok(deadlock_mod)
        } else {
            log::error!("Game path not set");
            Err(Error::GamePathNotSet)
        }
    }

    pub fn toggle_mods(&mut self, vanilla: bool) -> Result<(), Error> {
        if let Some(game_path) = &self.game_path {
            let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");
            self.modify_search_paths(&gameinfo_path, vanilla)?;
        } else {
            log::error!("Game path not set");
            return Err(Error::GamePathNotSet);
        }
        Ok(())
    }

    pub fn run_game(&mut self, vanilla: bool, additional_args: String) -> Result<(), Error> {
        self.find_game()?;

        if let Some(steam_path) = &self.steam_path {
            let steam_exe = steam_path.join("steam.exe");

            if !steam_exe.exists() {
                return Err(Error::SteamNotFound);
            }

            if vanilla {
                log::info!("Disabling mods...");
            } else {
                log::info!("Enabling mods...");
            }

            self.toggle_mods(vanilla)?;

            // Construct the full Steam URI
            let steam_uri = format!("steam://run/{}//{}", DEADLOCK_APP_ID, additional_args);
            log::info!("Launching game with URI: {}", steam_uri);

            std::process::Command::new(steam_exe)
                .arg(steam_uri)
                .spawn()
                .map_err(|e| Error::GameLaunchFailed(e.to_string()))?;

            Ok(())
        } else {
            Err(Error::SteamNotFound)
        }
    }
}
