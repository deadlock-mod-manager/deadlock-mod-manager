use std::collections::HashMap;
use std::sync::LazyLock;

pub struct HeroMapping {
    pub enum_key: &'static str,
    pub display_name: &'static str,
}

static HERO_MAP: LazyLock<HashMap<&'static str, HeroMapping>> = LazyLock::new(|| {
    let mut m = HashMap::new();

    let entries: Vec<(&str, &str, &str)> = vec![
        // heroes_wip
        //Deadlock internal name => Deadlock enum key => Deadlock display name
        ("abrams", "Abrams", "Abrams"),
        ("artist", "Violet", "Violet"),
        ("baba", "Baba", "Baba"),
        ("bookworm", "Paige", "Paige"),
        ("chessmaster", "Solomon", "Solomon"),
        ("deadpack", "DeadmanDanny", "Deadman Danny"),
        ("doorman", "Doorman", "Doorman"),
        ("doorman_v2", "Doorman", "Doorman"),
        ("drifter", "Drifter", "Drifter"),
        ("dynamo", "Dynamo", "Dynamo"),
        ("familiar", "Rem", "Rem"),
        ("fencer", "Apollo", "Apollo"),
        ("frank", "Victor", "Victor"),
        ("frank_v2", "Victor", "Victor"),
        ("geist", "LadyGeist", "Lady Geist"),
        ("haze", "Haze", "Haze"),
        ("inferno", "Infernus", "Infernus"),
        ("ivy", "Ivy", "Ivy"),
        ("lash", "Lash", "Lash"),
        ("mcginnis", "McGinnis", "McGinnis"),
        ("necro", "Graves", "Graves"),
        ("nurse", "NurseHarrow", "Nurse Harrow"),
        ("pocket", "Pocket", "Pocket"),
        ("priest", "Venator", "Venator"),
        ("punkgoat", "Billy", "Billy"),
        ("ratking", "RatKing", "Rat King"),
        ("unicorn", "Celeste", "Celeste"),
        ("vampirebat", "Mina", "Mina"),
        ("werewolf", "Silver", "Silver"),
        ("wraith", "Wraith", "Wraith"),
        ("yamato", "Yamato", "Yamato"),
        // heroes_staging
        ("archer", "GreyTalon", "Grey Talon"),
        ("archer_v2", "GreyTalon", "Grey Talon"),
        ("astro", "Holliday", "Holliday"),
        ("atlas_detective", "Abrams", "Abrams"),
        ("atlas_detective_v2", "Abrams", "Abrams"),
        ("bebop", "Bebop", "Bebop"),
        ("butcher", "Wrecker", "Wrecker"),
        ("chrono", "Paradox", "Paradox"),
        ("digger", "MoKrill", "Mo & Krill"),
        ("engineer", "McGinnis", "McGinnis"),
        ("ghost", "LadyGeist", "Lady Geist"),
        ("gigawatt", "Seven", "Seven"),
        ("gigawatt_prisoner", "Seven", "Seven"),
        ("grey_talon", "GreyTalon", "Grey Talon"),
        ("haze_v2", "Haze", "Haze"),
        ("hornet_v3", "Vindicta", "Vindicta"),
        ("inferno_v4", "Infernus", "Infernus"),
        ("kelvin", "Kelvin", "Kelvin"),
        ("kelvin_explorer", "Kelvin", "Kelvin"),
        ("kelvin_v2", "Kelvin", "Kelvin"),
        ("lash_v2", "Lash", "Lash"),
        ("magician", "Sinclair", "Sinclair"),
        ("magician_v2", "Sinclair", "Sinclair"),
        ("mirage", "Mirage", "Mirage"),
        ("mirage_v2", "Mirage", "Mirage"),
        ("nano", "Calico", "Calico"),
        ("prof_dynamo", "Dynamo", "Dynamo"),
        ("shiv", "Shiv", "Shiv"),
        ("shiv_ult", "Shiv", "Shiv"),
        ("synth", "Pocket", "Pocket"),
        ("tengu", "Ivy", "Ivy"),
        ("vindicta", "Vindicta", "Vindicta"),
        ("viper", "Vyper", "Vyper"),
        ("viscous", "Viscous", "Viscous"),
        ("warden", "Warden", "Warden"),
        ("wraith_gen_man", "Wraith", "Wraith"),
        ("wraith_magician", "Wraith", "Wraith"),
        ("wraith_puppeteer", "Wraith", "Wraith"),
        ("wrecker", "Wrecker", "Wrecker"),
        ("yamato_v2", "Yamato", "Yamato"),
    ];

    for (internal, enum_key, display) in entries {
        m.insert(
            internal,
            HeroMapping {
                enum_key,
                display_name: display,
            },
        );
    }

    m
});

