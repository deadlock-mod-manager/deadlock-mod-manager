-- Store tabs always filter by submission type, which the original
-- (is_tombstoned, column) indexes cannot use alongside the sort.
CREATE INDEX submission_browse_type_downloads
  ON submission(is_tombstoned, submission_type, download_count DESC);
CREATE INDEX submission_browse_type_updated
  ON submission(is_tombstoned, submission_type, remote_updated_at DESC);
CREATE INDEX submission_browse_type_likes
  ON submission(is_tombstoned, submission_type, likes DESC);
CREATE INDEX submission_browse_type_added
  ON submission(is_tombstoned, submission_type, remote_added_at DESC);
