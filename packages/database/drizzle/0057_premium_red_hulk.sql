CREATE TABLE "vpk_ingestion" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"submission_type" text NOT NULL,
	"submission_id" text NOT NULL,
	"file_id" text NOT NULL,
	"upstream_updated_at" timestamp NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vpk" DROP CONSTRAINT "vpk_mod_id_mod_id_fk";
--> statement-breakpoint
ALTER TABLE "vpk" DROP CONSTRAINT "vpk_mod_download_id_mod_download_id_fk";
--> statement-breakpoint
DROP INDEX "vpk_sha256_uk";--> statement-breakpoint
DROP INDEX "vpk_src_uk";--> statement-breakpoint
ALTER TABLE "vpk" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "vpk" ADD COLUMN "submission_type" text;--> statement-breakpoint
ALTER TABLE "vpk" ADD COLUMN "submission_id" text;--> statement-breakpoint
ALTER TABLE "vpk" ADD COLUMN "file_id" text;--> statement-breakpoint
ALTER TABLE "vpk" ADD COLUMN "upstream_updated_at" timestamp;--> statement-breakpoint
UPDATE "vpk"
SET
	"provider" = 'gamebanana',
	"submission_type" = CASE
		WHEN "mod"."is_audio" OR "mod"."remote_id" LIKE 'snd-%' THEN 'sound'
		ELSE 'mod'
	END,
	"submission_id" = regexp_replace("mod"."remote_id", '^snd-', ''),
	"file_id" = COALESCE("mod_download"."remote_id", 'legacy-' || "vpk"."id"),
	"upstream_updated_at" = COALESCE(
		"mod"."files_updated_at",
		"mod_download"."updated_at",
		"vpk"."updated_at",
		"vpk"."created_at",
		now()
	)
FROM "mod", "mod_download"
WHERE "vpk"."mod_id" = "mod"."id"
	AND "vpk"."mod_download_id" = "mod_download"."id";--> statement-breakpoint
UPDATE "vpk"
SET
	"provider" = 'gamebanana',
	"submission_type" = CASE
		WHEN "mod"."is_audio" OR "mod"."remote_id" LIKE 'snd-%' THEN 'sound'
		ELSE 'mod'
	END,
	"submission_id" = regexp_replace("mod"."remote_id", '^snd-', ''),
	"file_id" = 'legacy-' || "vpk"."id",
	"upstream_updated_at" = COALESCE(
		"mod"."files_updated_at", "vpk"."updated_at", "vpk"."created_at", now()
	)
FROM "mod"
WHERE "vpk"."mod_id" = "mod"."id" AND "vpk"."provider" IS NULL;--> statement-breakpoint
ALTER TABLE "vpk" ALTER COLUMN "provider" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vpk" ALTER COLUMN "submission_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vpk" ALTER COLUMN "submission_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vpk" ALTER COLUMN "file_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vpk" ALTER COLUMN "upstream_updated_at" SET NOT NULL;--> statement-breakpoint
INSERT INTO "vpk_ingestion" (
	"id", "provider", "submission_type", "submission_id", "file_id",
	"upstream_updated_at", "completed_at"
)
SELECT DISTINCT ON (
	"provider", "submission_type", "submission_id", "file_id", "upstream_updated_at"
)
	'vpk_ingestion_' || md5(
		"provider" || ':' || "submission_type" || ':' || "submission_id" || ':' ||
		"file_id" || ':' || "upstream_updated_at"::text
	),
	"provider", "submission_type", "submission_id", "file_id",
	"upstream_updated_at", COALESCE("scanned_at", now())
FROM "vpk";--> statement-breakpoint
CREATE UNIQUE INDEX "vpk_ingestion_identity_file_marker_idx" ON "vpk_ingestion" USING btree ("provider","submission_type","submission_id","file_id","upstream_updated_at");--> statement-breakpoint
CREATE INDEX "vpk_sha256_idx" ON "vpk" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "vpk_src_uk" ON "vpk" USING btree ("provider","submission_type","submission_id","file_id","source_path");--> statement-breakpoint
ALTER TABLE "vpk" DROP COLUMN "mod_id";--> statement-breakpoint
ALTER TABLE "vpk" DROP COLUMN "mod_download_id";
