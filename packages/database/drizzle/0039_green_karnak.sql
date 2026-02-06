CREATE INDEX "idx_account_account_id" ON "account" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_access_token_on_refresh_token" ON "oauth_access_token" USING btree ("refresh_token");--> statement-breakpoint
CREATE INDEX "idx_mirrored_files_mod_download_id" ON "mirrored_files" USING btree ("mod_download_id");--> statement-breakpoint
CREATE INDEX "idx_mod_blacklisted_remote_updated" ON "mod" USING btree ("is_blacklisted","remote_updated_at");