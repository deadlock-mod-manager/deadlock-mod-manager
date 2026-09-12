CREATE TABLE update_cache (
  provider TEXT NOT NULL,
  submission_type TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (provider, submission_type, submission_id)
);
