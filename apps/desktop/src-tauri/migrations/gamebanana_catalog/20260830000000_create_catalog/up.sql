CREATE TABLE submission (
  provider TEXT NOT NULL,
  submission_type TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'Unknown',
  description TEXT NOT NULL DEFAULT '',
  profile_url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  hero TEXT,
  is_audio INTEGER NOT NULL DEFAULT 0 CHECK (is_audio IN (0, 1)),
  is_map INTEGER NOT NULL DEFAULT 0 CHECK (is_map IN (0, 1)),
  is_nsfw INTEGER NOT NULL DEFAULT 0 CHECK (is_nsfw IN (0, 1)),
  is_obsolete INTEGER NOT NULL DEFAULT 0 CHECK (is_obsolete IN (0, 1)),
  is_tombstoned INTEGER NOT NULL DEFAULT 0 CHECK (is_tombstoned IN (0, 1)),
  is_hydrated INTEGER NOT NULL DEFAULT 0 CHECK (is_hydrated IN (0, 1)),
  has_files INTEGER NOT NULL DEFAULT 0 CHECK (has_files IN (0, 1)),
  download_count INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  remote_added_at INTEGER NOT NULL DEFAULT 0,
  remote_updated_at INTEGER NOT NULL DEFAULT 0,
  files_updated_at INTEGER NOT NULL DEFAULT 0,
  last_seen_snapshot TEXT,
  PRIMARY KEY (provider, submission_type, submission_id)
);

CREATE INDEX submission_browse_updated
  ON submission(is_tombstoned, remote_updated_at DESC);
CREATE INDEX submission_browse_downloads
  ON submission(is_tombstoned, download_count DESC);
CREATE INDEX submission_filter_category
  ON submission(is_tombstoned, category);
CREATE INDEX submission_filter_hero
  ON submission(is_tombstoned, hero);

CREATE VIRTUAL TABLE submission_fts USING fts5(
  provider UNINDEXED,
  submission_type UNINDEXED,
  submission_id UNINDEXED,
  name,
  author,
  description,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER submission_fts_insert AFTER INSERT ON submission BEGIN
  INSERT INTO submission_fts(
    provider, submission_type, submission_id, name, author, description
  ) VALUES (
    new.provider, new.submission_type, new.submission_id,
    new.name, new.author, new.description
  );
END;

CREATE TRIGGER submission_fts_delete AFTER DELETE ON submission BEGIN
  DELETE FROM submission_fts
  WHERE provider = old.provider
    AND submission_type = old.submission_type
    AND submission_id = old.submission_id;
END;

CREATE TRIGGER submission_fts_update AFTER UPDATE OF name, author, description ON submission BEGIN
  DELETE FROM submission_fts
  WHERE provider = old.provider
    AND submission_type = old.submission_type
    AND submission_id = old.submission_id;
  INSERT INTO submission_fts(
    provider, submission_type, submission_id, name, author, description
  ) VALUES (
    new.provider, new.submission_type, new.submission_id,
    new.name, new.author, new.description
  );
END;

CREATE TABLE sync_cursor (
  submission_type TEXT PRIMARY KEY,
  next_page INTEGER NOT NULL DEFAULT 1,
  snapshot_id TEXT,
  snapshot_complete INTEGER NOT NULL DEFAULT 0 CHECK (snapshot_complete IN (0, 1)),
  high_water_mark INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
