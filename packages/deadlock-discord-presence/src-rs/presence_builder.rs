use crate::DiscordActivity;
use crate::config::{PresenceBuildConfig, PresenceTextTemplatePair, PresenceTextTemplates};
use crate::hero_data::HeroDataStore;
use crate::state::{GamePhase, GameState, MatchMode};

const PARTY_MAX: u32 = 6;
const LOGO_ASSET: &str = "deadlock_logo";
const LOGO_TEXT: &str = "Deadlock";
const DISCORD_ACTIVITY_TEXT_MAX_LEN: usize = 128;

pub fn build_presence(
    state: &GameState,
    hero_store: &HeroDataStore,
    config: &PresenceBuildConfig,
) -> Option<DiscordActivity> {
    if state.phase == GamePhase::NotRunning {
        return None;
    }

    let hero_display = state
        .hero_key
        .as_deref()
        .map(|k| hero_store.display_name(k));
    let hero_asset = state
        .hero_key
        .as_deref()
        .map(|k| resolve_hero_asset(state, k, hero_store));

    let mut large_image_key = hero_asset.or_else(|| Some(LOGO_ASSET.to_string()));
    let mut large_image_text = Some(LOGO_TEXT.to_string());
    let mut small_image_key: Option<String> = None;
    let mut small_image_text: Option<String> = None;
    let mut details: Option<String>;
    let mut state_text: Option<String> = None;
    let mut start_timestamp: Option<i64> = None;
    let party_size = state
        .in_party()
        .then_some([state.party_size as i32, PARTY_MAX as i32]);

    if hero_display.is_some() {
        small_image_key = Some(LOGO_ASSET.to_string());
        small_image_text = hero_display.clone();
    }

    let hero_presence = || {
        state
            .hero_key
            .as_deref()
            .map(|k| hero_store.hideout_text(k))
            .unwrap_or_else(|| "In the Hideout".to_string())
    };

    let global_template_pair = match state.phase {
        GamePhase::MainMenu => {
            details = Some("Main Menu".to_string());
            large_image_key = Some(LOGO_ASSET.to_string());
            large_image_text = Some(LOGO_TEXT.to_string());
            &config.templates.main_menu
        }

        GamePhase::Hideout => {
            details = Some(hero_presence());
            state_text = Some(format!("Playing Solo (1 of {PARTY_MAX})"));
            small_image_key = None;
            small_image_text = None;
            &config.templates.solo_hideout
        }

        GamePhase::PartyHideout => {
            details = Some(hero_presence());
            state_text = Some(format!("Party of {}", state.party_size));
            small_image_key = None;
            small_image_text = None;
            &config.templates.party_hideout
        }

        GamePhase::InQueue => {
            details = Some("Looking for Match...".to_string());
            if state.in_party() {
                state_text = Some(format!("In Queue {}", state.party_size));
            }
            &config.templates.in_queue
        }

        GamePhase::MatchIntro | GamePhase::InMatch => {
            let mode_str = state.match_mode.display_text();
            if state.in_party() {
                details = if let Some(ref hero) = hero_display {
                    Some(format!(" {mode_str} \u{00b7} {hero}"))
                } else {
                    Some(format!(" {mode_str}"))
                };
                state_text = Some(format!("Party of {}", state.party_size));
            } else if let Some(ref hero) = hero_display {
                details = Some(format!(" {mode_str}"));
                state_text = Some(format!("Playing as {hero}"));
            } else {
                details = Some(format!(" {mode_str}"));
            }

            if state.phase == GamePhase::InMatch
                && !matches!(state.match_mode, MatchMode::Sandbox | MatchMode::Tutorial)
                && let Some(match_start) = state.match_start_time {
                    start_timestamp = Some(match_start as i64);
                }
            if state.in_party() {
                &config.templates.party_match
            } else {
                &config.templates.solo_match
            }
        }

        GamePhase::PostMatch => {
            details = Some("Post-Match".to_string());
            &config.templates.post_match
        }

        GamePhase::Spectating => {
            details = Some("Spectating a Match".to_string());
            large_image_key = Some(LOGO_ASSET.to_string());
            large_image_text = Some(LOGO_TEXT.to_string());
            small_image_key = None;
            small_image_text = None;
            &config.templates.spectating
        }

        _ => {
            return None;
        }
    };
    let template_pair = resolve_template_pair(state, &config.hero_overrides, global_template_pair);

    let hero_presence_text = hero_presence();
    let render_context = TemplateRenderContext {
        hero: hero_display.as_deref().unwrap_or_default(),
        hero_presence: &hero_presence_text,
        mode: state.match_mode.display_text(),
        party_size: state.party_size,
        party_max: PARTY_MAX,
    };
    details = render_template_or_default(&template_pair.details, details, &render_context);
    state_text = render_template_or_default(&template_pair.state, state_text, &render_context);

    if start_timestamp.is_none()
        && let Some(session_start) = state.session_start_time {
            start_timestamp = Some(session_start as i64);
        }

    Some(DiscordActivity {
        details,
        state: state_text,
        large_image_key,
        large_image_text,
        small_image_key,
        small_image_text,
        start_timestamp,
        party_size,
    })
}

