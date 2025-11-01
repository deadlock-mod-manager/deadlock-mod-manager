CREATE TABLE "user_feature_flag_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feature_flag_id" text NOT NULL,
	"value" json NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_feature_flag_overrides_user_id_feature_flag_id_unique" UNIQUE("user_id","feature_flag_id")
);
--> statement-breakpoint
ALTER TABLE "feature_flags" ADD COLUMN "exposed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_feature_flag_overrides" ADD CONSTRAINT "user_feature_flag_overrides_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feature_flag_overrides" ADD CONSTRAINT "user_feature_flag_overrides_feature_flag_id_feature_flags_id_fk" FOREIGN KEY ("feature_flag_id") REFERENCES "public"."feature_flags"("id") ON DELETE cascade ON UPDATE no action;