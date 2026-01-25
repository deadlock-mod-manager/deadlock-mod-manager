import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import {
  type FriendshipStatus,
  friendships,
  user,
  userActiveMods,
  userHeartbeats,
} from "../schema/auth";

export interface UserFriendState {
  readonly friends: string[];
  readonly incomingFriendRequests: string[];
  readonly outgoingFriendRequests: string[];
}

export interface FriendUserSummary {
  readonly id: string;
  readonly name?: string | null;
  readonly email?: string | null;
  readonly image?: string | null;
}

export interface UserOnlineStatus {
  readonly userId: string;
  readonly isOnline: boolean;
}

export interface OnlineStatusOptions {
  readonly heartbeatIntervalSeconds: number;
}

export interface FriendModUsage {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DatabaseOrTransaction = Database | any;

export class UserRepository {
  constructor(private readonly db: DatabaseOrTransaction) {}

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

    const handleStatus = (
      status: FriendshipStatus,
      targetId: string,
      set: Set<string>,
    ) => {
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

  async removeFriendship(userId: string, friendUserId: string): Promise<void> {
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

  async updateHeartbeat(userId: string, modIds?: string[]): Promise<void> {
    const now = new Date();
    await this.db
      .insert(userHeartbeats)
      .values({
        userId,
        lastHeartbeat: now,
      })
      .onConflictDoUpdate({
        target: userHeartbeats.userId,
        set: {
          lastHeartbeat: now,
        },
      });

    if (modIds !== undefined) {
      await this.db
        .insert(userActiveMods)
        .values({
          userId,
          modIds,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: userActiveMods.userId,
          set: {
            modIds,
            updatedAt: now,
          },
        });
    }
  }

  async getOnlineStatus(
    userIds: readonly string[],
    options: OnlineStatusOptions,
  ): Promise<UserOnlineStatus[]> {
    if (userIds.length === 0) {
      return [];
    }

    const uniqueIds = Array.from(new Set(userIds));
    const thresholdMs = options.heartbeatIntervalSeconds * 2 * 1000;
    const threshold = new Date(Date.now() - thresholdMs);

    const rows = await this.db
      .select({
        userId: userHeartbeats.userId,
        lastHeartbeat: userHeartbeats.lastHeartbeat,
      })
      .from(userHeartbeats)
      .where(inArray(userHeartbeats.userId, uniqueIds));

    const heartbeatMap = new Map(
      rows.map((row) => [row.userId, row.lastHeartbeat]),
    );

    return uniqueIds.map((id) => {
      const lastHeartbeat = heartbeatMap.get(id);
      const isOnline = lastHeartbeat ? lastHeartbeat > threshold : false;
      return { userId: id, isOnline };
    });
  }

  async getFriendsActiveMods(
    userId: string,
  ): Promise<Record<string, FriendModUsage[]>> {
    const friendState = await this.getFriendState(userId);
    if (!friendState || friendState.friends.length === 0) {
      return {};
    }

    const friendIds = friendState.friends;

    const [friendsData, activeModsData] = await Promise.all([
      this.db
        .select({
          id: user.id,
          name: user.name,
          image: user.image,
        })
        .from(user)
        .where(inArray(user.id, friendIds)),
      this.db
        .select({
          odId: userActiveMods.userId,
          modIds: userActiveMods.modIds,
        })
        .from(userActiveMods)
        .where(inArray(userActiveMods.userId, friendIds)),
    ]);

    const friendMap = new Map(
      friendsData.map((f) => [
        f.id,
        { displayName: f.name, avatarUrl: f.image },
      ]),
    );

    const result: Record<string, FriendModUsage[]> = {};

    for (const row of activeModsData) {
      const friendUserId = row.odId;
      const friendInfo = friendMap.get(friendUserId);
      if (!friendInfo || !row.modIds) continue;

      for (const modId of row.modIds) {
        if (!result[modId]) {
          result[modId] = [];
        }
        result[modId].push({
          userId: friendUserId,
          displayName: friendInfo.displayName,
          avatarUrl: friendInfo.avatarUrl,
        });
      }
    }

    return result;
  }
}
