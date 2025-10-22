ALTER TABLE "mirrored_files" ALTER COLUMN "last_downloaded_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mirrored_files" ALTER COLUMN "last_validated" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mirrored_files" ADD CONSTRAINT "mirrored_files_mod_download_id_mod_download_id_fk" FOREIGN KEY ("mod_download_id") REFERENCES "public"."mod_download"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirrored_files" ADD CONSTRAINT "mirrored_files_mod_id_mod_id_fk" FOREIGN KEY ("mod_id") REFERENCES "public"."mod"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_mod_download_id_and_mod_id" ON "mirrored_files" USING btree ("mod_download_id","mod_id");