// Paths to look for heroes in
pub const HERO_PATH_PREFIXES: [&str; 3] = [
    "models/heroes_wip/",
    "models/heroes_staging/",
    "models/heroes/",
];

// Lookup hero by internal name
pub fn lookup_hero(internal_name: &str) -> Option<&'static HeroMapping> {
    let lower = internal_name.to_lowercase();
    HERO_MAP.get(lower.as_str())
}

/// Deadlock's sound-path codename per hero. Sound mods organize their payloads
/// under `sounds/abilities/<sound_codename>/`, and that namespace diverges from
/// both the panorama namespace and the model folders above.
const HERO_SOUND_CODENAMES: &[(&str, &str)] = &[
    ("abrams", "Abrams"),
    ("artist", "Violet"),
    ("astro", "Holliday"),
    ("baba", "Baba"),
    ("bebop", "Bebop"),
    ("bookworm", "Paige"),
    ("chessmaster", "Solomon"),
    ("chrono", "Paradox"),
    ("deadpack", "Deadman Danny"),
    ("doorman", "Doorman"),
    ("drifter", "Drifter"),
    ("dynamo", "Dynamo"),
    ("familiar", "Rem"),
    ("fathom", "Fathom"),
    ("fencer", "Apollo"),
    ("forge", "McGinnis"),
    ("frank", "Victor"),
    ("ghost", "Lady Geist"),
    ("gigawatt", "Seven"),
    ("haze", "Haze"),
    ("hornet", "Vindicta"),
    ("inferno", "Infernus"),
    ("kali", "Kali"),
    ("kelvin", "Kelvin"),
    ("lash", "Lash"),
    ("magician", "Sinclair"),
    ("mirage", "Mirage"),
    ("mokrill", "Mo & Krill"),
    ("nano", "Calico"),
    ("necro", "Graves"),
    ("nurse", "Nurse Harrow"),
    ("orion", "Grey Talon"),
    ("priest", "Venator"),
    ("punkgoat", "Billy"),
    ("ratking", "Rat King"),
    ("shiv", "Shiv"),
    ("synth", "Pocket"),
    ("tengu", "Ivy"),
    ("tokamak", "Tokamak"),
    ("trapper", "Trapper"),
    ("unicorn", "Celeste"),
    ("vampirebat", "Mina"),
    ("viper", "Vyper"),
    ("viscous", "Viscous"),
    ("warden", "Warden"),
    ("werewolf", "Silver"),
    ("wraith", "Wraith"),
    ("wrecker", "Wrecker"),
    ("yamato", "Yamato"),
];

/// Legacy sound directories that still ship files, folded into the codename
/// they ship under today (Grey Talon ships under both `orion` and `archer`).
const LEGACY_SOUND_CODENAMES: [(&str, &str); 3] =
    [("archer", "orion"), ("geist", "ghost"), ("pocket", "synth")];

pub fn canonical_sound_codename(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase();
    LEGACY_SOUND_CODENAMES
        .iter()
        .find(|(legacy, _)| *legacy == lower)
        .map_or(lower, |(_, current)| (*current).to_string())
}

pub fn sound_codename_for_hero(hero_name: &str) -> Option<&'static str> {
    let trimmed = hero_name.trim();
    HERO_SOUND_CODENAMES
        .iter()
        .find(|(_, name)| name.eq_ignore_ascii_case(trimmed))
        .map(|(key, _)| *key)
}

/// The hero display name behind a `sounds/abilities/<codename>/` folder.
pub fn lookup_sound_hero(codename: &str) -> Option<&'static str> {
    let canonical = canonical_sound_codename(codename);
    HERO_SOUND_CODENAMES
        .iter()
        .find(|(key, _)| *key == canonical)
        .map(|(_, name)| *name)
}

/// The enum key for a display name. Heroes the model table does not know yet
/// fall back to the display name without spaces or punctuation.
pub fn enum_key_for_display(display_name: &str) -> String {
    HERO_MAP
        .values()
        .find(|hero| hero.display_name == display_name)
        .map_or_else(
            || {
                display_name
                    .chars()
                    .filter(char::is_ascii_alphanumeric)
                    .collect()
            },
            |hero| hero.enum_key.to_string(),
        )
}
