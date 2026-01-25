import type { FriendUserSummary } from "@deadlock-mods/database";

export interface FriendEntryDto {
  readonly userId: string;
  readonly displayName?: string;
  readonly avatarUrl?: string | null;
  readonly isOnline?: boolean;
}

export interface FriendListDto {
  readonly friends: FriendEntryDto[];
  readonly incomingRequests: FriendEntryDto[];
  readonly outgoingRequests: FriendEntryDto[];
}

export const toFriendEntryDto = (
  user: FriendUserSummary,
  isOnline?: boolean,
): FriendEntryDto => ({
  userId: user.id,
  displayName: user.name ?? undefined,
  avatarUrl: user.image ?? null,
  isOnline,
});

export interface FriendModUsageDto {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
}

export interface FriendsActiveModsDto {
  readonly [modId: string]: FriendModUsageDto[];
}
