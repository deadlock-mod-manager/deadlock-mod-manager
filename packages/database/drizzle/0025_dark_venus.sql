CREATE TYPE "public"."sync_status" AS ENUM('idle', 'syncing', 'error');--> statement-breakpoint
CREATE TABLE "documentation_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documentation_sync" (
	"id" text PRIMARY KEY NOT NULL,
	"last_synced_at" timestamp,
	"content_hash" text NOT NULL,
	"chunk_count" text NOT NULL,
	"status" "sync_status" DEFAULT 'idle' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "documentation_chunks_embedding_idx" ON "documentation_chunks" USING hnsw ("embedding" vector_cosine_ops);