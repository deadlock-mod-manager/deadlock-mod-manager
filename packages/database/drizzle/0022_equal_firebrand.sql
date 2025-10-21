ALTER TABLE "mirrored_files" ADD COLUMN "last_validated" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "mirrored_files" ADD COLUMN "is_stale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_mirrored_files_last_downloaded_at" ON "mirrored_files" USING btree ("last_downloaded_at");--> statement-breakpoint
CREATE INDEX "idx_mirrored_files_is_stale" ON "mirrored_files" USING btree ("is_stale");