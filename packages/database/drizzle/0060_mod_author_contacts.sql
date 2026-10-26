ALTER TABLE "mod_author" ADD COLUMN "contacts" jsonb;--> statement-breakpoint
ALTER TABLE "mod_author" ADD COLUMN "contacts_fetched_at" timestamp;