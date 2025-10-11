-- Add type column first with default 'boolean'
ALTER TABLE "feature_flags" ADD COLUMN "type" text DEFAULT 'boolean' NOT NULL;

-- Drop the default on value column before converting type
ALTER TABLE "feature_flags" ALTER COLUMN "value" DROP DEFAULT;

-- Convert existing boolean values in feature_flags to JSON
-- This safely converts true -> true (json), false -> false (json)
ALTER TABLE "feature_flags" ALTER COLUMN "value" TYPE json USING to_jsonb("value");

-- Set the new default for future inserts
ALTER TABLE "feature_flags" ALTER COLUMN "value" SET DEFAULT 'false'::json;

-- Convert existing boolean values in segment_feature_flags to JSON
ALTER TABLE "segment_feature_flags" ALTER COLUMN "value" TYPE json USING to_jsonb("value");