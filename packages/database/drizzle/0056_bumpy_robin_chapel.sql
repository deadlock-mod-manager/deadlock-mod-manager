ALTER TABLE "report" DROP CONSTRAINT "report_mod_id_mod_id_fk";
--> statement-breakpoint
DROP INDEX "report_mod_id_reporter_hardware_id_idx";--> statement-breakpoint
DROP INDEX "idx_report_mod_id";--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "submission_type" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "submission_id" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "mod_name" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "mod_author" text;--> statement-breakpoint
UPDATE "report"
SET
	"provider" = 'gamebanana',
	"submission_type" = CASE
		WHEN "mod"."is_audio" OR "mod"."remote_id" LIKE 'snd-%' THEN 'sound'
		ELSE 'mod'
	END,
	"submission_id" = regexp_replace("mod"."remote_id", '^snd-', ''),
	"mod_name" = "mod"."name",
	"mod_author" = "mod"."author"
FROM "mod"
WHERE "report"."mod_id" = "mod"."id";--> statement-breakpoint
ALTER TABLE "report" ALTER COLUMN "provider" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ALTER COLUMN "submission_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ALTER COLUMN "submission_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ALTER COLUMN "mod_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ALTER COLUMN "mod_author" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "report_identity_reporter_hardware_id_idx" ON "report" USING btree ("provider","submission_type","submission_id","reporter_hardware_id");--> statement-breakpoint
CREATE INDEX "idx_report_identity" ON "report" USING btree ("provider","submission_type","submission_id");--> statement-breakpoint
ALTER TABLE "report" DROP COLUMN "mod_id";
