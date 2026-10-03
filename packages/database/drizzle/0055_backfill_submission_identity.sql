-- Rows written before 0054 only reference the internal catalog. Copy the
-- GameBanana submission identity (and report display metadata) onto them so
-- they stay readable once the catalog tables are retired. Idempotent; the same
-- statements are re-runnable via ReportRepository/VpkRepository
-- backfillLegacyIdentities for rows legacy writers add after this migration.
UPDATE "report" SET
	"provider" = 'gamebanana',
	"submission_type" = CASE WHEN "mod"."is_audio" OR "mod"."remote_id" LIKE 'snd-%' THEN 'sound' ELSE 'mod' END,
	"submission_id" = regexp_replace("mod"."remote_id", '^snd-', ''),
	"mod_name" = COALESCE("report"."mod_name", "mod"."name"),
	"mod_author" = COALESCE("report"."mod_author", "mod"."author")
FROM "mod"
WHERE "report"."mod_id" = "mod"."id"
	AND "report"."submission_id" IS NULL
	AND "mod"."remote_id" ~ '^(snd-)?[1-9][0-9]*$';--> statement-breakpoint
UPDATE "vpk" SET
	"provider" = 'gamebanana',
	"submission_type" = CASE WHEN "mod"."is_audio" OR "mod"."remote_id" LIKE 'snd-%' THEN 'sound' ELSE 'mod' END,
	"submission_id" = regexp_replace("mod"."remote_id", '^snd-', '')
FROM "mod"
WHERE "vpk"."mod_id" = "mod"."id"
	AND "vpk"."submission_id" IS NULL
	AND "mod"."remote_id" ~ '^(snd-)?[1-9][0-9]*$';
