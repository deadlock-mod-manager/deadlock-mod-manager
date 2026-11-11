DROP TRIGGER IF EXISTS submission_fts_update;
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
