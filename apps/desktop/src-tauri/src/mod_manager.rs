use crate::errors::Error;
use crate::utils;
use log;
use regex;
use serde::{Deserialize, Serialize};
use sevenz_rust;
use std::collections::HashMap;
use std::fs;
use std::fs::File;
use std::path::PathBuf;
use sysinfo::ProcessRefreshKind;
use sysinfo::ProcessesToUpdate;
use sysinfo::System;
use tempfile;
use unrar::Archive;
use zip;

const DEADLOCK_PROCESS_NAME: &str = "project8.exe";
const DEADLOCK_APP_ID: u32 = 1422450;
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

#[derive(Debug)]
pub struct ModManager {
    steam_dir: Option<steamlocate::SteamDir>,
    game_path: Option<PathBuf>,
    game_setup: bool,
    mods: HashMap<String, Mod>,
    system: System,
}

impl ModManager {
    pub fn new() -> Self {
        let mut manager = ModManager {
            steam_dir: None,
            game_path: None,
            game_setup: false,
            mods: HashMap::new(),
            system: System::new_all(),
        };

        // Try to find the game path on initialization
        if let Err(e) = manager.find_game() {
            log::warn!("Failed to find game path during initialization: {:?}", e);
        }

        manager
    }

    pub fn find_steam(&mut self) -> Result<steamlocate::SteamDir, Error> {
        let steam_dir = steamlocate::SteamDir::locate().map_err(|_| Error::SteamNotFound)?;
        self.steam_dir = Some(steam_dir.clone());

        log::info!("Steam path from steamlocate: {:?}", steam_dir.path());

        Ok(steam_dir)
    }

    pub fn find_game(&mut self) -> Result<PathBuf, Error> {
        let steam_dir = self.find_steam()?;
        let (game, library) = steam_dir
            .find_app(DEADLOCK_APP_ID)
            .map_err(|_| Error::GameNotFound)?
            .ok_or(Error::GameNotFound)?;

        let game_path = library.resolve_app_dir(&game);
        if game_path.exists() {
            log::info!("Game path found: {:?}", game_path);
            self.game_path = Some(game_path.clone());
            return Ok(game_path);
        }

        Err(Error::GameNotFound)
    }

    pub fn check_if_game_running(&mut self) -> Result<(), Error> {
        self.system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::everything(),
        );

        let processes = self
            .system
            .processes_by_name(DEADLOCK_PROCESS_NAME.as_ref());

        if processes.count() > 0 {
            log::debug!("Game is running");
            return Err(Error::GameRunning);
        }

