import { db, UserRepository } from "@deadlock-mods/database";
import {
  type FriendEntryDto,
  type FriendListDto,
  toFriendEntryDto,
} from "@deadlock-mods/shared";
import { ORPCError } from "@orpc/server";
import { logger } from "@/lib/logger";
import { protectedProcedure } from "../../lib/orpc";
import {
  FriendListResponseSchema,
  RemoveFriendInputSchema,
  RespondToFriendRequestInputSchema,
  SendFriendRequestInputSchema,
} from "../../validation/friends";

const userRepository = new UserRepository(db);

const toFriendDtoList = async (userId: string): Promise<FriendListDto> => {
  const state = await userRepository.getFriendState(userId);
  if (!state) {
    throw new ORPCError("NOT_FOUND", {
      message: "Account not found for current user",
    });
  }

  const { friends, incomingFriendRequests, outgoingFriendRequests } = state;
  const lookupIds = new Set([
    ...friends,
    ...incomingFriendRequests,
    ...outgoingFriendRequests,
  ]);

  const [users, onlineStatuses] = await Promise.all([
    userRepository.getUsersByIds(Array.from(lookupIds)),
    userRepository.getOnlineStatus(friends),
  ]);

  const userMap = new Map(users.map((user) => [user.id, user]));
  const onlineMap = new Map(
    onlineStatuses.map((status) => [status.userId, status.isOnline]),
  );

  const mapEntries = (
    ids: readonly string[],
    includeOnlineStatus: boolean,
  ): FriendEntryDto[] =>
    ids.map((id) => {
      const user = userMap.get(id);
      const isOnline = includeOnlineStatus ? onlineMap.get(id) : undefined;
      return user ? toFriendEntryDto(user, isOnline) : { userId: id, isOnline };
    });

  return {
    friends: mapEntries(friends, true),
    incomingRequests: mapEntries(incomingFriendRequests, false),
    outgoingRequests: mapEntries(outgoingFriendRequests, false),
  };
};

