ALTER TABLE "user"
ADD COLUMN "friends" text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE "user"
ADD COLUMN "incoming_friend_requests" text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE "user"
ADD COLUMN "outgoing_friend_requests" text[] NOT NULL DEFAULT ARRAY[]::text[];

