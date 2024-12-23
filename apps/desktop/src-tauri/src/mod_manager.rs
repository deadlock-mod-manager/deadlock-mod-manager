use std::collections::HashMap;
use std::fs::File;
use std::path::PathBuf;
use std::error::Error;
use std::fs;
use winreg::enums::*;
use winreg::RegKey;
use serde::{Deserialize, Serialize};
use keyvalues_serde;
use zip;
use unrar::Archive;
use tempfile;

type LibraryFolders = HashMap<String, LibraryFolder>;


#[derive(Debug, Deserialize)]
pub struct Mod {
    id: String,
    name: String,
    path: PathBuf,
    enabled: bool,
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
}

impl ModManager {
    pub fn new() -> Self {
        ModManager {
            steam_path: None,
            game_path: None,
            game_setup: false,
            mods: HashMap::new(),
        }
    }

    #[cfg(target_os = "windows")]
    pub fn find_steam(&mut self) -> Result<PathBuf, Box<dyn Error>> {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let steam_key = hklm.open_subkey(r"SOFTWARE\WOW6432Node\Valve\Steam")?;
        let install_path: String = steam_key.get_value("InstallPath")?;
        let steam_path = PathBuf::from(install_path);
        
        if steam_path.exists() {
            self.steam_path = Some(steam_path.clone());
            println!("Steam path found: {:?}", steam_path);
            Ok(steam_path)
        } else {
            let default_path = PathBuf::from(r"C:\Program Files (x86)\Steam");
            if default_path.exists() {
                self.steam_path = Some(default_path.clone());
                Ok(default_path)
            } else {
                Err("Steam installation not found".into())
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn find_steam(&mut self) -> Result<PathBuf, Box<dyn Error>> {
        Err("Steam path finding is only implemented for Windows".into())
    }

    pub fn find_game(&mut self) -> Result<PathBuf, Box<dyn Error>> {
        const DEADLOCK_APP_ID: &str = "1422450";
        
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
                    
                    let game_path = library_path.join("steamapps").join("common").join(app_manifest.installdir);
                    if game_path.exists() {
                        self.game_path = Some(game_path.clone());
                        return Ok(game_path);
                    }
                }
            }
        }

        Err("Deadlock not found in any Steam library".into())
    }

    pub fn setup_game_for_mods(&mut self) -> Result<(), Box<dyn Error>> {
        if self.game_setup {
            println!("Game already setup");
            return Ok(());  
        }

        if let Some(game_path) = &self.game_path {
            // mods path: game_path/game/citadel/addons/
            let mods_path = game_path.join("game").join("citadel").join("addons");
            if !mods_path.exists() {
                println!("Creating mods path: {:?}", mods_path);
                fs::create_dir_all(mods_path)?;
            }

            // Read gameinfo.gi
            let gameinfo_path: PathBuf = game_path.join("game").join("citadel").join("gameinfo.gi");
            let gameinfo_content = fs::read_to_string(&gameinfo_path)?;

            // Backup gameinfo.gi to gameinfo.gi.bak
            let backup_path = gameinfo_path.with_extension("gi.bak");
            if !backup_path.exists() {
                fs::copy(&gameinfo_path, &backup_path)?;
            }

            // Find the SearchPaths section
            let search_paths_start = gameinfo_content.find("SearchPaths")
                .ok_or("SearchPaths section not found")?;
            let relative_end = gameinfo_content[search_paths_start..].find("}")
                .ok_or("Could not find end of SearchPaths section")?;

            let search_paths_end = search_paths_start + relative_end + 1;
            let search_paths_section = &gameinfo_content[search_paths_start-1..search_paths_end];

            // Modify the SearchPaths section to include the mods path
            let new_search_paths_section = r#"
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

            // Replace the old search paths section with the new one
            let gameinfo_content = gameinfo_content.replace(search_paths_section, &new_search_paths_section);
            fs::write(gameinfo_path, gameinfo_content)?;
            
            // Mark game as setup
            self.game_setup = true;

            Ok(())
        } else {
            Err("Game path not set. Call find_game() first".into())
        }
    }

    fn copy_vpks_from_temp(&self, temp_dir: &std::path::Path, mod_files_path: &std::path::Path) -> Result<(), Box<dyn Error>> {
        for entry in fs::read_dir(temp_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_dir() {
                self.copy_vpks_from_temp(&path, mod_files_path)?;
            } else if path.extension().map_or(false, |ext| ext == "vpk") {
                fs::copy(&path, mod_files_path.join(path.file_name().unwrap()))?;
            }
        }
        Ok(())
    }

    fn extract_zip(&self, path: &PathBuf, temp_dir: &std::path::Path) -> Result<(), Box<dyn Error>> {
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

    fn extract_rar(&self, path: &PathBuf, temp_dir: &std::path::Path) -> Result<(), Box<dyn Error>> {
        let mut archive = Archive::new(path.to_string_lossy().as_ref())
            .open_for_processing()?;

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

    pub fn install_mod(&mut self, deadlock_mod: Mod) -> Result<(), Box<dyn Error>> {
        println!("Starting installation of mod: {}", deadlock_mod.name);
        
        if !self.game_setup {
            println!("Setting up game for mods...");
            self.setup_game_for_mods()?;
        }

        if self.mods.contains_key(&deadlock_mod.id) {
            println!("Mod {} already installed", deadlock_mod.name);
            return Err("Mod already installed".into());
        }

        if let Some(game_path) = &self.game_path {
            if !deadlock_mod.path.exists() {
                println!("Mod path does not exist: {:?}", deadlock_mod.path);
                return Err("Mod file does not exist".into());
            }

            let mod_files_path = deadlock_mod.path.join("files");
            println!("Creating mod files directory at: {:?}", mod_files_path);
            fs::create_dir_all(&mod_files_path)?;

            for entry in fs::read_dir(&deadlock_mod.path)? {
                let entry = entry?;
                let path = entry.path();

                let temp_dir = tempfile::tempdir()?;
                println!("Processing file: {:?}", path);
                
                match path.extension().and_then(|ext| ext.to_str()) {
                    Some("zip") => {
                        println!("Extracting ZIP file...");
                        self.extract_zip(&path, temp_dir.path())?
                    },
                    Some("rar") => {
                        println!("Extracting RAR file...");
                        self.extract_rar(&path, temp_dir.path())?
                    },
                    _ => continue,
                }

                println!("Copying VPK files to mod directory...");
                self.copy_vpks_from_temp(temp_dir.path(), &mod_files_path)?;
            }

            let addons_path = game_path.join("game").join("citadel").join("addons");
            println!("Installing VPK files to game addons: {:?}", addons_path);
            self.copy_vpks_from_temp(&mod_files_path, &addons_path)?;

            println!("Adding mod to managed mods list");
            self.mods.insert(deadlock_mod.id.clone(), deadlock_mod);
            
            println!("Mod installation completed successfully");
            Ok(())
        } else {
            println!("Game path not set");
            Err("Game path not set. Call find_game() first".into())
        }
    }
}
