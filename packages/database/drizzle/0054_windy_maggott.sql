CREATE TABLE "policy_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"submission_type" text NOT NULL,
	"submission_id" text NOT NULL,
	"kind" text NOT NULL,
	"reason" text,
	"correction" jsonb,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "policy_rule_identity_kind_idx" ON "policy_rule" USING btree ("provider","submission_type","submission_id","kind");--> statement-breakpoint
CREATE INDEX "policy_rule_identity_idx" ON "policy_rule" USING btree ("provider","submission_type","submission_id");--> statement-breakpoint
CREATE INDEX "policy_rule_updated_at_idx" ON "policy_rule" USING btree ("updated_at");--> statement-breakpoint
INSERT INTO "policy_rule" (
	"id", "provider", "submission_type", "submission_id", "kind", "reason",
	"created_by", "created_at", "updated_at"
)
SELECT
	'policy_rule_' || md5('blacklisted:' || "remote_id"),
	'gamebanana',
	CASE WHEN "is_audio" OR "remote_id" LIKE 'snd-%' THEN 'sound' ELSE 'mod' END,
	regexp_replace("remote_id", '^snd-', ''),
	'blacklisted',
	"blacklist_reason",
	"blacklisted_by",
	COALESCE("blacklisted_at", "created_at", now()),
	COALESCE("updated_at", "blacklisted_at", now())
FROM "mod"
WHERE "is_blacklisted" = true
	AND regexp_replace("remote_id", '^snd-', '') ~ '^[1-9][0-9]*$'
ON CONFLICT ("provider", "submission_type", "submission_id", "kind") DO NOTHING;--> statement-breakpoint
INSERT INTO "policy_rule" (
	"id", "provider", "submission_type", "submission_id", "kind", "correction",
	"created_at", "updated_at"
)
SELECT
	'policy_rule_' || md5('metadata_correction:' || "remote_id"),
	'gamebanana',
	CASE WHEN "is_audio" OR "remote_id" LIKE 'snd-%' THEN 'sound' ELSE 'mod' END,
	regexp_replace("remote_id", '^snd-', ''),
	'metadata_correction',
	"overrides",
	COALESCE("created_at", now()),
	COALESCE("updated_at", now())
FROM "mod"
WHERE "overrides" IS NOT NULL
	AND regexp_replace("remote_id", '^snd-', '') ~ '^[1-9][0-9]*$'
ON CONFLICT ("provider", "submission_type", "submission_id", "kind") DO NOTHING;
