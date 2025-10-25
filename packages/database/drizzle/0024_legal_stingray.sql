CREATE TYPE "public"."message_type" AS ENUM('human', 'ai', 'system');--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"type" "message_type" NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_session" (
	"id" text PRIMARY KEY NOT NULL,
	"discord_user_id" text NOT NULL,
	"discord_channel_id" text NOT NULL,
	"last_message_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_session_id_chat_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_message_session_id" ON "chat_message" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_chat_message_session_created" ON "chat_message" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_session_discord_user_id" ON "chat_session" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX "idx_chat_session_discord_channel_id" ON "chat_session" USING btree ("discord_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_chat_session_user_channel" ON "chat_session" USING btree ("discord_user_id","discord_channel_id");