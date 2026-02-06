DROP INDEX "idx_oauth_access_token_on_access_token";--> statement-breakpoint
DROP INDEX "idx_oauth_access_token_on_refresh_token";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_oauth_access_token_on_access_token" ON "oauth_access_token" USING btree ("access_token");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_oauth_access_token_on_refresh_token" ON "oauth_access_token" USING btree ("refresh_token");