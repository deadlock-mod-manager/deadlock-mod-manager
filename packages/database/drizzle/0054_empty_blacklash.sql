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
INSERT INTO "mod_author" (
	"id",
	"provider",
	"remote_id",
	"name",
	"profile_url",
	"avatar_url",
	"hd_avatar_url",
	"upic_url",
	"signature_url",
	"title",
	"joined_at",
	"subscriber_count"
)
SELECT DISTINCT ON ("metadata"->'author'->>'id')
	concat('mod_author_', md5(concat('gamebanana:', "metadata"->'author'->>'id'))),
	'gamebanana',
	"metadata"->'author'->>'id',
	"author",
	"metadata"->'author'->>'profileUrl',
	"metadata"->'author'->>'avatarUrl',
	CASE
		WHEN lower("metadata"->'author'->>'hdAvatarUrl') ~ '^https://([a-z0-9-]+\.)*gamebanana\.com/'
			THEN "metadata"->'author'->>'hdAvatarUrl'
		ELSE NULL
	END,
	CASE
		WHEN lower("metadata"->'author'->>'upicUrl') ~ '^https://([a-z0-9-]+\.)*gamebanana\.com/'
			THEN "metadata"->'author'->>'upicUrl'
		ELSE NULL
	END,
	CASE
		WHEN lower("metadata"->'author'->>'signatureUrl') ~ '^https://([a-z0-9-]+\.)*gamebanana\.com/'
			THEN "metadata"->'author'->>'signatureUrl'
		ELSE NULL
	END,
	NULLIF("metadata"->'author'->>'title', ''),
	CASE
		WHEN "metadata"->'author'->>'joinedAt' ~ '^[0-9]{1,10}$'
			AND ("metadata"->'author'->>'joinedAt')::bigint BETWEEN 1 AND 2147483647
			THEN ("metadata"->'author'->>'joinedAt')::integer
		ELSE NULL
	END,
	CASE
		WHEN "metadata"->'author'->>'subscriberCount' ~ '^[0-9]{1,10}$'
			AND ("metadata"->'author'->>'subscriberCount')::bigint BETWEEN 0 AND 2147483647
			THEN ("metadata"->'author'->>'subscriberCount')::integer
		ELSE NULL
	END
FROM "mod"
WHERE jsonb_typeof("metadata"->'author') = 'object'
	AND NULLIF("metadata"->'author'->>'id', '') IS NOT NULL
	AND lower("metadata"->'author'->>'profileUrl') ~ '^https://([a-z0-9-]+\.)*gamebanana\.com/'
	AND lower("metadata"->'author'->>'avatarUrl') ~ '^https://([a-z0-9-]+\.)*gamebanana\.com/'
ORDER BY "metadata"->'author'->>'id', "remote_updated_at" DESC;--> statement-breakpoint
UPDATE "mod"
SET "mod_author_id" = "mod_author"."id"
FROM "mod_author"
WHERE "mod_author"."provider" = 'gamebanana'
	AND "mod_author"."remote_id" = "mod"."metadata"->'author'->>'id';--> statement-breakpoint
UPDATE "mod"
SET "metadata" = "metadata" - 'author'
WHERE "metadata" ? 'author'
	AND "mod_author_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mod_author_provider_remote_id_idx" ON "mod_author" USING btree ("provider","remote_id");--> statement-breakpoint
ALTER TABLE "mod" ADD CONSTRAINT "mod_mod_author_id_mod_author_id_fk" FOREIGN KEY ("mod_author_id") REFERENCES "public"."mod_author"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mod_author_id" ON "mod" USING btree ("mod_author_id");