fn resolve_template_pair(
    state: &GameState,
    hero_overrides: &std::collections::HashMap<String, PresenceTextTemplates>,
    global_template_pair: &PresenceTextTemplatePair,
) -> PresenceTextTemplatePair {
    let Some(hero_key) = state.hero_key.as_deref() else {
        return global_template_pair.clone();
    };

    let Some(hero_templates) = hero_overrides.get(hero_key) else {
        return global_template_pair.clone();
    };

    let Some(hero_template_pair) =
        template_pair_for_phase(hero_templates, state.phase, state.in_party())
    else {
        return global_template_pair.clone();
    };

    PresenceTextTemplatePair {
        details: if hero_template_pair.details.trim().is_empty() {
            global_template_pair.details.clone()
        } else {
            hero_template_pair.details.clone()
        },
        state: if hero_template_pair.state.trim().is_empty() {
            global_template_pair.state.clone()
        } else {
            hero_template_pair.state.clone()
        },
    }
}

fn template_pair_for_phase(
    templates: &PresenceTextTemplates,
    phase: GamePhase,
    is_in_party: bool,
) -> Option<&PresenceTextTemplatePair> {
    match phase {
        GamePhase::MainMenu => Some(&templates.main_menu),
        GamePhase::Hideout => Some(&templates.solo_hideout),
        GamePhase::PartyHideout => Some(&templates.party_hideout),
        GamePhase::InQueue => Some(&templates.in_queue),
        GamePhase::MatchIntro | GamePhase::InMatch => {
            if is_in_party {
                Some(&templates.party_match)
            } else {
                Some(&templates.solo_match)
            }
        }
        GamePhase::PostMatch => Some(&templates.post_match),
        GamePhase::Spectating => Some(&templates.spectating),
        GamePhase::NotRunning => None,
    }
}

fn resolve_hero_asset(state: &GameState, codename: &str, hero_store: &HeroDataStore) -> String {
    let key = codename.to_lowercase();
    if (key == "werewolf" || key == "silver") && state.is_transformed {
        return "hero_werewolf_wolf".to_string();
    }
    hero_store.asset_key(&key)
}

struct TemplateRenderContext<'a> {
    hero: &'a str,
    hero_presence: &'a str,
    mode: &'a str,
    party_size: u32,
    party_max: u32,
}

fn render_template_or_default(
    template: &str,
    default_text: Option<String>,
    context: &TemplateRenderContext<'_>,
) -> Option<String> {
    if template.trim().is_empty() {
        return default_text;
    }

    let rendered = render_template(template, context);
    if rendered.is_empty() {
        return default_text;
    }

    Some(limit_activity_text(&rendered))
}

fn render_template(template: &str, context: &TemplateRenderContext<'_>) -> String {
    template
        .replace("{heroPresence}", context.hero_presence)
        .replace("{hero}", context.hero)
        .replace("{mode}", context.mode)
        .replace("{partySize}", &context.party_size.to_string())
        .replace("{partyMax}", &context.party_max.to_string())
        .trim()
        .to_string()
}

fn limit_activity_text(value: &str) -> String {
    value
        .chars()
        .take(DISCORD_ACTIVITY_TEXT_MAX_LEN)
        .collect::<String>()
}

#[cfg(test)]
mod tests {
    use super::build_presence;
    use crate::config::PresenceBuildConfig;
    use crate::hero_data::HeroDataStore;
    use crate::state::{GamePhase, GameState, MatchMode};
    use std::path::Path;