        Ok(())
    }

    pub fn stop_game(&mut self) -> Result<(), Error> {
        let mut stopped = false;

        match self.check_if_game_running() {
            Err(Error::GameRunning) => {
                log::info!("Stopping game...");
                let processes = self
                    .system
                    .processes_by_name(DEADLOCK_PROCESS_NAME.as_ref());

                for process in processes {
                    log::info!("Killing process: {:?}", process.pid());
                    process.kill();
                    stopped = true;
                }
            }
            Err(e) => {
                log::error!("Failed to stop game: {:?}", e);
            }
            Ok(_) => {
                log::info!("Game is not running");
                return Err(Error::GameNotRunning);
            }
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

    fn find_highest_vpk_number(&self, addons_path: &std::path::Path) -> Result<u32, Error> {
        let mut highest = 0;

        if addons_path.exists() {
            for entry in fs::read_dir(addons_path)? {
                let entry = entry?;
                let path = entry.path();

                if path.is_file() && path.extension().map_or(false, |ext| ext == "vpk") {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if let Some(captures) = regex::Regex::new(r"pak(\d+)_dir\.vpk")
                            .unwrap()
                            .captures(name)
                        {
                            if let Ok(num) = captures[1].parse::<u32>() {
                                highest = highest.max(num);
                            }
                        }
                    }
                }
            }
        }

        Ok(highest)
    }

    fn copy_vpks_from_temp(
        &self,
        temp_dir: &std::path::Path,
        mod_files_path: &std::path::Path,
    ) -> Result<Vec<String>, Error> {
        let mut installed_vpks = Vec::new();
        let mut vpk_files = Vec::new();

        // First collect all VPK files
        for entry in fs::read_dir(temp_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_dir() {
                let mut sub_vpks = self.copy_vpks_from_temp(&path, mod_files_path)?;
                installed_vpks.append(&mut sub_vpks);
            } else if path.extension().map_or(false, |ext| ext == "vpk") {
                vpk_files.push(path);
            }
        }

        // Sort VPK files to ensure consistent ordering
        vpk_files.sort();

        // Get the highest existing VPK number
        let mut current_number = self.find_highest_vpk_number(mod_files_path)?;

        // Copy and rename VPK files with sequential numbering
        for vpk_path in vpk_files {
            current_number += 1;
            let new_name = format!("pak{:02}_dir.vpk", current_number);
            let new_path = mod_files_path.join(&new_name);

            fs::copy(&vpk_path, &new_path)?;
            installed_vpks.push(new_name);
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

    fn extract_7z(&self, path: &PathBuf, temp_dir: &std::path::Path) -> Result<(), Error> {
        sevenz_rust::decompress_file(
            path.to_string_lossy().as_ref(),
            temp_dir.to_string_lossy().as_ref(),
        )
        .map_err(|e| Error::ModExtractionFailed(e.to_string()))?;
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

            // clear per-mod cache
            if mod_files_path.exists() {
                log::info!("Clearing existing mod cache at: {:?}", mod_files_path);
                fs::remove_dir_all(&mod_files_path)?;
            }
            fs::create_dir_all(&mod_files_path)?;
            log::info!("Created mod files directory at: {:?}", mod_files_path);

            // unpack archives into cache, collect VPK names
            let mut all_vpks = Vec::new();
            for entry in fs::read_dir(&deadlock_mod.path)? {
                let entry = entry?;
                let path = entry.path();

                let temp_dir = tempfile::tempdir()?;
                log::info!("Processing archive: {:?}", path);

                match path.extension().and_then(|e| e.to_str()) {
                    Some("zip") => self.extract_zip(&path, temp_dir.path())?,
                    Some("rar") => self.extract_rar(&path, temp_dir.path())?,
                    Some("7z")  => self.extract_7z(&path, temp_dir.path())?,
                    _ => continue,
                }

                log::info!("Copying VPKs to mod cache…");
                let mut vpks = self.copy_vpks_from_temp(temp_dir.path(), &mod_files_path)?;
                all_vpks.append(&mut vpks);
            }
            if all_vpks.is_empty() {
                log::error!("No VPK files found in mod");
                return Err(Error::ModInvalid("No VPK files found in mod".into()));
            }

            // append into game addons and record
            let addons_path = game_path.join("game").join("citadel").join("addons");
            log::info!("Installing VPKs to game addons: {:?}", addons_path);
            let installed_vpks = self.copy_vpks_from_temp(&mod_files_path, &addons_path)?;


            deadlock_mod.installed_vpks = installed_vpks;
            log::info!("Adding mod to managed mods list");
            self.mods.insert(deadlock_mod.id.clone(), deadlock_mod.clone());

            log::info!("Mod installation completed successfully");
            Ok(deadlock_mod)
        } else {
            log::error!("Game path not set");
            Err(Error::GamePathNotSet)
        }
    }


    pub fn toggle_mods(&mut self, vanilla: bool) -> Result<(), Error> {
        if let Some(game_path) = &self.game_path {
            let gameinfo_path = game_path
                .join("game")
                .join("citadel")
                .join("gameinfo.gi");
            self.modify_search_paths(&gameinfo_path, vanilla)?;
            if vanilla {
                self.clear_mods()?;
            }
        } else {
            log::error!("Game path not set");
            return Err(Error::GamePathNotSet);
        }
        Ok(())
    }

    pub fn run_game(&mut self, vanilla: bool, additional_args: String) -> Result<(), Error> {
        self.find_game()?;

        if let Some(_steam_dir) = &self.steam_dir {
            if vanilla {
                log::info!("Disabling mods...");
                
            } else {
                log::info!("Enabling mods...");
            }

            self.toggle_mods(vanilla)?;

            // Construct the full Steam URI
            let steam_uri = format!("steam://run/{}//{}", DEADLOCK_APP_ID, additional_args);
            log::info!("Launching game with URI: {}", steam_uri);

            #[cfg(target_os = "windows")]
            std::process::Command::new("cmd")
                .arg("/C")
                .arg("start")
                .arg(steam_uri)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .map_err(|e| Error::GameLaunchFailed(e.to_string()))?;

            #[cfg(target_os = "linux")]
            std::process::Command::new("xdg-open")
                .arg(steam_uri)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .map_err(|e| Error::GameLaunchFailed(e.to_string()))?;

            Ok(())
        } else {
            Err(Error::SteamNotFound)
        }
    }

    pub fn clear_mods(&mut self) -> Result<(), Error> {
        // Delete all vpk files in citadel/addons
        if let Some(game_path) = &self.game_path {
            let addons_path = game_path.join("game").join("citadel").join("addons");

            if !addons_path.exists() {
                return Ok(());
            }

            for entry in fs::read_dir(&addons_path)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_file() && path.extension().unwrap() == "vpk" {
                    fs::remove_file(path)?;
                }
            }
            Ok(())
        } else {
            Err(Error::GamePathNotSet)
        }
    }

    pub fn open_mods_folder(&self) -> Result<(), Error> {
        if let Some(game_path) = &self.game_path {
            let addons_path = game_path.join("game").join("citadel").join("addons");
            utils::show_in_folder(&addons_path.to_string_lossy().to_string())
        } else {
            Err(Error::GamePathNotSet)
        }
    }

    pub fn open_game_folder(&self) -> Result<(), Error> {
        if let Some(game_path) = &self.game_path {
            utils::show_in_folder(&game_path.to_string_lossy().to_string())
        } else {
            Err(Error::GamePathNotSet)
        }
    }

    pub fn open_mods_store(&self) -> Result<(), Error> {
        let local_appdata = std::env::var("LOCALAPPDATA")
            .map_err(|_| Error::GamePathNotSet)?;
        let mods_path = std::path::PathBuf::from(local_appdata)
            .join("dev.stormix.deadlock-mod-manager")
            .join("mods");
        if !mods_path.exists() {
            return Err(Error::GamePathNotSet); 
        }
        utils::show_in_folder_windows(&mods_path.to_string_lossy().to_string())
    }

    pub fn uninstall_mod(&mut self, mod_id: String, vpks: Vec<String>) -> Result<(), Error> {
        log::info!("Uninstalling mod: {}", mod_id);
        if let Some(game_path) = &self.game_path {
            let addons_path = game_path.join("game").join("citadel").join("addons");
            if !addons_path.exists() {
                return Err(Error::GamePathNotSet);
            }

            // Check if the mod is in memory
            if let Some(local_mod) = self.mods.get(&mod_id) {
                log::info!("Mod found in memory: {}", local_mod.name);
                for vpk in &local_mod.installed_vpks {
                    let vpk_path = addons_path.join(vpk);
                    if vpk_path.exists() {
                        fs::remove_file(vpk_path)?;
                    }
                }

                self.mods.remove(&mod_id);
            } else {
                // Just remove the vpk files from citadel/addons
                for vpk in vpks {
                    let vpk_path = addons_path.join(vpk);
                    if vpk_path.exists() {
                        fs::remove_file(vpk_path)?;
                    }
                }
            }

            Ok(())
        } else {
            Err(Error::GamePathNotSet)
        }
    }

    pub fn purge_mod(&mut self, mod_id: String, vpks: Vec<String>) -> Result<(), Error> {
        log::info!("Uninstalling mod: {}", mod_id);

        if let Some(game_path) = &self.game_path {
            // Determine the path to the game's addon directory
            let addons_path = game_path.join("game").join("citadel").join("addons");
            if !addons_path.exists() {
                return Err(Error::GamePathNotSet);
            }

            // If the mod is tracked in memory, remove its VPKs; otherwise use provided list
            if let Some(local_mod) = self.mods.remove(&mod_id) {
                log::info!("Mod found in memory: {}", local_mod.name);
                for vpk in local_mod.installed_vpks {
                    let path = addons_path.join(&vpk);
                    if path.exists() {
                        log::info!("Removing VPK file: {:?}", path);
                        std::fs::remove_file(path)?;
                    }
                }
            } else {
                // Remove each VPK passed in as argument
                for vpk in vpks {
                    let path = addons_path.join(&vpk);
                    if path.exists() {
                        log::info!("Removing VPK file: {:?}", path);
                        std::fs::remove_file(path)?;
                    }
                }
            }

            // Remove the mod's folder from user's local app data
            match std::env::var("LOCALAPPDATA") {
                Ok(local_appdata) => {
                    let user_mod_dir = std::path::PathBuf::from(local_appdata)
                        .join("dev.stormix.deadlock-mod-manager")
                        .join("mods")
                        .join(&mod_id);
                    if user_mod_dir.exists() {
                        log::info!("Removing user-mod folder: {:?}", user_mod_dir);
                        std::fs::remove_dir_all(&user_mod_dir)?;
                    } else {
                        log::warn!("User-mod folder not found, skipping: {:?}", user_mod_dir);
                    }
                }
                Err(_) => {
                    log::warn!("LOCALAPPDATA not set; cannot remove user-mod folder");
                }
            }

            Ok(())
        } else {
            // Game path was not configured
            Err(Error::GamePathNotSet)
        }
    }



    pub fn is_game_running(&mut self) -> Result<bool, Error> {
        match self.check_if_game_running() {
            Ok(_) => Ok(false),
            Err(Error::GameRunning) => Ok(true),
            Err(_) => Ok(false),
        }
    }
}