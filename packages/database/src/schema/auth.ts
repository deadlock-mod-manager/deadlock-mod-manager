import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { timestamps } from "./shared/timestamps";

export const user = pgTable(
  "user",
  {
    id: typeId("id", "user")
      .primaryKey()
      .$defaultFn(() => generateId("user").toString()),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull(),
    image: text("image"),
    isAdmin: boolean("is_admin").notNull().default(false),
    ...timestamps,
  },
  (table) => [index("idx_user_created_at").on(table.createdAt)],
);

export const friendshipStatusEnum = pgEnum("friendship_status", [
  "pending",
  "accepted",
]);

export const friendships = pgTable(
  "friendships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    friendId: text("friend_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: friendshipStatusEnum("status").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    primaryKey(table.userId, table.friendId),
    index("idx_friendships_user_id_status").on(table.userId, table.status),
    index("idx_friendships_friend_id_status").on(table.friendId, table.status),
  ],
);

export type Friendship = typeof friendships.$inferSelect;
export type NewFriendship = typeof friendships.$inferInsert;
export type FriendshipStatus =
  (typeof friendshipStatusEnum.enumValues)[number];

export const session = pgTable("session", {
  id: typeId("id", "session")
    .primaryKey()
    .$defaultFn(() => generateId("session").toString()),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ...timestamps,
});

export const account = pgTable("account", {
  id: typeId("id", "account")
    .primaryKey()
    .$defaultFn(() => generateId("account").toString()),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  ...timestamps,
});

export const verification = pgTable("verification", {
  id: typeId("id", "verification")
    .primaryKey()
    .$defaultFn(() => generateId("verification").toString()),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  ...timestamps,
});