    fn default_config() -> PresenceBuildConfig {
        PresenceBuildConfig::default()
    }

    #[test]
    fn includes_discord_party_size_when_in_party() {
        let hero_store = HeroDataStore::new(Path::new("."));
        let mut state = GameState::new();
        state.phase = GamePhase::PartyHideout;
        state.party_size = 3;

        let presence = build_presence(&state, &hero_store, &default_config())
            .expect("presence should be built");

        assert_eq!(presence.party_size, Some([3, 6]));
    }

    #[test]
    fn omits_discord_party_size_when_solo() {
        let hero_store = HeroDataStore::new(Path::new("."));
        let mut state = GameState::new();
        state.phase = GamePhase::Hideout;

        let presence = build_presence(&state, &hero_store, &default_config())
            .expect("presence should be built");

        assert_eq!(presence.party_size, None);
    }

    #[test]
    fn builds_main_menu_presence() {
        let hero_store = HeroDataStore::new(Path::new("."));
        let mut state = GameState::new();
        state.phase = GamePhase::MainMenu;

        let presence = build_presence(&state, &hero_store, &default_config())
            .expect("presence should be built");

        assert_eq!(presence.details.as_deref(), Some("Main Menu"));
        assert_eq!(presence.large_image_key.as_deref(), Some("deadlock_logo"));
    }

    #[test]
    fn renders_custom_hideout_template_with_api_fallback_context() {
        let hero_store = HeroDataStore::new(Path::new("."));
        let mut config = PresenceBuildConfig::default();
        config.templates.solo_hideout.details = "{hero}: {heroPresence}".to_string();
        config.templates.solo_hideout.state = "Solo {partySize}/{partyMax}".to_string();

        let mut state = GameState::new();
        state.phase = GamePhase::Hideout;
        state.set_hero("geist");

        let presence =
            build_presence(&state, &hero_store, &config).expect("presence should be built");

        assert_eq!(
            presence.details.as_deref(),
            Some("Lady Geist: Being Fabulous in the Hideout")
        );
        assert_eq!(presence.state.as_deref(), Some("Solo 1/6"));
    }

    #[test]
    fn empty_templates_preserve_defaults() {
        let hero_store = HeroDataStore::new(Path::new("."));
        let mut config = PresenceBuildConfig::default();
        config.templates.solo_hideout.details = "   ".to_string();

        let mut state = GameState::new();
        state.phase = GamePhase::Hideout;
        state.set_hero("geist");

        let presence =
            build_presence(&state, &hero_store, &config).expect("presence should be built");

        assert_eq!(
            presence.details.as_deref(),
            Some("Being Fabulous in the Hideout")
        );
    }

    #[test]
    fn applies_hero_template_overrides_with_global_fallback() {
        let hero_store = HeroDataStore::new(Path::new("."));
        let mut config = PresenceBuildConfig::default();
        config.templates.solo_hideout.details = "Global {hero}".to_string();
        config.templates.solo_hideout.state = "Global {partyMax}".to_string();

        let mut hero_templates = crate::config::PresenceTextTemplates::default();
        hero_templates.solo_hideout.details = "Hero {heroPresence}".to_string();
        config
            .hero_overrides
            .insert("geist".to_string(), hero_templates);

        let mut state = GameState::new();
        state.phase = GamePhase::Hideout;
        state.set_hero("geist");

        let presence =
            build_presence(&state, &hero_store, &config).expect("presence should be built");

        assert_eq!(
            presence.details.as_deref(),
            Some("Hero Being Fabulous in the Hideout")
        );
        assert_eq!(presence.state.as_deref(), Some("Global 6"));
    }

    #[test]
    fn renders_match_templates_by_party_variant() {
        let hero_store = HeroDataStore::new(Path::new("."));
        let mut config = PresenceBuildConfig::default();
        config.templates.party_match.details = "{mode} with {hero}".to_string();
        config.templates.party_match.state = "Party {partySize}/{partyMax}".to_string();

        let mut state = GameState::new();
        state.set_hero("abrams");
        state.set_party_size(4);
        state.start_match(MatchMode::Ranked);

        let presence =
            build_presence(&state, &hero_store, &config).expect("presence should be built");

        assert_eq!(
            presence.details.as_deref(),
            Some("Playing Ranked (6v6) with Abrams")
        );
        assert_eq!(presence.state.as_deref(), Some("Party 4/6"));
    }
}
