DROP INDEX "idx_chat_message_session_id";--> statement-breakpoint
DROP INDEX "idx_chat_session_discord_user_id";--> statement-breakpoint
DROP INDEX "idx_crosshair_like_crosshair_id";--> statement-breakpoint
DROP INDEX "idx_mirrored_files_mod_download_id_and_mod_id";--> statement-breakpoint
CREATE INDEX "idx_oauth_access_token_on_access_token" ON "oauth_access_token" USING btree ("access_token");