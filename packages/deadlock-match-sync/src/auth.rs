//! Local Steam session recovery: read the `local.vdf` ConnectCache blob and decrypt
//! the refresh-token JWT (AES on Linux/macOS, DPAPI on Windows).
//! The token is a live account credential: in-memory only, never logged/persisted/sent.

use std::path::{Path, PathBuf};

use base64::Engine;
use keyvalues_parser::{Value, Vdf};

use super::error::MatchSyncError;
use super::model::AuthContext;

pub trait SteamAuthProvider: Send + Sync {
  fn recover(&self) -> Result<AuthContext, MatchSyncError>;
}

pub struct FixedAccountAuth(pub AuthContext);

impl SteamAuthProvider for FixedAccountAuth {
  fn recover(&self) -> Result<AuthContext, MatchSyncError> {
    Ok(self.0.clone())
  }
}

fn err(msg: impl Into<String>) -> MatchSyncError {
  MatchSyncError::AuthUnavailable(msg.into())
}

fn child<'a>(value: &'a Value<'a>, key: &str) -> Option<&'a Value<'a>> {
  value.get_obj()?.get(key)?.first()
}

// The auth file location differs on Windows.
#[cfg(windows)]
fn local_vdf_path(_steam_dir: &Path) -> Result<PathBuf, MatchSyncError> {
  dirs::data_local_dir()
    .map(|d| d.join("Steam").join("local.vdf"))
    .ok_or_else(|| err("could not resolve %LOCALAPPDATA%"))
}

#[cfg(not(windows))]
fn local_vdf_path(steam_dir: &Path) -> Result<PathBuf, MatchSyncError> {
  Ok(steam_dir.join("local.vdf"))
}

fn read_local_vdf(steam_dir: &Path) -> Result<String, MatchSyncError> {
  let local_vdf = local_vdf_path(steam_dir)?;
  std::fs::read_to_string(&local_vdf).map_err(|e| err(format!("cannot read local.vdf: {e}")))
}

fn parse_local_vdf(text: &str) -> Result<Vdf<'_>, MatchSyncError> {
  keyvalues_parser::parse(text)
    .map(Vdf::from)
    .map_err(|e| err(format!("cannot parse local.vdf: {e}")))
}

// Of the remembered `accounts` (SteamID64, lowercase account name), the ones with a
// usable session. Quiet about the rest, since the status is read often.
pub fn list_available_accounts(
  steam_dir: &Path,
  accounts: Vec<(u64, String)>,
) -> Result<Vec<(u64, String)>, MatchSyncError> {
  let text = read_local_vdf(steam_dir)?;
  let vdf = parse_local_vdf(&text)?;
  let now = now_secs();

  Ok(
    accounts
      .into_iter()
      .filter(|(steam_id64, account_name)| {
        recover_session(&vdf, *steam_id64, account_name, now).is_ok()
      })
      .collect(),
  )
}

// The usable session of each remembered account (SteamID64, lowercase account name).
pub fn recover_all(
  steam_dir: &Path,
  accounts: Vec<(u64, String)>,
) -> Result<Vec<AuthContext>, MatchSyncError> {
  let text = read_local_vdf(steam_dir)?;
  let vdf = parse_local_vdf(&text)?;
  let now = now_secs();

  let mut contexts = Vec::new();
  for (steam_id64, account_name) in accounts {
    match recover_session(&vdf, steam_id64, &account_name, now) {
      Ok(refresh_token) => contexts.push(AuthContext {
        account_name,
        steam_id64,
        refresh_token,
      }),
      Err(e) => log::warn!("skipping account {account_name}: {e}"),
    }
  }

  if contexts.is_empty() {
    return Err(err("no remembered Steam account found"));
  }
  Ok(contexts)
}

fn now_secs() -> i64 {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map_or(0, |d| d.as_secs() as i64)
}

// The account's refresh token, if Steam keeps one this user can decrypt and it is usable.
fn recover_session(
  vdf: &Vdf,
  steam_id64: u64,
  account_name: &str,
  now: i64,
) -> Result<String, MatchSyncError> {
  let blob = connect_cache_blob(vdf, account_name)?;
  let jwt = decrypt_blob(&blob, account_name)?;
  check_token(&jwt, steam_id64, now)?;
  Ok(jwt)
}

// `local.vdf` is read and parsed once per caller (`list_available_accounts`/
// `recover_all`) and shared across every account's lookup in that call's loop.
fn connect_cache_hex(vdf: &Vdf, account: &str) -> Result<Option<String>, MatchSyncError> {
  let cache = ["Software", "Valve", "Steam", "ConnectCache"]
    .into_iter()
    .try_fold(&vdf.value, child)
    .and_then(Value::get_obj)
    .ok_or_else(|| err("no ConnectCache in local.vdf (logged out or 'remember me' off)"))?;

  let prefix = format!("{:08x}", crc32fast::hash(account.as_bytes()));
  Ok(
    cache
      .iter()
      .find(|(subkey, _)| subkey.starts_with(&prefix))
      .and_then(|(_, values)| values.first())
      .and_then(Value::get_str)
      .map(str::to_owned),
  )
}

