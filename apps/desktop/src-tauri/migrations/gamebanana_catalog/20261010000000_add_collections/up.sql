-- Deadlock collections from GameBanana. items_* columns record which revision of the
-- collection its items were last crawled at, so unchanged collections are skipped.
CREATE TABLE collection (
  collection_id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  profile_url TEXT NOT NULL,
  cover_url TEXT,
  author TEXT NOT NULL DEFAULT 'Unknown',
  author_remote_id TEXT,
  author_avatar_url TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  is_nsfw INTEGER NOT NULL DEFAULT 0 CHECK (is_nsfw IN (0, 1)),
  remote_added_at INTEGER NOT NULL DEFAULT 0,
  remote_updated_at INTEGER NOT NULL DEFAULT 0,
  described_at INTEGER,
  items_synced_at INTEGER,
  items_item_count INTEGER,
  items_updated_at INTEGER,
  last_seen_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE collection_item (
  collection_id TEXT NOT NULL REFERENCES collection(collection_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  submission_type TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  PRIMARY KEY (collection_id, position)
);
