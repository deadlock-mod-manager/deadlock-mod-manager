ALTER TABLE "mod" ADD COLUMN "remote_index_modified_at" timestamp;--> statement-breakpoint
ALTER TABLE "mod" ADD COLUMN "last_synced_at" timestamp;--> statement-breakpoint
CREATE INDEX "idx_mod_last_synced_at" ON "mod" USING btree ("last_synced_at");