import { eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { user } from "../schema/auth";

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
    const result = await this.db
      .select({
        friends: user.friends,
        incomingFriendRequests: user.incomingFriendRequests,
        outgoingFriendRequests: user.outgoingFriendRequests,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const [state] = result;
    return {
      friends: [...state.friends],
      incomingFriendRequests: [...state.incomingFriendRequests],
      outgoingFriendRequests: [...state.outgoingFriendRequests],
    };
  }

  async updateFriendState(
    userId: string,
    state: UserFriendState,
  ): Promise<UserFriendState> {
    const updated = await this.db
      .update(user)
      .set({
        friends: state.friends,
        incomingFriendRequests: state.incomingFriendRequests,
        outgoingFriendRequests: state.outgoingFriendRequests,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId))
      .returning({
        friends: user.friends,
        incomingFriendRequests: user.incomingFriendRequests,
        outgoingFriendRequests: user.outgoingFriendRequests,
      });

    if (updated.length === 0) {
      throw new Error(`User not found for id ${userId}`);
    }

    const [nextState] = updated;
    return {
      friends: [...nextState.friends],
      incomingFriendRequests: [...nextState.incomingFriendRequests],
      outgoingFriendRequests: [...nextState.outgoingFriendRequests],
    };
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
