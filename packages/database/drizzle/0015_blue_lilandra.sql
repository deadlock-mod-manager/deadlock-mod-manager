CREATE TYPE "public"."report_status" AS ENUM('unverified', 'verified', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."report_type" AS ENUM('broken', 'outdated', 'malicious', 'inappropriate', 'other');--> statement-breakpoint
CREATE TABLE "report" (
	"id" text PRIMARY KEY NOT NULL,
	"mod_id" text NOT NULL,
	"type" "report_type" DEFAULT 'broken' NOT NULL,
	"status" "report_status" DEFAULT 'unverified' NOT NULL,
	"reason" text NOT NULL,
	"description" text,
	"reporter_hardware_id" text,
	"reporter_name" text,
	"verified_by" text,
	"verified_at" timestamp,
	"dismissed_by" text,
	"dismissed_at" timestamp,
	"dismissal_reason" text,
	"discord_message_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_mod_id_mod_id_fk" FOREIGN KEY ("mod_id") REFERENCES "public"."mod"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_mod_id_reporter_hardware_id_idx" ON "report" USING btree ("mod_id","reporter_hardware_id");