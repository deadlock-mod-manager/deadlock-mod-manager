use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const API_URL: &str = "https://api.deadlock-api.com/v1/assets/heroes?language=english";
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
/// Versioned so older caches are never read: v1 lacks `image_url` and would pin
/// every hero to a Discord upload that may not exist, v2 lists disabled heroes.
const CACHE_FILENAME: &str = "hero_presence_cache_v3.json";
const IMAGE_BASE_URL: &str = "https://assets-bucket.deadlock-api.com/assets-api-res/images/heroes";

/// Model folders (`models/heroes/<folder>/`) whose name differs from the hero's
/// class name. Hero data is keyed by class name only, so each hero is listed once
/// and an override applies whichever log line named the hero.
const MODEL_FOLDER_ALIASES: &[(&str, &str)] = &[
    ("abrams", "atlas"),
    ("archer", "orion"),
    ("atlas_detective", "atlas"),
    ("digger", "krill"),
    ("engineer", "forge"),
    ("geist", "ghost"),
    ("grey_talon", "orion"),
    ("ivy", "tengu"),
    ("mcginnis", "forge"),
    ("pocket", "synth"),
    ("prof_dynamo", "dynamo"),
    ("vindicta", "hornet"),
    ("vyper", "viper"),
];

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HeroInfo {
    pub name: String,
    pub hideout_text: String,
    pub asset_key: String,
    /// Square portrait from the assets API. Discord accepts an https URL as an
    /// image key, so heroes show up without an upload to the Discord app.
    #[serde(default)]
    pub image_url: Option<String>,
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
        self.data.get(&self.canonical_key(codename)?)
    }

    fn canonical_key(&self, codename: &str) -> Option<String> {
        let key = codename.to_lowercase();
        if self.data.contains_key(&key) {
            return Some(key);
        }
        MODEL_FOLDER_ALIASES
            .iter()
            .find(|(alias, _)| *alias == key)
            .map(|(_, class_name)| class_name.to_string())
            .filter(|class_name| self.data.contains_key(class_name))
    }

    pub fn heroes(&self) -> Vec<(String, String)> {
        let mut heroes = self
            .data
            .iter()
            .map(|(codename, info)| (codename.clone(), info.name.clone()))
            .collect::<Vec<_>>();
        heroes.sort_by(|a, b| a.1.cmp(&b.1));
        heroes
    }

    pub fn heroes_detailed(&self) -> Vec<(String, String, String)> {
        let mut heroes = self
            .data
            .iter()
            .map(|(codename, info)| {
                (
                    codename.clone(),
                    info.name.clone(),
                    self.hideout_text(codename),
                )
            })
            .collect::<Vec<_>>();
        heroes.sort_by(|a, b| a.1.cmp(&b.1));
        heroes
    }

    pub fn display_name(&self, codename: &str) -> String {
        if let Some(info) = self.get(codename) {
            return info.name.clone();
        }
        codename.replace('_', " ")
    }

    pub fn asset_key(&self, codename: &str) -> String {
        if let Some(info) = self.get(codename) {
            return info
                .image_url
                .clone()
                .unwrap_or_else(|| info.asset_key.clone());
        }
        let key = codename.to_lowercase();
        format!("hero_{key}")
    }

    pub fn hideout_text(&self, codename: &str) -> String {
        if let Some(info) = self.get(codename)
            && !info.hideout_text.is_empty()
            && info.hideout_text != "In the Hideout"
        {
            return info.hideout_text.clone();
        }
        "In the Hideout".to_string()
    }

    pub fn normalize_codename(&self, codename: &str) -> String {
        let normalized = codename.to_lowercase().replace("hero_", "");
        if let Some(key) = self.canonical_key(&normalized) {
            return key;
        }

        let parts = normalized.split('_').collect::<Vec<_>>();
        for i in (1..parts.len()).rev() {
            let candidate = parts[..i].join("_");
            if let Some(key) = self.canonical_key(&candidate) {
                return key;
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

            let image_url = hero
                .get("images")
                .and_then(|images| images.get("icon_image_small"))
                .and_then(|v| v.as_str())
                .map(str::to_string);

            let disabled = hero
                .get("disabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            if class_name.is_empty() || name.is_empty() || disabled {
                continue;
            }

            let codename = class_name.strip_prefix("hero_").unwrap_or(class_name);
            parsed.insert(
                codename.to_string(),
                HeroInfo {
                    name: name.to_string(),
                    hideout_text: hideout_text.to_string(),
                    asset_key: class_name.to_string(),
                    image_url,
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

fn hero(name: &str, hideout_text: &str, asset_key: &str, image: Option<&str>) -> HeroInfo {
    HeroInfo {
        name: name.to_string(),
        hideout_text: hideout_text.to_string(),
        asset_key: asset_key.to_string(),
        image_url: image.map(|stem| format!("{IMAGE_BASE_URL}/{stem}_sm.png")),
    }
}

/// Used only until the first API response or cache load. Violet and Nurse Harrow
/// have no portrait yet; the API fills theirs in once Valve releases them.
fn fallback_heroes() -> Vec<(&'static str, HeroInfo)> {
    vec![
        (
            "inferno",
            hero(
                "Infernus",
                "In the Hideout",
                "hero_inferno",
                Some("inferno"),
            ),
        ),
        (
            "gigawatt",
            hero("Seven", "In the Hideout", "hero_gigawatt", Some("gigawatt")),
        ),
        (
            "hornet",
            hero("Vindicta", "In the Hideout", "hero_hornet", Some("hornet")),
        ),
        (
            "ghost",
            hero(
                "Lady Geist",
                "Being Fabulous in the Hideout",
                "hero_geist",
                Some("spectre"),
            ),
        ),
        (
            "atlas",
            hero(
                "Abrams",
                "Investigating the Hideout",
                "hero_atlas",
                Some("bull"),
            ),
        ),
        (
            "wraith",
            hero("Wraith", "In the Hideout", "hero_wraith", Some("wraith")),
        ),
        (
            "forge",
            hero(
                "McGinnis",
                "Tinkering in the Hideout",
                "hero_forge",
                Some("engineer"),
            ),
        ),
        (
            "dynamo",
            hero("Dynamo", "In the Hideout", "hero_dynamo", Some("sumo")),
        ),
        (
            "haze",
            hero("Haze", "In the Hideout", "hero_haze", Some("haze")),
        ),
        (
            "kelvin",
            hero("Kelvin", "In the Hideout", "hero_kelvin", Some("kelvin")),
        ),
        (
            "lash",
            hero("Lash", "In the Hideout", "hero_lash", Some("lash")),
        ),
        (
            "bebop",
            hero("Bebop", "In the Hideout", "hero_bebop", Some("bebop")),
        ),
        (
            "shiv",
            hero("Shiv", "In the Hideout", "hero_shiv", Some("shiv")),
        ),
        (
            "viscous",
            hero("Viscous", "In the Hideout", "hero_viscous", Some("viscous")),
        ),
        (
            "warden",
            hero("Warden", "In the Hideout", "hero_warden", Some("warden")),
        ),
        (
            "yamato",
            hero("Yamato", "In the Hideout", "hero_yamato", Some("yamato")),
        ),
        (
            "orion",
            hero(
                "Grey Talon",
                "Mourning in the Hideout",
                "hero_orion",
                Some("archer"),
            ),
        ),
        (
            "krill",
            hero(
                "Mo & Krill",
                "Relaxing in the Hideout",
                "hero_krill",
                Some("digger"),
            ),
        ),
        (
            "synth",
            hero(
                "Pocket",
                "Sulking in the Hideout",
                "hero_synth",
                Some("synth"),
            ),
        ),
        (
            "chrono",
            hero("Paradox", "In the Hideout", "hero_chrono", Some("chrono")),
        ),
        (
            "astro",
            hero("Holliday", "In the Hideout", "hero_astro", Some("astro")),
        ),
        (
            "nano",
            hero("Calico", "In the Hideout", "hero_nano", Some("nano")),
        ),
        (
            "werewolf",
            hero(
                "Silver",
                "In the Hideout",
                "hero_werewolf",
                Some("werewolf"),
            ),
        ),
        (
            "magician",
            hero(
                "Sinclair",
                "In the Hideout",
                "hero_magician",
                Some("magician"),
            ),
        ),
        (
            "tengu",
            hero(
                "Ivy",
                "Wishing the Arroyos were in the Hideout",
                "hero_tengu",
                Some("tengu"),
            ),
        ),
        (
            "mirage",
            hero("Mirage", "In the Hideout", "hero_mirage", Some("mirage")),
        ),
        (
            "viper",
            hero("Vyper", "In the Hideout", "hero_viper", Some("kali")),
        ),
        (
            "vampirebat",
            hero(
                "Mina",
                "Grabbing A Bite In The Hideout",
                "hero_vampirebat",
                Some("vampirebat"),
            ),
        ),
        (
            "drifter",
            hero(
                "Drifter",
                "Prowling In The Hideout",
                "hero_drifter",
                Some("drifter"),
            ),
        ),
        (
            "priest",
            hero(
                "Venator",
                "Blessing Ammunition In The Hideout",
                "hero_priest",
                Some("priest"),
            ),
        ),
        (
            "frank",
            hero(
                "Victor",
                "Brooding In The Hideout",
                "hero_frank",
                Some("frank"),
            ),
        ),
        (
            "bookworm",
            hero(
                "Paige",
                "Reading In The Hideout",
                "hero_bookworm",
                Some("bookworm"),
            ),
        ),
        (
            "doorman",
            hero(
                "The Doorman",
                "At Your Service In The Hideout",
                "hero_doorman",
                Some("doorman"),
            ),
        ),
        (
            "punkgoat",
            hero(
                "Billy",
                "Ranting In The Hideout",
                "hero_punkgoat",
                Some("punkgoat"),
            ),
        ),
        (
            "necro",
            hero(
                "Graves",
                "Playing With The Dead In The Hideout",
                "hero_necro",
                Some("necro"),
            ),
        ),
        (
            "fencer",
            hero(
                "Apollo",
                "Striving Towards Perfection In The Hideout",
                "hero_fencer",
                Some("fencer"),
            ),
        ),
        (
            "familiar",
            hero(
                "Rem",
                "Having Sweet Dreams In The Hideout",
                "hero_familiar",
                Some("familiar"),
            ),
        ),
        (
            "unicorn",
            hero(
                "Celeste",
                "Cleaning Up Glitter In The Hideout",
                "hero_unicorn",
                Some("unicorn"),
            ),
        ),
        (
            "deadpack",
            hero(
                "Deadman Danny",
                "Testing Fine Fairfax Products In The Hideout",
                "hero_deadpack",
                Some("deadpack"),
            ),
        ),
        (
            "ratking",
            hero(
                "Rat King",
                "Wishing The Hideout Was On Long Island",
                "hero_ratking",
                Some("ratking"),
            ),
        ),
        (
            "chessmaster",
            hero(
                "Solomon",
                "Planning Moves In The Hideout",
                "hero_chessmaster",
                Some("chessmaster"),
            ),
        ),
        (
            "baba",
            hero(
                "Baba",
                "Hating Mildred In The Hideout",
                "hero_baba",
                Some("baba"),
            ),
        ),
        (
            "artist",
            hero("Violet", "In the Hideout", "hero_artist", None),
        ),
        (
            "nurse",
            hero("Nurse Harrow", "In the Hideout", "hero_nurse", None),
        ),
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
        assert_eq!(store.normalize_codename("archer_v2"), "orion");
        assert_eq!(
            store.asset_key("archer"),
            "https://assets-bucket.deadlock-api.com/assets-api-res/images/heroes/archer_sm.png"
        );
    }

    #[test]
    fn lists_each_fallback_hero_once() {
        let store = HeroDataStore::new(Path::new("."));
        let mut names = store
            .heroes()
            .into_iter()
            .map(|(_, name)| name)
            .collect::<Vec<_>>();
        let total = names.len();
        names.dedup();

        assert_eq!(names.len(), total);
        assert!(names.iter().any(|name| name == "Celeste"));
    }

    #[test]
    fn knows_the_city_never_sleeps_heroes_without_the_api() {
        let store = HeroDataStore::new(Path::new("."));

        assert_eq!(store.display_name("ratking"), "Rat King");
        assert_eq!(store.display_name("deadpack"), "Deadman Danny");
        assert_eq!(store.normalize_codename("hero_chessmaster"), "chessmaster");
        // No portrait yet, so the presence falls back to the Discord asset key.
        assert_eq!(store.asset_key("artist"), "hero_artist");
    }
}
