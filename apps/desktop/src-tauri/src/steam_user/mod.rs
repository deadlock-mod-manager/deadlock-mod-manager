//! Identifies the Steam account the user is currently signed in with, without any
//! credentials: `loginusers.vdf` lists the remembered accounts, and the mtime of
//! `userdata/<account_id>/config/localconfig.vdf` tells which of them Steam is
//! actively writing for. Both paths exist verbatim on Windows, Linux and macOS, so
//! there is a single code path (no registry lookup).

use std::path::Path;

use serde::Serialize;

use crate::match_sync::auth::{RememberedAccount, remembered_accounts};

const DEADLOCK_APP_ID: u32 = 1_422_450;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamAccountDto {
  /// Steam3 account id - the id deadlock-api takes as `account_id`.
  pub account_id: u32,
  /// A SteamID64 exceeds `Number.MAX_SAFE_INTEGER`, so it crosses the bridge as text.
  pub steam_id64: String,
  pub account_name: String,
  pub persona_name: Option<String>,
  /// True for exactly one account: the best guess at "signed in right now".
  pub is_active: bool,
  /// Whether this account has local Deadlock user data.
  pub has_deadlock: bool,
  /// Unix seconds of the most recent sign of life, `None` when nothing is known.
  pub last_seen: Option<i64>,
}

/// What the filesystem knows about one account, split out so the ranking can be
/// unit-tested without a Steam installation.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct AccountActivity {
  /// mtime of `userdata/<account_id>/config/localconfig.vdf`, in unix seconds.
  pub local_config_mtime: Option<i64>,
  pub has_deadlock: bool,
}

fn account_id_of(steam_id64: u64) -> u32 {
  (steam_id64 & 0xFFFF_FFFF) as u32
}

/// Sorts by "who did Steam touch last", then falls back to the flags Steam writes
/// into `loginusers.vdf`. The first entry is marked active.
pub fn rank_accounts(
  accounts: Vec<RememberedAccount>,
  activity: impl Fn(u32) -> AccountActivity,
) -> Vec<SteamAccountDto> {
  let mut ranked: Vec<(SteamAccountDto, RememberedAccount)> = accounts
    .into_iter()
    .map(|account| {
      let account_id = account_id_of(account.steam_id64);
      let probe = activity(account_id);
      // The session file is written while signed in, the vdf timestamp only at
      // login - whichever is newer is the better "last seen".
      let last_seen = probe
        .local_config_mtime
        .into_iter()
        .chain((account.timestamp > 0).then_some(account.timestamp))
        .max();
      (
        SteamAccountDto {
          account_id,
          steam_id64: account.steam_id64.to_string(),
          account_name: account.account_name.clone(),
          persona_name: account.persona_name.clone(),
          is_active: false,
          has_deadlock: probe.has_deadlock,
          last_seen,
        },
        account,
      )
    })
    .collect();

  ranked.sort_by(|(a_dto, a), (b_dto, b)| {
    b_dto
      .last_seen
      .cmp(&a_dto.last_seen)
      .then(b.most_recent.cmp(&a.most_recent))
      .then(b.auto_login.cmp(&a.auto_login))
      .then(b_dto.has_deadlock.cmp(&a_dto.has_deadlock))
      .then(a_dto.account_id.cmp(&b_dto.account_id))
  });

  let mut accounts: Vec<SteamAccountDto> = ranked.into_iter().map(|(dto, _)| dto).collect();
  if let Some(first) = accounts.first_mut() {
    first.is_active = true;
  }
  accounts
}

fn probe_activity(steam_dir: &Path, account_id: u32) -> AccountActivity {
  let user_dir = steam_dir.join("userdata").join(account_id.to_string());
  let local_config_mtime = std::fs::metadata(user_dir.join("config").join("localconfig.vdf"))
    .and_then(|meta| meta.modified())
    .ok()
    .and_then(|time| {
      time
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs() as i64)
    });

  AccountActivity {
    local_config_mtime,
    has_deadlock: user_dir.join(DEADLOCK_APP_ID.to_string()).is_dir(),
  }
}

/// Every remembered Steam account, most recently used first. Empty when Steam or
/// `loginusers.vdf` cannot be read - the UI then asks for an account id instead of
/// showing an error.
pub fn list_accounts() -> Vec<SteamAccountDto> {
  let steam = match steamlocate::SteamDir::locate() {
    Ok(steam) => steam,
    Err(e) => {
      log::warn!("cannot locate Steam for account detection: {e}");
      return Vec::new();
    }
  };
  let steam_dir = steam.path().to_path_buf();

  match remembered_accounts(&steam_dir) {
    Ok(accounts) => rank_accounts(accounts, |account_id| {
      probe_activity(&steam_dir, account_id)
    }),
    Err(e) => {
      log::warn!("cannot read remembered Steam accounts: {e}");
      Vec::new()
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn account(steam_id64: u64, name: &str) -> RememberedAccount {
    RememberedAccount {
      steam_id64,
      account_name: name.to_owned(),
      persona_name: Some(name.to_uppercase()),
      most_recent: false,
      auto_login: false,
      timestamp: 0,
    }
  }

  const ALICE: u64 = 76561198371579856;
  const BOB: u64 = 76561198000000000;

  #[test]
  fn picks_the_account_with_the_freshest_session_file() {
    let ranked = rank_accounts(
      vec![
        RememberedAccount {
          timestamp: 2_000,
          auto_login: true,
          ..account(BOB, "bob")
        },
        RememberedAccount {
          timestamp: 1_000,
          ..account(ALICE, "alice")
        },
      ],
      |account_id| AccountActivity {
        // Alice is signed in right now, even though Bob holds the AutoLogin flag.
        local_config_mtime: (account_id == account_id_of(ALICE)).then_some(9_000),
        has_deadlock: true,
      },
    );

    assert_eq!(ranked[0].account_name, "alice");
    assert!(ranked[0].is_active);
    assert_eq!(ranked[0].last_seen, Some(9_000));
    assert!(!ranked[1].is_active);
    // Bob has no session file, so his login timestamp stands in for it.
    assert_eq!(ranked[1].last_seen, Some(2_000));
  }

  #[test]
  fn falls_back_to_flags_when_no_session_file_exists() {
    let ranked = rank_accounts(
      vec![
        account(BOB, "bob"),
        RememberedAccount {
          most_recent: true,
          ..account(ALICE, "alice")
        },
      ],
      |_| AccountActivity::default(),
    );

    assert_eq!(ranked[0].account_name, "alice");
    assert!(ranked[0].is_active);
  }

  #[test]
  fn exposes_the_steam3_account_id_and_a_string_steam_id64() {
    let ranked = rank_accounts(vec![account(ALICE, "alice")], |_| {
      AccountActivity::default()
    });

    assert_eq!(ranked[0].account_id, 411_314_128);
    assert_eq!(ranked[0].steam_id64, "76561198371579856");
    assert_eq!(ranked[0].last_seen, None);
  }

  #[test]
  fn marks_exactly_one_account_active() {
    let ranked = rank_accounts(vec![account(ALICE, "alice"), account(BOB, "bob")], |_| {
      AccountActivity::default()
    });

    assert_eq!(ranked.iter().filter(|a| a.is_active).count(), 1);
  }

  #[test]
  fn handles_an_empty_installation() {
    assert!(rank_accounts(Vec::new(), |_| AccountActivity::default()).is_empty());
  }
}
