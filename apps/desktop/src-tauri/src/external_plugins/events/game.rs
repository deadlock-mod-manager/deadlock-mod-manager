use super::{host, publish};
use crate::app_runtime::AppHandle;
use crate::live_match::LivePhase;
use deadlock_discord_presence::{GamePhase, GameState};
use dmm_plugin_runtime::{
  PluginHost,
  event_contract::{
    GameActivity, GameHero, GameLifecycle, GameParty, HostEventData, HostEventType, MatchIdentity,
    MatchPhaseChange, Matchmaking, Scoreboard, ScoreboardPlayer, SessionOutcome,
  },
};
use std::sync::{
  Arc, LazyLock, Mutex,
  atomic::{AtomicBool, Ordering},
};
use std::time::Duration;

static STATE: LazyLock<Mutex<Option<GameState>>> = LazyLock::new(Mutex::default);
static RUNNING: AtomicBool = AtomicBool::new(false);
const OBSERVED_TYPES: &[HostEventType] = &[
  HostEventType::GameStarted,
  HostEventType::GameExited,
  HostEventType::GameActivityChanged,
  HostEventType::GameHeroChanged,
  HostEventType::GamePartyChanged,
  HostEventType::MatchmakingStarted,
  HostEventType::MatchmakingStopped,
  HostEventType::MatchJoined,
  HostEventType::MatchPhaseChanged,
  HostEventType::MatchLeft,
  HostEventType::MatchScoreboardUpdated,
];

pub fn start(host: &Arc<PluginHost>, app: AppHandle) {
  if cfg!(feature = "cef") || !cfg!(windows) {
    return;
  }
  let weak = Arc::downgrade(host);
  if let Err(error) = std::thread::Builder::new()
    .name("plugin-game-observations".into())
    .spawn(move || {
      let mut monitoring = false;
      let mut seed_live = false;
      loop {
        let Some(host) = weak.upgrade() else { break };
        let desired = host.wants_events(OBSERVED_TYPES);
        if desired && !monitoring {
          seed_live = true;
          if crate::game_presence::is_running() {
            let current = STATE
              .lock()
              .unwrap_or_else(|error| error.into_inner())
              .clone();
            if let Some(current) = current {
              observe_state(&current, true);
            }
          } else {
            RUNNING.store(false, Ordering::Relaxed);
          }
        }
        if (desired || monitoring)
          && let Err(error) = crate::game_presence::set_plugin_monitoring(&app, desired)
        {
          log::debug!("[ExternalPlugins] Game observations unavailable: {error}");
        }
        monitoring = desired;
        if desired
          && RUNNING.load(Ordering::Relaxed)
          && let Some(path) =
            crate::live_match::cached_game_path(crate::game_presence::resolve_game_path)
        {
          crate::live_match::status(&path);
          if seed_live {
            crate::live_match::seed_observation();
            seed_live = false;
          }
        }
        drop(host);
        std::thread::sleep(Duration::from_secs(2));
      }
      let _ = crate::game_presence::set_plugin_monitoring(&app, false);
    })
  {
    log::warn!("[ExternalPlugins] Could not start game observations: {error}");
  }
}

fn observe(event: HostEventData, replay: bool, operation: Option<String>) {
  if replay {
    publish(event, operation);
  } else if let Some(host) = host() {
    host.seed_event(event);
  }
}

pub fn observe_state(state: &GameState, initial: bool) {
  let mut previous = STATE.lock().unwrap_or_else(|error| error.into_inner());
  let old = previous.as_ref();
  let running = state.phase != GamePhase::NotRunning;
  if initial || old.is_none_or(|old| (old.phase != GamePhase::NotRunning) != running) {
    observe(
      if running {
        HostEventData::GameStarted(GameLifecycle { session_id: None })
      } else {
        HostEventData::GameExited(GameLifecycle { session_id: None })
      },
      !initial,
      None,
    );
    if !running {
      crate::live_match::reset_observation(!initial);
    }
  }
  RUNNING.store(running, Ordering::Relaxed);
  if initial
    || old.is_none_or(|old| {
      old.phase != state.phase
        || old.match_mode != state.match_mode
        || old.map_name != state.map_name
    })
  {
    observe(
      HostEventData::GameActivityChanged(GameActivity {
        phase: format!("{:?}", state.phase),
        match_mode: format!("{:?}", state.match_mode),
        map_name: state.map_name.clone(),
      }),
      !initial,
      None,
    );
  }
  if initial
    || old.is_none_or(|old| {
      old.hero_key != state.hero_key || old.is_transformed != state.is_transformed
    })
  {
    observe(
      HostEventData::GameHeroChanged(GameHero {
        hero_key: state.hero_key.clone(),
        transformed: state.is_transformed,
      }),
      !initial,
      None,
    );
  }
  if initial || old.is_none_or(|old| old.party_size != state.party_size) {
    observe(
      HostEventData::GamePartyChanged(GameParty {
        size: state.party_size,
      }),
      !initial,
      None,
    );
  }
  *previous = Some(state.clone());
}