fn connect_cache_blob(vdf: &Vdf, account: &str) -> Result<Vec<u8>, MatchSyncError> {
  let hex_value = connect_cache_hex(vdf, account)?
    .ok_or_else(|| err("no ConnectCache entry for this account"))?;
  hex::decode(hex_value).map_err(|e| err(format!("invalid ConnectCache hex: {e}")))
}

#[cfg(not(windows))]
fn decrypt_blob(blob: &[u8], account: &str) -> Result<String, MatchSyncError> {
  use aes::Aes256;
  use aes::cipher::{
    BlockDecrypt, BlockDecryptMut, KeyInit, KeyIvInit, block_padding::Pkcs7,
    generic_array::GenericArray,
  };
  use sha2::{Digest, Sha256};

  if blob.len() < 32 {
    return Err(err("ConnectCache blob too short"));
  }
  let key = Sha256::digest(account.as_bytes());

  // The first block is the real IV, encrypted with AES-256-ECB.
  let cipher =
    Aes256::new_from_slice(key.as_slice()).map_err(|e| err(format!("aes key error: {e}")))?;
  let mut iv = GenericArray::clone_from_slice(&blob[0..16]);
  cipher.decrypt_block(&mut iv);

  let plaintext = cbc::Decryptor::<Aes256>::new_from_slices(key.as_slice(), iv.as_slice())
    .map_err(|e| err(format!("aes iv error: {e}")))?
    .decrypt_padded_vec_mut::<Pkcs7>(&blob[16..])
    .map_err(|e| err(format!("aes decrypt failed: {e}")))?;

  String::from_utf8(plaintext).map_err(|e| err(format!("token is not valid UTF-8: {e}")))
}

#[cfg(windows)]
fn decrypt_blob(blob: &[u8], account: &str) -> Result<String, MatchSyncError> {
  use windows::Win32::Foundation::{HLOCAL, LocalFree};
  use windows::Win32::Security::Cryptography::{CRYPT_INTEGER_BLOB, CryptUnprotectData};

  // DPAPI with the ASCII account name as the mandatory optional entropy.
  let data_in = CRYPT_INTEGER_BLOB {
    cbData: blob.len() as u32,
    pbData: blob.as_ptr() as *mut u8,
  };
  let entropy_bytes = account.as_bytes();
  let entropy = CRYPT_INTEGER_BLOB {
    cbData: entropy_bytes.len() as u32,
    pbData: entropy_bytes.as_ptr() as *mut u8,
  };
  let mut data_out = CRYPT_INTEGER_BLOB::default();

  unsafe {
    CryptUnprotectData(&data_in, None, Some(&entropy), None, None, 0, &mut data_out)
      .map_err(|e| err(format!("DPAPI decrypt failed: {e}")))?;

    let slice = std::slice::from_raw_parts(data_out.pbData, data_out.cbData as usize);
    let token =
      String::from_utf8(slice.to_vec()).map_err(|e| err(format!("token is not valid UTF-8: {e}")));
    let _ = LocalFree(HLOCAL(data_out.pbData as *mut core::ffi::c_void));
    token
  }
}

// Steam keeps the session of a remembered account after its token expires; logging in
// with it only fails.
fn check_token(jwt: &str, steam_id64: u64, now: i64) -> Result<(), MatchSyncError> {
  let payload = jwt
    .split('.')
    .nth(1)
    .ok_or_else(|| err("token is not a JWT"))?;
  let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
    .decode(payload)
    .map_err(|e| err(format!("cannot decode token payload: {e}")))?;
  let json: serde_json::Value =
    serde_json::from_slice(&bytes).map_err(|e| err(format!("cannot parse token payload: {e}")))?;

  if json.get("iss").and_then(serde_json::Value::as_str) != Some("steam") {
    return Err(err("token issuer is not steam"));
  }
  let sub = json
    .get("sub")
    .and_then(serde_json::Value::as_str)
    .and_then(|s| s.parse::<u64>().ok())
    .ok_or_else(|| err("token has no SteamID"))?;
  // The ConnectCache lookup is keyed by account name, not steam_id64 - reject a
  // blob whose token identity doesn't match the loginusers.vdf entry it came from.
  if sub != steam_id64 {
    return Err(err("token identity does not match loginusers.vdf entry"));
  }
  if json
    .get("exp")
    .and_then(serde_json::Value::as_i64)
    .is_some_and(|exp| exp <= now)
  {
    return Err(err("saved Steam session expired; sign in to Steam again"));
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn an_expired_session_is_not_usable() {
    let jwt = |exp: i64| {
      let claims = format!(r#"{{"iss":"steam","sub":"76561198000000000","exp":{exp}}}"#);
      format!(
        "header.{}.signature",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(claims)
      )
    };
    assert!(check_token(&jwt(2_000), 76561198000000000, 1_000).is_ok());
    assert!(check_token(&jwt(1_000), 76561198000000000, 1_000).is_err());
  }
}
