import { z } from "zod";

export const FriendEntrySchema = z.object({
  userId: z.string(),
  displayName: z.string().optional(),
  avatarUrl: z.string().nullable().optional(),
  isOnline: z.boolean().optional(),
});

export const FriendListSchema = z.object({
  friends: z.array(FriendEntrySchema),
  incomingRequests: z.array(FriendEntrySchema),
  outgoingRequests: z.array(FriendEntrySchema),
});

export type FriendEntry = z.infer<typeof FriendEntrySchema>;
export type FriendList = z.infer<typeof FriendListSchema>;
