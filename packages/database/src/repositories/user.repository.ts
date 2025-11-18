import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { friendships, user, type FriendshipStatus } from "../schema/auth";

export interface UserFriendState {
  readonly friends: string[];
  readonly incomingFriendRequests: string[];
  readonly outgoingFriendRequests: string[];
}

export interface FriendUserSummary {
  readonly id: string;
  readonly name?: string | null;
  readonly image?: string | null;
  readonly email?: string | null;
}

export class UserRepository {
  constructor(private readonly db: Database) {}

  async getFriendState(userId: string): Promise<UserFriendState | null> {
    const exists = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (exists.length === 0) {
      return null;
    }

    const [outgoingRows, incomingRows] = await Promise.all([
      this.db
        .select({
          friendId: friendships.friendId,
          status: friendships.status,
        })
        .from(friendships)
        .where(eq(friendships.userId, userId)),
      this.db
        .select({
          requesterId: friendships.userId,
          status: friendships.status,
        })
        .from(friendships)
        .where(eq(friendships.friendId, userId)),
    ]);

    const friends = new Set<string>();
    const incomingFriendRequests = new Set<string>();
    const outgoingFriendRequests = new Set<string>();

    const handleStatus = (status: FriendshipStatus, targetId: string, set: Set<string>) => {
      if (status === "pending") {
        set.add(targetId);
      } else if (status === "accepted") {
        friends.add(targetId);
      }
    };

    for (const row of outgoingRows) {
      handleStatus(row.status, row.friendId, outgoingFriendRequests);
    }

    for (const row of incomingRows) {
      handleStatus(row.status, row.requesterId, incomingFriendRequests);
    }

    return {
      friends: Array.from(friends),
      incomingFriendRequests: Array.from(incomingFriendRequests),
      outgoingFriendRequests: Array.from(outgoingFriendRequests),
    };
  }

  async createFriendRequest(
    requesterUserId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.db
      .insert(friendships)
      .values({
        userId: requesterUserId,
        friendId: targetUserId,
        status: "pending",
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  }

  async acceptFriendRequest(
    accepterUserId: string,
    requesterUserId: string,
  ): Promise<void> {
    const now = new Date();
    const updated = await this.db
      .update(friendships)
      .set({
        status: "accepted",
        createdAt: now,
      })
      .where(
        and(
          eq(friendships.userId, requesterUserId),
          eq(friendships.friendId, accepterUserId),
          eq(friendships.status, "pending"),
        ),
      )
      .returning({ userId: friendships.userId });

    if (updated.length === 0) {
      throw new Error("Pending friend request not found");
    }

    await this.db
      .insert(friendships)
      .values({
        userId: accepterUserId,
        friendId: requesterUserId,
        status: "accepted",
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [friendships.userId, friendships.friendId],
        set: {
          status: "accepted",
          createdAt: now,
        },
      });

    await this.db
      .delete(friendships)
      .where(
        and(
          eq(friendships.userId, accepterUserId),
          eq(friendships.friendId, requesterUserId),
          eq(friendships.status, "pending"),
        ),
      );
  }

  async declineFriendRequest(
    declinerUserId: string,
    requesterUserId: string,
  ): Promise<void> {
    await this.db
      .delete(friendships)
      .where(
        and(
          eq(friendships.userId, requesterUserId),
          eq(friendships.friendId, declinerUserId),
          eq(friendships.status, "pending"),
        ),
      );
  }

  async cancelFriendRequest(
    requesterUserId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.db
      .delete(friendships)
      .where(
        and(
          eq(friendships.userId, requesterUserId),
          eq(friendships.friendId, targetUserId),
          eq(friendships.status, "pending"),
        ),
      );
  }

  async removeFriendship(
    userId: string,
    friendUserId: string,
  ): Promise<void> {
    await this.db
      .delete(friendships)
      .where(
        and(
          eq(friendships.userId, userId),
          eq(friendships.friendId, friendUserId),
          eq(friendships.status, "accepted"),
        ),
      );

    await this.db
      .delete(friendships)
      .where(
        and(
          eq(friendships.userId, friendUserId),
          eq(friendships.friendId, userId),
          eq(friendships.status, "accepted"),
        ),
      );
  }

  async getUsersByIds(
    userIds: readonly string[],
  ): Promise<FriendUserSummary[]> {
    if (userIds.length === 0) {
      return [];
    }

    const uniqueIds = Array.from(new Set(userIds));
    const rows = await this.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(user)
      .where(inArray(user.id, uniqueIds));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
    }));
  }
}
