CREATE TYPE "public"."pattern_type" AS ENUM('bug_report', 'help_request');--> statement-breakpoint
CREATE TABLE "message_patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"pattern_type" "pattern_type" NOT NULL,
	"pattern_text" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "triage_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"keyword" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "triage_keywords_keyword_unique" UNIQUE("keyword")
);
--> statement-breakpoint
CREATE INDEX "message_patterns_embedding_idx" ON "message_patterns" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "message_patterns_pattern_type_idx" ON "message_patterns" USING btree ("pattern_type");