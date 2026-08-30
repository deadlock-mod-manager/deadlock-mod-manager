-- Operational prerequisite: retain a verified compressed export created by
-- packages/database/scripts/export-retired-catalog.sh before applying this migration.
DROP TABLE "mirrored_files" CASCADE;--> statement-breakpoint
DROP TABLE "mod_download" CASCADE;--> statement-breakpoint
DROP TABLE "mod" CASCADE;
