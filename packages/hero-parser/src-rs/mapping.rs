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
        ("bookworm", "Paige", "Paige"),
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
        ("pocket", "Pocket", "Pocket"),
        ("priest", "Venator", "Venator"),
        ("punkgoat", "Billy", "Billy"),
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
    HERO_MAP.get(internal_name)
}
