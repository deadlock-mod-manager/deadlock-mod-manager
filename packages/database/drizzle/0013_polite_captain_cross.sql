CREATE TABLE "rss_item" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"link" text NOT NULL,
	"pub_date" timestamp NOT NULL,
	"image" text,
	"guid" text,
	"source" text DEFAULT 'gamebanana' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rss_item_link_source_idx" ON "rss_item" USING btree ("link","source");--> statement-breakpoint
CREATE UNIQUE INDEX "rss_item_pub_date_idx" ON "rss_item" USING btree ("pub_date");