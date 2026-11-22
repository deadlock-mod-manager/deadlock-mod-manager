-- As in 0064: plain CREATE INDEX blocks token writes while it builds, and the
-- migrator runs in a transaction, so it can't build CONCURRENTLY. On a large
-- production table, create the index CONCURRENTLY by hand first; this
-- statement then skips it.
CREATE INDEX IF NOT EXISTS "idx_oauth_refresh_token_rotated_at" ON "oauth_refresh_token" USING btree ("rotated_at");
