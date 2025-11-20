import type { FriendUserSummary } from "@deadlock-mods/database";

export interface FriendEntryDto {
  readonly userId: string;
  readonly displayName?: string;
  readonly avatarUrl?: string | null;
  readonly email?: string | null;
}

export interface FriendListDto {
  readonly friends: FriendEntryDto[];
  readonly incomingRequests: FriendEntryDto[];
  readonly outgoingRequests: FriendEntryDto[];
}

export const toFriendEntryDto = (user: FriendUserSummary): FriendEntryDto => ({
  userId: user.id,
  displayName: user.name ?? undefined,
  avatarUrl: user.image ?? null,
  email: user.email ?? null,
});
