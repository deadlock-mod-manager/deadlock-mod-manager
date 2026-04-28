use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS, PartialEq, Eq)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(default, rename_all = "camelCase")]
pub struct PresenceBuildConfig {
    pub templates: PresenceTextTemplates,
    pub hero_overrides: HashMap<String, PresenceTextTemplates>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS, PartialEq, Eq)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(default, rename_all = "camelCase")]
pub struct PresenceTextTemplates {
    pub main_menu: PresenceTextTemplatePair,
    pub solo_hideout: PresenceTextTemplatePair,
    pub party_hideout: PresenceTextTemplatePair,
    pub in_queue: PresenceTextTemplatePair,
    pub solo_match: PresenceTextTemplatePair,
    pub party_match: PresenceTextTemplatePair,
    pub post_match: PresenceTextTemplatePair,
    pub spectating: PresenceTextTemplatePair,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS, PartialEq, Eq)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(default, rename_all = "camelCase")]
pub struct PresenceTextTemplatePair {
    pub details: String,
    pub state: String,
}
