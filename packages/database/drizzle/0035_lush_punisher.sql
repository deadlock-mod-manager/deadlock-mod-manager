CREATE TABLE "crosshair_like" (
	"id" text PRIMARY KEY NOT NULL,
	"crosshair_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crosshair" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"config" jsonb NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"heroes" text[] DEFAULT '{}' NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "crosshair_like" ADD CONSTRAINT "crosshair_like_crosshair_id_crosshair_id_fk" FOREIGN KEY ("crosshair_id") REFERENCES "public"."crosshair"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crosshair_like" ADD CONSTRAINT "crosshair_like_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crosshair" ADD CONSTRAINT "crosshair_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crosshair_like_crosshair_id_user_id_idx" ON "crosshair_like" USING btree ("crosshair_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_crosshair_like_crosshair_id" ON "crosshair_like" USING btree ("crosshair_id");--> statement-breakpoint
CREATE INDEX "idx_crosshair_like_user_id" ON "crosshair_like" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_crosshair_created_at" ON "crosshair" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_crosshair_likes" ON "crosshair" USING btree ("likes");--> statement-breakpoint
CREATE INDEX "idx_crosshair_downloads" ON "crosshair" USING btree ("downloads");--> statement-breakpoint
CREATE INDEX "idx_crosshair_user_id" ON "crosshair" USING btree ("user_id");