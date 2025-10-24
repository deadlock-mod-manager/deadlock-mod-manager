ALTER TABLE "mod" ADD COLUMN "is_blacklisted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mod" ADD COLUMN "blacklist_reason" text;--> statement-breakpoint
ALTER TABLE "mod" ADD COLUMN "blacklisted_at" timestamp;--> statement-breakpoint
ALTER TABLE "mod" ADD COLUMN "blacklisted_by" text;