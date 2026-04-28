use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const API_URL: &str = "https://assets.deadlock-api.com/v2/heroes?language=english";
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const CACHE_FILENAME: &str = "hero_presence_cache.json";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HeroInfo {
    pub name: String,
    pub hideout_text: String,
    pub asset_key: String,
}

pub struct HeroDataStore {
    data: HashMap<String, HeroInfo>,
    cache_path: PathBuf,
}

impl HeroDataStore {
    pub fn new(cache_dir: &Path) -> Self {
        let mut data = HashMap::new();
        for (key, info) in fallback_heroes() {
            data.insert(key.to_string(), info);
        }
        Self {
            data,
            cache_path: cache_dir.join(CACHE_FILENAME),
        }
    }

    pub async fn load(&mut self) {
        if self.try_load_cache() {
            return;
        }
        self.fetch_from_api().await;
    }

    pub fn get(&self, codename: &str) -> Option<&HeroInfo> {
        self.data.get(&codename.to_lowercase())
    }

    pub fn display_name(&self, codename: &str) -> String {
        if let Some(info) = self.get(codename) {
            return info.name.clone();
        }
        codename.replace('_', " ")
    }

    pub fn asset_key(&self, codename: &str) -> String {
        if let Some(info) = self.get(codename) {
            return info.asset_key.clone();
        }
        let key = codename.to_lowercase();
        format!("hero_{key}")
    }

    pub fn hideout_text(&self, codename: &str) -> String {
        if let Some(info) = self.get(codename) {
            if !info.hideout_text.is_empty() && info.hideout_text != "In the Hideout" {
                return info.hideout_text.clone();
            }
        }
        "In the Hideout".to_string()
    }

    pub fn normalize_codename(&self, codename: &str) -> String {
        let normalized = codename.to_lowercase().replace("hero_", "");
        if self.get(&normalized).is_some() {
            return normalized;
        }

        let parts = normalized.split('_').collect::<Vec<_>>();
        for i in (1..parts.len()).rev() {
            let candidate = parts[..i].join("_");
            if self.get(&candidate).is_some() {
                return candidate;
            }
        }

        if let Some(first) = parts.first()
            && parts.len() > 1
        {
            return first.to_string();
        }

        normalized
    }

    fn try_load_cache(&mut self) -> bool {
        if !self.cache_path.exists() {
            return false;
        }
        let Ok(metadata) = std::fs::metadata(&self.cache_path) else {
            return false;
        };
        let age = metadata
            .modified()
            .ok()
            .and_then(|m| SystemTime::now().duration_since(m).ok())
            .unwrap_or(Duration::MAX);

        if age > CACHE_TTL {
            log::debug!(
                "Hero cache is stale ({:.0}h old), refreshing.",
                age.as_secs_f64() / 3600.0
            );
            return false;
        }

        match std::fs::read_to_string(&self.cache_path) {
            Ok(content) => match serde_json::from_str::<HashMap<String, HeroInfo>>(&content) {
                Ok(cached) if !cached.is_empty() => {
                    for (key, info) in &cached {
                        self.data.insert(key.clone(), info.clone());
                    }
                    log::info!("Loaded hero data from cache ({} heroes).", self.data.len());
                    true
                }
                _ => false,
            },
            Err(_) => false,
        }
    }

    async fn fetch_from_api(&mut self) {
        let client = reqwest::Client::builder().timeout(REQUEST_TIMEOUT).build();
        let Ok(client) = client else {
            log::warn!("Failed to create HTTP client for hero data");
            return;
        };

        log::info!("Fetching hero data from API...");
        let response = match client.get(API_URL).send().await {
            Ok(resp) => resp,
            Err(e) => {
                log::warn!("Hero API unavailable, using fallback data: {e}");
                return;
            }
        };

        let heroes: Vec<serde_json::Value> = match response.json().await {
            Ok(h) => h,
            Err(e) => {
                log::warn!("Failed to parse hero API response: {e}");
                return;
            }
        };

        let mut parsed: HashMap<String, HeroInfo> = HashMap::new();
        for hero in &heroes {
            let class_name = hero
                .get("class_name")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let name = hero.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let hideout_text = hero
                .get("hideout_rich_presence")
                .and_then(|v| v.as_str())
                .unwrap_or("In the Hideout");

            if class_name.is_empty() || name.is_empty() {
                continue;
            }

            let codename = class_name.strip_prefix("hero_").unwrap_or(class_name);
            parsed.insert(
                codename.to_string(),
                HeroInfo {
                    name: name.to_string(),
                    hideout_text: hideout_text.to_string(),
                    asset_key: class_name.to_string(),
                },
            );
        }

        if !parsed.is_empty() {
            log::info!("Loaded {} heroes from API.", parsed.len());
            for (key, info) in &parsed {
                self.data.insert(key.clone(), info.clone());
            }
            self.save_cache(&parsed);
        } else {
            log::warn!("API returned empty hero list, using fallback.");
        }
    }

