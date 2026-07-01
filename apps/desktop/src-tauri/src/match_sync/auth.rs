//! Local Steam session recovery: read the `local.vdf` ConnectCache blob and decrypt
//! the refresh-token JWT (AES on Linux/macOS, DPAPI on Windows) per `user-auth.md`.
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

// The auth file location differs on Windows (see user-auth.md).
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

pub fn all_account_ids(steam_dir: &Path) -> Result<Vec<(u64, String)>, MatchSyncError> {
  let path = steam_dir.join("config").join("loginusers.vdf");
  let text = std::fs::read_to_string(&path)
    .map_err(|e| err(format!("cannot read loginusers.vdf: {e}")))?;
  let vdf = keyvalues_parser::parse(&text)
    .map(Vdf::from)
    .map_err(|e| err(format!("cannot parse loginusers.vdf: {e}")))?;
  let users = vdf
    .value
    .get_obj()
    .ok_or_else(|| err("loginusers.vdf has no users"))?;

  let mut accounts = Vec::new();
  for (key, entries) in users.iter() {
    let Ok(steam_id64) = key.parse::<u64>() else {
      log::warn!("skipping loginusers.vdf block with non-numeric key: {key}");
      continue;
    };
    let Some(name) = entries
      .first()
      .and_then(|user| child(user, "AccountName"))
      .and_then(Value::get_str)
    else {
      log::warn!("skipping loginusers.vdf block {steam_id64} with no AccountName");
      continue;
    };
    accounts.push((steam_id64, name.to_lowercase()));
  }
  Ok(accounts)
}

// Self-locating wrapper over `all_account_ids`: every account remembered in
// `loginusers.vdf`, regardless of current decryptability. Startup-only pruning uses
// this so temporarily non-decryptable accounts are NOT treated as forgotten.
pub fn all_remembered_accounts() -> Result<Vec<(u64, String)>, MatchSyncError> {
  let steam = steamlocate::SteamDir::locate()
    .map_err(|e| err(format!("Steam not found: {e}")))?;
  all_account_ids(steam.path())
}

pub fn list_available_accounts() -> Result<Vec<(u64, String)>, MatchSyncError> {
  let steam = steamlocate::SteamDir::locate()
    .map_err(|e| err(format!("Steam not found: {e}")))?;
  let steam_dir = steam.path();
  let local_vdf = local_vdf_path(steam_dir)?;
  let text = std::fs::read_to_string(&local_vdf)
    .map_err(|e| err(format!("cannot read local.vdf: {e}")))?;
  let vdf = keyvalues_parser::parse(&text)
    .map(Vdf::from)
    .map_err(|e| err(format!("cannot parse local.vdf: {e}")))?;

  let mut available = Vec::new();
  for (steam_id64, account_name) in all_account_ids(steam_dir)? {
    match connect_cache_hex(&vdf, &account_name) {
      Ok(Some(_)) => available.push((steam_id64, account_name)),
      Ok(None) => {}
      Err(e) => log::warn!("cannot check ConnectCache for {account_name}: {e}"),
    }
  }
  Ok(available)
}

pub fn recover_all() -> Result<Vec<AuthContext>, MatchSyncError> {
  let steam = steamlocate::SteamDir::locate()
    .map_err(|e| err(format!("Steam not found: {e}")))?;
  let steam_dir = steam.path();
  let local_vdf = local_vdf_path(steam_dir)?;
  let text = std::fs::read_to_string(&local_vdf)
    .map_err(|e| err(format!("cannot read local.vdf: {e}")))?;
  let vdf = keyvalues_parser::parse(&text)
    .map(Vdf::from)
    .map_err(|e| err(format!("cannot parse local.vdf: {e}")))?;

  let mut contexts = Vec::new();
  for (steam_id64, account_name) in all_account_ids(steam_dir)? {
    let recovered = connect_cache_blob(&vdf, &account_name)
      .and_then(|blob| decrypt_blob(&blob, &account_name))
      .and_then(|jwt| steam_id_from_jwt(&jwt).map(|sub| (jwt, sub)));
    match recovered {
      Ok((refresh_token, sub)) if sub == steam_id64 => contexts.push(AuthContext {
        account_name,
        steam_id64,
        refresh_token,
      }),
      // The ConnectCache lookup is keyed by account name, not steam_id64 - reject a
      // blob whose token identity doesn't match the loginusers.vdf entry it came from.
      Ok(_) => log::warn!(
        "skipping account {account_name}: token identity does not match loginusers.vdf entry"
      ),
      Err(e) => log::warn!("skipping account {account_name}: {e}"),
    }
  }

  if contexts.is_empty() {
    return Err(err("no remembered Steam account found"));
  }
  Ok(contexts)
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
  let cipher = Aes256::new_from_slice(key.as_slice())
    .map_err(|e| err(format!("aes key error: {e}")))?;
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
  let mut data_in = CRYPT_INTEGER_BLOB {
    cbData: blob.len() as u32,
    pbData: blob.as_ptr() as *mut u8,
  };
  let entropy_bytes = account.as_bytes();
  let mut entropy = CRYPT_INTEGER_BLOB {
    cbData: entropy_bytes.len() as u32,
    pbData: entropy_bytes.as_ptr() as *mut u8,
  };
  let mut data_out = CRYPT_INTEGER_BLOB::default();

  unsafe {
    CryptUnprotectData(
      &mut data_in,
      None,
      Some(&mut entropy),
      None,
      None,
      0,
      &mut data_out,
    )
    .map_err(|e| err(format!("DPAPI decrypt failed: {e}")))?;

    let slice = std::slice::from_raw_parts(data_out.pbData, data_out.cbData as usize);
    let token = String::from_utf8(slice.to_vec())
      .map_err(|e| err(format!("token is not valid UTF-8: {e}")));
    let _ = LocalFree(HLOCAL(data_out.pbData as *mut core::ffi::c_void));
    token
  }
}

fn steam_id_from_jwt(jwt: &str) -> Result<u64, MatchSyncError> {
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
  json
    .get("sub")
    .and_then(serde_json::Value::as_str)
    .and_then(|s| s.parse::<u64>().ok())
    .ok_or_else(|| err("token has no SteamID"))
}
