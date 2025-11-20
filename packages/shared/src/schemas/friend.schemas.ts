import { z } from "zod";

export const FriendEntrySchema = z.object({
  userId: z.string(),
  displayName: z.string().optional(),
  avatarUrl: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
});

export const FriendListSchema = z.object({
  friends: z.array(FriendEntrySchema),
  incomingRequests: z.array(FriendEntrySchema),
  outgoingRequests: z.array(FriendEntrySchema),
});
