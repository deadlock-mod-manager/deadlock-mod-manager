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

BEGIN;

WITH accepted_pairs AS (
  SELECT DISTINCT u.id AS user_id, friend_id
  FROM "user" u
  CROSS JOIN LATERAL unnest(u.friends) AS friend_id
  WHERE friend_id IS NOT NULL
    AND friend_id <> ''
),
filtered_accepted AS (
  SELECT user_id, friend_id
  FROM accepted_pairs
  WHERE user_id IS NOT NULL
    AND friend_id IS NOT NULL
    AND user_id <> friend_id
)
INSERT INTO "friendships" ("user_id", "friend_id", "status", "created_at")
SELECT user_id, friend_id, 'accepted', NOW()
FROM filtered_accepted
ON CONFLICT DO NOTHING;

WITH outgoing_requests AS (
  SELECT DISTINCT u.id AS user_id, request_id AS friend_id
  FROM "user" u
  CROSS JOIN LATERAL unnest(u.outgoing_friend_requests) AS request_id
  WHERE request_id IS NOT NULL
    AND request_id <> ''
),
incoming_requests AS (
  SELECT DISTINCT requester_id AS user_id, u.id AS friend_id
  FROM "user" u
  CROSS JOIN LATERAL unnest(u.incoming_friend_requests) AS requester_id
  WHERE requester_id IS NOT NULL
    AND requester_id <> ''
),
pending_requests AS (
  SELECT DISTINCT user_id, friend_id
  FROM (
    SELECT user_id, friend_id FROM outgoing_requests
    UNION
    SELECT user_id, friend_id FROM incoming_requests
  ) combined
  WHERE user_id IS NOT NULL
    AND friend_id IS NOT NULL
    AND user_id <> friend_id
)
INSERT INTO "friendships" ("user_id", "friend_id", "status", "created_at")
SELECT pr.user_id, pr.friend_id, 'pending', NOW()
FROM pending_requests pr
WHERE NOT EXISTS (
  SELECT 1 FROM "friendships" f
  WHERE f.user_id = pr.user_id
    AND f.friend_id = pr.friend_id
);

ALTER TABLE "user"
DROP COLUMN "friends";

ALTER TABLE "user"
DROP COLUMN "incoming_friend_requests";

ALTER TABLE "user"
DROP COLUMN "outgoing_friend_requests";

COMMIT;

