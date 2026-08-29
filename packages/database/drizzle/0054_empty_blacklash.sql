CREATE TABLE "mod_author" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"remote_id" text NOT NULL,
	"name" text NOT NULL,
	"profile_url" text NOT NULL,
	"avatar_url" text NOT NULL,
	"hd_avatar_url" text,
	"upic_url" text,
	"signature_url" text,
	"title" text,
	"joined_at" integer,
	"subscriber_count" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "mod" ADD COLUMN "mod_author_id" text;--> statement-breakpoint
UPDATE "mod" SET "metadata" = "metadata" - 'author' WHERE "metadata" ? 'author';--> statement-breakpoint
CREATE UNIQUE INDEX "mod_author_provider_remote_id_idx" ON "mod_author" USING btree ("provider","remote_id");--> statement-breakpoint
ALTER TABLE "mod" ADD CONSTRAINT "mod_mod_author_id_mod_author_id_fk" FOREIGN KEY ("mod_author_id") REFERENCES "public"."mod_author"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mod_author_id" ON "mod" USING btree ("mod_author_id");
