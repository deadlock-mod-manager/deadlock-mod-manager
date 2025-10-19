CREATE TABLE "mirrored_files" (
	"id" text PRIMARY KEY NOT NULL,
	"mod_download_id" text NOT NULL,
	"mod_id" text NOT NULL,
	"remote_id" text NOT NULL,
	"filename" text NOT NULL,
	"s3_key" text NOT NULL,
	"s3_bucket" text NOT NULL,
	"file_hash" text,
	"file_size" integer NOT NULL,
	"mirrored_at" timestamp NOT NULL,
	"last_downloaded_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "mirrored_files_file_hash_unique" UNIQUE("file_hash")
);
--> statement-breakpoint
CREATE INDEX "idx_mirrored_files_mod_download_id_and_mod_id" ON "mirrored_files" USING btree ("mod_download_id","mod_id");