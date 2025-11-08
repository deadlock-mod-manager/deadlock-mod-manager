ALTER TABLE "announcement" ADD COLUMN "link_url" text;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "link_label" text;--> statement-breakpoint
CREATE INDEX "idx_user_created_at" ON "user" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_mod_download_created_at" ON "mod_download" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_mod_created_at" ON "mod" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_mod_updated_at" ON "mod" USING btree ("updated_at");