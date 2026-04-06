DROP INDEX "idx_report_mod_type_status";--> statement-breakpoint
CREATE INDEX "idx_report_mod_id" ON "report" USING btree ("mod_id");--> statement-breakpoint
ALTER TABLE "report" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "report" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "report" DROP COLUMN "reason";--> statement-breakpoint
ALTER TABLE "report" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "report" DROP COLUMN "verified_by";--> statement-breakpoint
ALTER TABLE "report" DROP COLUMN "verified_at";--> statement-breakpoint
ALTER TABLE "report" DROP COLUMN "dismissed_by";--> statement-breakpoint
ALTER TABLE "report" DROP COLUMN "dismissed_at";--> statement-breakpoint
ALTER TABLE "report" DROP COLUMN "dismissal_reason";--> statement-breakpoint
DROP TYPE "public"."report_status";--> statement-breakpoint
DROP TYPE "public"."report_type";