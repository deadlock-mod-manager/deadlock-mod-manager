CREATE TYPE "public"."quick_answer_asset_kind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TABLE "quick_answer_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"kind" "quick_answer_asset_kind" NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quick_answer_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by_discord_id" text NOT NULL,
	"updated_by_discord_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "quick_answer_assets" ADD CONSTRAINT "quick_answer_assets_template_id_quick_answer_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."quick_answer_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quick_answer_assets_template_sort_idx" ON "quick_answer_assets" USING btree ("template_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "quick_answer_assets_attachment_idx" ON "quick_answer_assets" USING btree ("attachment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quick_answer_templates_guild_slug_idx" ON "quick_answer_templates" USING btree ("guild_id","slug");--> statement-breakpoint
CREATE INDEX "quick_answer_templates_guild_active_idx" ON "quick_answer_templates" USING btree ("guild_id","is_active");