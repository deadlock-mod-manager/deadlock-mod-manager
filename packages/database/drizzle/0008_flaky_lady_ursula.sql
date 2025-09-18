ALTER TABLE "vpk" DROP CONSTRAINT "vpk_mod_download_id_mod_download_id_fk";
--> statement-breakpoint
ALTER TABLE "vpk" ALTER COLUMN "mod_download_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vpk" ADD CONSTRAINT "vpk_mod_download_id_mod_download_id_fk" FOREIGN KEY ("mod_download_id") REFERENCES "public"."mod_download"("id") ON DELETE set null ON UPDATE no action;