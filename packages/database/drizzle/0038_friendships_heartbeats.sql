CREATE TYPE "friendship_status" AS ENUM ('pending', 'accepted');

CREATE TABLE "friendships" (
  "user_id" text NOT NULL,
  "friend_id" text NOT NULL,
  "status" "friendship_status" NOT NULL,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "friendships_user_id_friend_id_pk" PRIMARY KEY ("user_id", "friend_id"),
  CONSTRAINT "friendships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE,
  CONSTRAINT "friendships_friend_id_user_id_fk" FOREIGN KEY ("friend_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX "idx_friendships_user_id_status" ON "friendships" ("user_id", "status");
CREATE INDEX "idx_friendships_friend_id_status" ON "friendships" ("friend_id", "status");

CREATE TABLE "user_heartbeats" (
  "user_id" text PRIMARY KEY NOT NULL,
  "last_heartbeat" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "user_heartbeats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