fn identity(live: &crate::live_match::LiveMatch) -> MatchIdentity {
  MatchIdentity {
    match_id: live.match_id.clone(),
    lobby_id: live.lobby_id.clone(),
  }
}

pub fn observe_live(before: &LivePhase, after: &LivePhase, replay: bool) {
  if !RUNNING.load(Ordering::Relaxed) {
    return;
  }
  for event in live_changes(before, after) {
    observe(
      event,
      replay,
      after
        .current
        .as_ref()
        .map(|live| format!("match:{}", live.match_id)),
    );
  }
}

fn live_changes(before: &LivePhase, after: &LivePhase) -> Vec<HostEventData> {
  let mut events = Vec::new();
  if before.queued_since != after.queued_since {
    let queue = Matchmaking {
      queued_since: after.queued_since,
    };
    events.push(if after.queued_since.is_some() {
      HostEventData::MatchmakingStarted(queue)
    } else {
      HostEventData::MatchmakingStopped(queue)
    });
  }
  let same_match = before.current.as_ref().map(|live| &live.lobby_id)
    == after.current.as_ref().map(|live| &live.lobby_id);
  if !same_match {
    if let Some(live) = &before.current {
      events.push(HostEventData::MatchLeft(identity(live)));
    }
    if let Some(live) = &after.current {
      events.push(HostEventData::MatchJoined(identity(live)));
    }
  }
  if let Some(live) = &after.current
    && (!same_match
      || before
        .current
        .as_ref()
        .is_none_or(|old| old.phase != live.phase))
  {
    events.push(HostEventData::MatchPhaseChanged(MatchPhaseChange {
      match_id: live.match_id.clone(),
      phase: match live.phase {
        crate::live_match::GamePhase::Pregame => "pregame",
        crate::live_match::GamePhase::InProgress => "inProgress",
        crate::live_match::GamePhase::Ended => "ended",
      }
      .into(),
    }));
  }
  let board = after.scoreboard();
  if board != before.scoreboard() {
    let players = |team: &str, players: &[crate::live_bridge::protocol::LiveScoreboardPlayer]| {
      players
        .iter()
        .enumerate()
        .map(|(index, player)| ScoreboardPlayer {
          slot: format!("{team}:{index}"),
          hero_id: player.hero_id,
          souls: player.souls,
          level: player.level,
          kills: player.kills,
          deaths: player.deaths,
          assists: player.assists,
          objective_damage: player.objective_damage,
          is_local: player.is_local,
          is_dead: player.is_dead,
        })
        .collect()
    };
    events.push(HostEventData::MatchScoreboardUpdated(Scoreboard {
      match_id: after.current.as_ref().map(|live| live.match_id.clone()),
      clock_seconds: board.as_ref().and_then(|board| board.clock_seconds),
      reported_at: board.as_ref().and_then(|board| board.reported_at),
      friendly: board
        .as_ref()
        .map(|board| players("friendly", &board.friendly))
        .unwrap_or_default(),
      enemy: board
        .as_ref()
        .map(|board| players("enemy", &board.enemy))
        .unwrap_or_default(),
    }));
  }
  events
}

pub fn session_classified(report: &crate::game_session::types::SessionReport) {
  publish(
    HostEventData::SessionClassified(SessionOutcome {
      session_id: report.session_id.clone(),
      classification: format!("{:?}", report.classification),
    }),
    Some(format!("session:{}", report.session_id)),
  );
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn exports_only_hud_values_without_names_or_account_ids() {
    let log = r#"Lobby 1 for Match 42 created
[DMM-LIVE] {"v":2,"side":"friendly","clock":"1:02","players":[{"n":"PrivateName","hid":13,"s":"1.2k","l":4,"k":1,"d":0,"a":2,"o":null,"me":true,"dead":false}]}
"#;
    let phase = crate::live_match::fold_phase(log, LivePhase::default());
    let events = live_changes(&LivePhase::default(), &phase);
    let json = serde_json::to_string(&events).unwrap();
    assert!(!json.contains("PrivateName"));
    assert!(!json.contains("accountId"));
    assert!(events.iter().any(
      |event| matches!(event, HostEventData::MatchScoreboardUpdated(board)
      if board.friendly.len() == 1 && board.friendly[0].souls == Some(1200))
    ));
  }
}
