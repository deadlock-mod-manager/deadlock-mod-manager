import { FriendListSchema } from "@deadlock-mods/shared";
import { z } from "zod";

export const SendFriendRequestInputSchema = z.object({
  targetUserId: z.string().min(1, "Target user ID is required"),
});

export const RespondToFriendRequestInputSchema = z.object({
  requesterUserId: z.string().min(1, "Requester user ID is required"),
});

export const RemoveFriendInputSchema = z.object({
  friendUserId: z.string().min(1, "Friend user ID is required"),
});

export const FriendListResponseSchema = FriendListSchema;