export const friendsRouter = {
  listFriends: protectedProcedure
    .route({ method: "GET", path: "/v2/friends" })
    .output(FriendListResponseSchema)
    .handler(async ({ context }) => {
      const sessionUserId = context.session?.user?.id;
      if (!sessionUserId) {
        throw new ORPCError("UNAUTHORIZED");
      }
      return await toFriendDtoList(sessionUserId);
    }),

  sendFriendRequest: protectedProcedure
    .route({ method: "POST", path: "/v2/friends/requests" })
    .input(SendFriendRequestInputSchema)
    .output(FriendListResponseSchema)
    .handler(async ({ context, input }) => {
      const sessionUserId = context.session?.user?.id;
      if (!sessionUserId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const targetUserId = input.targetUserId;
      if (sessionUserId === targetUserId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "You cannot send a friend request to yourself",
        });
      }

      await db.transaction(async (trx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transactionalRepo = new UserRepository(trx as any);
        const currentState =
          await transactionalRepo.getFriendState(sessionUserId);
        if (!currentState) {
          throw new ORPCError("NOT_FOUND", {
            message: "Account not found for current user",
          });
        }

        const targetState =
          await transactionalRepo.getFriendState(targetUserId);
        if (!targetState) {
          throw new ORPCError("NOT_FOUND", {
            message: "Target account not found",
          });
        }

        if (currentState.friends.includes(targetUserId)) {
          throw new ORPCError("BAD_REQUEST", {
            message: "You are already friends",
          });
        }

        if (currentState.incomingFriendRequests.includes(targetUserId)) {
          throw new ORPCError("CONFLICT", {
            message: "Accept the existing friend request instead",
          });
        }

        if (currentState.outgoingFriendRequests.includes(targetUserId)) {
          logger
            .withMetadata({
              requesterUserId: sessionUserId,
              targetUserId,
            })
            .info("Duplicate friend request ignored");
          return;
        }

        await transactionalRepo.createFriendRequest(
          sessionUserId,
          targetUserId,
        );
      });

      logger
        .withMetadata({
          requesterUserId: sessionUserId,
          targetUserId: input.targetUserId,
        })
        .info("Friend request submitted");

      return await toFriendDtoList(sessionUserId);
    }),

  acceptFriendRequest: protectedProcedure
    .route({ method: "POST", path: "/v2/friends/requests/accept" })
    .input(RespondToFriendRequestInputSchema)
    .output(FriendListResponseSchema)
    .handler(async ({ context, input }) => {
      const sessionUserId = context.session?.user?.id;
      if (!sessionUserId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const requesterUserId = input.requesterUserId;

      await db.transaction(async (trx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transactionalRepo = new UserRepository(trx as any);
        const currentState =
          await transactionalRepo.getFriendState(sessionUserId);
        if (!currentState) {
          throw new ORPCError("NOT_FOUND", {
            message: "Account not found for current user",
          });
        }

        if (!currentState.incomingFriendRequests.includes(requesterUserId)) {
          throw new ORPCError("NOT_FOUND", {
            message: "No pending friend request from the specified user",
          });
        }

        const requesterState =
          await transactionalRepo.getFriendState(requesterUserId);
        if (!requesterState) {
          throw new ORPCError("NOT_FOUND", {
            message: "Requester account not found",
          });
        }

        await transactionalRepo.acceptFriendRequest(
          sessionUserId,
          requesterUserId,
        );
      });

      logger
        .withMetadata({
          requesterUserId,
          accepterUserId: sessionUserId,
        })
        .info("Friend request accepted");

      return await toFriendDtoList(sessionUserId);
    }),

  declineFriendRequest: protectedProcedure
    .route({ method: "POST", path: "/v2/friends/requests/decline" })
    .input(RespondToFriendRequestInputSchema)
    .output(FriendListResponseSchema)
    .handler(async ({ context, input }) => {
      const sessionUserId = context.session?.user?.id;
      if (!sessionUserId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const requesterUserId = input.requesterUserId;

      await db.transaction(async (trx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transactionalRepo = new UserRepository(trx as any);
        const currentState =
          await transactionalRepo.getFriendState(sessionUserId);
        if (!currentState) {
          throw new ORPCError("NOT_FOUND", {
            message: "Account not found for current user",
          });
        }

        if (!currentState.incomingFriendRequests.includes(requesterUserId)) {
          throw new ORPCError("NOT_FOUND", {
            message: "No pending friend request from the specified user",
          });
        }

        const requesterState =
          await transactionalRepo.getFriendState(requesterUserId);
        if (!requesterState) {
          throw new ORPCError("NOT_FOUND", {
            message: "Requester account not found",
          });
        }

        await transactionalRepo.declineFriendRequest(
          sessionUserId,
          requesterUserId,
        );
      });

      logger
        .withMetadata({
          requesterUserId,
          declinerUserId: sessionUserId,
        })
        .info("Friend request declined");

      return await toFriendDtoList(sessionUserId);
    }),

  cancelFriendRequest: protectedProcedure
    .route({ method: "POST", path: "/v2/friends/requests/cancel" })
    .input(SendFriendRequestInputSchema)
    .output(FriendListResponseSchema)
    .handler(async ({ context, input }) => {
      const sessionUserId = context.session?.user?.id;
      if (!sessionUserId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const targetUserId = input.targetUserId;

      await db.transaction(async (trx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transactionalRepo = new UserRepository(trx as any);
        const currentState =
          await transactionalRepo.getFriendState(sessionUserId);
        if (!currentState) {
          throw new ORPCError("NOT_FOUND", {
            message: "Account not found for current user",
          });
        }

        if (!currentState.outgoingFriendRequests.includes(targetUserId)) {
          throw new ORPCError("NOT_FOUND", {
            message: "No pending outgoing friend request to cancel",
          });
        }

        const targetState =
          await transactionalRepo.getFriendState(targetUserId);
        if (!targetState) {
          throw new ORPCError("NOT_FOUND", {
            message: "Target account not found",
          });
        }

        await transactionalRepo.cancelFriendRequest(
          sessionUserId,
          targetUserId,
        );
      });

      logger
        .withMetadata({
          requesterUserId: sessionUserId,
          targetUserId,
        })
        .info("Friend request cancelled");

      return await toFriendDtoList(sessionUserId);
    }),

  removeFriend: protectedProcedure
    .route({ method: "DELETE", path: "/v2/friends/{friendUserId}" })
    .input(RemoveFriendInputSchema)
    .output(FriendListResponseSchema)
    .handler(async ({ context, input }) => {
      const sessionUserId = context.session?.user?.id;
      if (!sessionUserId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const friendUserId = input.friendUserId;

      await db.transaction(async (trx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transactionalRepo = new UserRepository(trx as any);
        const currentState =
          await transactionalRepo.getFriendState(sessionUserId);
        if (!currentState) {
          throw new ORPCError("NOT_FOUND", {
            message: "Account not found for current user",
          });
        }

        if (!currentState.friends.includes(friendUserId)) {
          throw new ORPCError("BAD_REQUEST", {
            message: "The specified user is not in your friends list",
          });
        }

        const friendState =
          await transactionalRepo.getFriendState(friendUserId);
        if (!friendState) {
          throw new ORPCError("NOT_FOUND", {
            message: "Friend account not found",
          });
        }

        await transactionalRepo.removeFriendship(sessionUserId, friendUserId);
      });

      logger
        .withMetadata({
          removerUserId: sessionUserId,
          removedFriendUserId: friendUserId,
        })
        .info("Friend removed");

      return await toFriendDtoList(sessionUserId);
    }),
};
