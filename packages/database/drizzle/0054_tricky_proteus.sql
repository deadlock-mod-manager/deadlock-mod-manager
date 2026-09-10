CREATE TABLE "policy_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"submission_type" text NOT NULL,
	"submission_id" text NOT NULL,
	"kind" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"reason" text,
	"correction" jsonb,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
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
ALTER TABLE "report" ALTER COLUMN "mod_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vpk" ALTER COLUMN "mod_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "submission_type" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "submission_id" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "mod_name" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "mod_author" text;--> statement-breakpoint
ALTER TABLE "vpk" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "vpk" ADD COLUMN "submission_type" text;--> statement-breakpoint
ALTER TABLE "vpk" ADD COLUMN "submission_id" text;--> statement-breakpoint
ALTER TABLE "vpk" ADD COLUMN "file_id" text;--> statement-breakpoint
ALTER TABLE "vpk" ADD COLUMN "upstream_updated_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "policy_rule_identity_kind_idx" ON "policy_rule" USING btree ("provider","submission_type","submission_id","kind");--> statement-breakpoint
CREATE INDEX "policy_rule_identity_idx" ON "policy_rule" USING btree ("provider","submission_type","submission_id");--> statement-breakpoint
CREATE INDEX "policy_rule_updated_at_idx" ON "policy_rule" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "policy_rule_active_updated_at_idx" ON "policy_rule" USING btree ("active","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vpk_ingestion_identity_file_marker_idx" ON "vpk_ingestion" USING btree ("provider","submission_type","submission_id","file_id","upstream_updated_at");--> statement-breakpoint
CREATE INDEX "idx_report_identity" ON "report" USING btree ("provider","submission_type","submission_id");--> statement-breakpoint
CREATE INDEX "vpk_identity_source_idx" ON "vpk" USING btree ("provider","submission_type","submission_id","file_id","source_path");