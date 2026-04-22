use std::sync::Mutex;

use vpkmerger::CancelToken;

use crate::errors::Error;

static ACTIVE_CANCEL: Mutex<Option<CancelToken>> = Mutex::new(None);

pub fn register_cancel(token: CancelToken) -> Result<(), Error> {
  let mut g = ACTIVE_CANCEL
    .lock()
    .map_err(|_| Error::InvalidInput("compression cancel lock".into()))?;
  let old = g.take();
  *g = Some(token);
  if let Some(t) = old {
    t.cancel();
  }
  Ok(())
}

pub fn clear_cancel() {
  if let Ok(mut g) = ACTIVE_CANCEL.lock() {
    *g = None;
  }
}

pub fn cancel_active() {
  if let Ok(mut g) = ACTIVE_CANCEL.lock()
    && let Some(t) = g.take()
  {
    t.cancel();
  }
}

pub struct CompressionCancelGuard;

impl Drop for CompressionCancelGuard {
  fn drop(&mut self) {
    clear_cancel();
  }
}

pub fn register_cancel_guarded(token: CancelToken) -> Result<CompressionCancelGuard, Error> {
  register_cancel(token)?;
  Ok(CompressionCancelGuard)
}
