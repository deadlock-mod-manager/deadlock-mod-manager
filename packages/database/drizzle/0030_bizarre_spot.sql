CREATE TYPE "public"."announcement_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "announcement" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"status" "announcement_status" DEFAULT 'draft' NOT NULL,
	"author_id" text NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;