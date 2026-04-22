use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

pub trait ProgressSink: Send + Sync {
    fn report(&self, done: u64, total: u64);
}

pub struct NoProgress;

impl ProgressSink for NoProgress {
    fn report(&self, _done: u64, _total: u64) {}
}

#[derive(Clone)]
pub struct CancelToken {
    cancelled: Arc<AtomicBool>,
}

impl CancelToken {
    pub fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    pub fn check(&self) -> Result<(), crate::error::VpkMergerError> {
        if self.is_cancelled() {
            return Err(crate::error::VpkMergerError::Cancelled);
        }
        Ok(())
    }
}

impl Default for CancelToken {
    fn default() -> Self {
        Self::new()
    }
}