    fn save_cache(&self, data: &HashMap<String, HeroInfo>) {
        if let Some(parent) = self.cache_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        match serde_json::to_string_pretty(data) {
            Ok(json) => {
                if let Err(e) = std::fs::write(&self.cache_path, json) {
                    log::warn!("Could not save hero cache: {e}");
                }
            }
            Err(e) => log::warn!("Could not serialize hero cache: {e}"),
        }
    }
}

fn hero(name: &str, hideout_text: &str, asset_key: &str) -> HeroInfo {
    HeroInfo {
        name: name.to_string(),
        hideout_text: hideout_text.to_string(),
        asset_key: asset_key.to_string(),
    }
}

fn fallback_heroes() -> Vec<(&'static str, HeroInfo)> {
    vec![
        (
            "inferno",
            hero("Infernus", "In the Hideout", "hero_inferno"),
        ),
        ("gigawatt", hero("Seven", "In the Hideout", "hero_gigawatt")),
        ("hornet", hero("Vindicta", "In the Hideout", "hero_hornet")),
        (
            "geist",
            hero("Lady Geist", "Being Fabulous in the Hideout", "hero_geist"),
        ),
        (
            "abrams",
            hero("Abrams", "Investigating the Hideout", "hero_atlas"),
        ),
        ("wraith", hero("Wraith", "In the Hideout", "hero_wraith")),
        (
            "mcginnis",
            hero("McGinnis", "Tinkering in the Hideout", "hero_forge"),
        ),
        ("dynamo", hero("Dynamo", "In the Hideout", "hero_dynamo")),
        ("haze", hero("Haze", "In the Hideout", "hero_haze")),
        ("kelvin", hero("Kelvin", "In the Hideout", "hero_kelvin")),
        ("lash", hero("Lash", "In the Hideout", "hero_lash")),
        ("bebop", hero("Bebop", "In the Hideout", "hero_bebop")),
        ("shiv", hero("Shiv", "In the Hideout", "hero_shiv")),
        ("viscous", hero("Viscous", "In the Hideout", "hero_viscous")),
        ("warden", hero("Warden", "In the Hideout", "hero_warden")),
        ("yamato", hero("Yamato", "In the Hideout", "hero_yamato")),
        ("orion", hero("Grey Talon", "In the Hideout", "hero_orion")),
        (
            "digger",
            hero("Mo & Krill", "Relaxing in the Hideout", "hero_krill"),
        ),
        (
            "pocket",
            hero("Pocket", "Sulking in the Hideout", "hero_synth"),
        ),
        ("chrono", hero("Paradox", "In the Hideout", "hero_chrono")),
        ("astro", hero("Holliday", "In the Hideout", "hero_astro")),
        ("cadence", hero("Calico", "In the Hideout", "hero_cadence")),
        (
            "werewolf",
            hero("Silver", "In the Hideout", "hero_werewolf"),
        ),
        (
            "magician",
            hero("Sinclair", "In the Hideout", "hero_magician"),
        ),
        (
            "archer",
            hero("Grey Talon", "Mourning in the Hideout", "hero_orion"),
        ),
        (
            "ivy",
            hero(
                "Ivy",
                "Wishing the Arroyos were in the Hideout",
                "hero_tengu",
            ),
        ),
        ("mirage", hero("Mirage", "In the Hideout", "hero_mirage")),
        ("vyper", hero("Vyper", "In the Hideout", "hero_vyper")),
    ]
}

#[cfg(test)]
mod tests {
    use super::HeroDataStore;
    use std::path::Path;

    #[test]
    fn normalizes_hero_variant_suffixes_to_known_heroes() {
        let store = HeroDataStore::new(Path::new("."));

        assert_eq!(
            store.normalize_codename("hero_gigawatt_prisoner"),
            "gigawatt"
        );
        assert_eq!(store.normalize_codename("mirage_v2"), "mirage");
    }

    #[test]
    fn includes_archer_fallback_alias() {
        let store = HeroDataStore::new(Path::new("."));

        assert_eq!(store.display_name("archer"), "Grey Talon");
        assert_eq!(store.asset_key("archer"), "hero_orion");
    }
}
