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

  pub fn display_name(&self, codename: &str) -> String {
    if let Some(info) = self.data.get(&codename.to_lowercase()) {
      return info.name.clone();
    }
    codename.replace('_', " ")
  }

  pub fn asset_key(&self, codename: &str) -> String {
    let key = codename.to_lowercase();
    if let Some(info) = self.data.get(&key) {
      return info.asset_key.clone();
    }
    format!("hero_{key}")
  }

  pub fn hideout_text(&self, codename: &str) -> String {
    if let Some(info) = self.data.get(&codename.to_lowercase()) {
      if !info.hideout_text.is_empty() && info.hideout_text != "In the Hideout" {
        return info.hideout_text.clone();
      }
    }
    "In the Hideout".to_string()
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
      log::debug!("Hero cache is stale ({:.0}h old), refreshing.", age.as_secs_f64() / 3600.0);
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
    let client = reqwest::Client::builder()
      .timeout(REQUEST_TIMEOUT)
      .build();
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
      let class_name = hero.get("class_name").and_then(|v| v.as_str()).unwrap_or("");
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

fn fallback_heroes() -> Vec<(&'static str, HeroInfo)> {
  vec![
    ("inferno", HeroInfo { name: "Infernus".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_inferno".into() }),
    ("gigawatt", HeroInfo { name: "Seven".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_gigawatt".into() }),
    ("hornet", HeroInfo { name: "Vindicta".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_hornet".into() }),
    ("geist", HeroInfo { name: "Lady Geist".into(), hideout_text: "Being Fabulous in the Hideout".into(), asset_key: "hero_geist".into() }),
    ("abrams", HeroInfo { name: "Abrams".into(), hideout_text: "Investigating the Hideout".into(), asset_key: "hero_atlas".into() }),
    ("wraith", HeroInfo { name: "Wraith".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_wraith".into() }),
    ("mcginnis", HeroInfo { name: "McGinnis".into(), hideout_text: "Tinkering in the Hideout".into(), asset_key: "hero_forge".into() }),
    ("dynamo", HeroInfo { name: "Dynamo".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_dynamo".into() }),
    ("haze", HeroInfo { name: "Haze".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_haze".into() }),
    ("kelvin", HeroInfo { name: "Kelvin".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_kelvin".into() }),
    ("lash", HeroInfo { name: "Lash".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_lash".into() }),
    ("bebop", HeroInfo { name: "Bebop".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_bebop".into() }),
    ("shiv", HeroInfo { name: "Shiv".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_shiv".into() }),
    ("viscous", HeroInfo { name: "Viscous".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_viscous".into() }),
    ("warden", HeroInfo { name: "Warden".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_warden".into() }),
    ("yamato", HeroInfo { name: "Yamato".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_yamato".into() }),
    ("orion", HeroInfo { name: "Grey Talon".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_orion".into() }),
    ("digger", HeroInfo { name: "Mo & Krill".into(), hideout_text: "Relaxing in the Hideout".into(), asset_key: "hero_krill".into() }),
    ("pocket", HeroInfo { name: "Pocket".into(), hideout_text: "Sulking in the Hideout".into(), asset_key: "hero_synth".into() }),
    ("chrono", HeroInfo { name: "Paradox".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_chrono".into() }),
    ("astro", HeroInfo { name: "Holliday".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_astro".into() }),
    ("cadence", HeroInfo { name: "Calico".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_cadence".into() }),
    ("werewolf", HeroInfo { name: "Silver".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_werewolf".into() }),
    ("magician", HeroInfo { name: "Sinclair".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_magician".into() }),
    ("ivy", HeroInfo { name: "Ivy".into(), hideout_text: "Wishing the Arroyos were in the Hideout".into(), asset_key: "hero_tengu".into() }),
    ("mirage", HeroInfo { name: "Mirage".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_mirage".into() }),
    ("vyper", HeroInfo { name: "Vyper".into(), hideout_text: "In the Hideout".into(), asset_key: "hero_vyper".into() }),
  ]
}
