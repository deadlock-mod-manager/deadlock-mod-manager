-- Sync upserts rewrite name, author and description on every page, mostly
-- with the same text. Each reindex deletes by UNINDEXED key columns, which
-- scans the whole FTS table, so only reindex when the text changed.
DROP TRIGGER IF EXISTS submission_fts_update;
CREATE TRIGGER submission_fts_update AFTER UPDATE OF name, author, description ON submission
WHEN old.name IS NOT new.name
  OR old.author IS NOT new.author
  OR old.description IS NOT new.description
BEGIN
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
