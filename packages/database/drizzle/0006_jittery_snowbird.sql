CREATE TYPE "public"."vpk_state" AS ENUM('ok', 'duplicate', 'corrupt');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY DEFAULT concat('account_', gen_random_uuid()) NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY DEFAULT concat('session_', gen_random_uuid()) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY DEFAULT concat('user_', gen_random_uuid()) NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY DEFAULT concat('verification_', gen_random_uuid()) NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "vpk" (
	"id" text PRIMARY KEY DEFAULT concat('vpk_', gen_random_uuid()) NOT NULL,
	"mod_download_id" text NOT NULL,
	"source_path" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"fast_hash" text NOT NULL,
	"sha256" text NOT NULL,
	"content_sig" text NOT NULL,
	"vpk_version" integer NOT NULL,
	"file_count" integer NOT NULL,
	"has_multiparts" boolean DEFAULT false NOT NULL,
	"has_inline_data" boolean DEFAULT false NOT NULL,
	"merkle_root" text,
	"state" "vpk_state" DEFAULT 'ok' NOT NULL,
	"scanned_at" timestamp NOT NULL,
	"file_mtime" timestamp
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpk" ADD CONSTRAINT "vpk_mod_download_id_mod_download_id_fk" FOREIGN KEY ("mod_download_id") REFERENCES "public"."mod_download"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vpk_sha256_uk" ON "vpk" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "vpk_content_sig_idx" ON "vpk" USING btree ("content_sig");--> statement-breakpoint
CREATE UNIQUE INDEX "vpk_src_uk" ON "vpk" USING btree ("mod_download_id","source_path");--> statement-breakpoint
CREATE INDEX "vpk_fast_size_idx" ON "vpk" USING btree ("fast_hash","size_bytes");