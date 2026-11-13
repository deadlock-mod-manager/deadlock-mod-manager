-- Plain CREATE INDEX blocks token writes while it builds, and the migrator runs
-- in a transaction, so it can't build them CONCURRENTLY. On a large production
-- table, create both indexes CONCURRENTLY by hand first; these statements then
-- skip them.
CREATE INDEX IF NOT EXISTS "idx_oauth_access_token_expires_at" ON "oauth_access_token" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_oauth_refresh_token_expires_at" ON "oauth_refresh_token" USING btree ("expires_at");
