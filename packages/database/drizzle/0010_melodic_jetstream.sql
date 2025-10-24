CREATE TABLE "profile" (
	"id" text PRIMARY KEY NOT NULL,
	"hardware_id" text NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"profile" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
