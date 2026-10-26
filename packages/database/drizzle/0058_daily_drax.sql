CREATE TABLE "profile_backup" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"device_name" text NOT NULL,
	"mod_count" integer NOT NULL,
	"skipped_local_mod_count" integer DEFAULT 0 NOT NULL,
	"content_hash" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "profile_backup" ADD CONSTRAINT "profile_backup_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_profile_backup_user_id" ON "profile_backup" USING btree ("user_id");