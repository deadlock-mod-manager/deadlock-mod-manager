import {
  db,
  type UserFriendState,
  UserRepository,
} from "@deadlock-mods/database";
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

const uniqueList = (ids: readonly string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!id) {
      continue;
    }
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
};

const addUnique = (ids: readonly string[], id: string): string[] => {
  if (!id) {
    return [...ids];
  }
  if (ids.includes(id)) {
    return [...ids];
  }
  return [...ids, id];
};

const removeId = (ids: readonly string[], id: string): string[] =>
  ids.filter((value) => value !== id);

const toFriendDtoList = async (userId: string): Promise<FriendListDto> => {
  const state = await userRepository.getFriendState(userId);
  if (!state) {
    throw new ORPCError("NOT_FOUND", {
      message: "Account not found for current user",
    });
  }

  const friends = uniqueList(state.friends);
  const incoming = uniqueList(state.incomingFriendRequests);
  const outgoing = uniqueList(state.outgoingFriendRequests);
  const lookupIds = uniqueList([...friends, ...incoming, ...outgoing]);

  const users = await userRepository.getUsersByIds(lookupIds);
  const userMap = new Map(users.map((user) => [user.id, user]));

  const mapEntries = (ids: readonly string[]): FriendEntryDto[] =>
    ids.map((id) => {
      const user = userMap.get(id);
      return user ? toFriendEntryDto(user) : { userId: id };
    });

  return {
    friends: mapEntries(friends),
    incomingRequests: mapEntries(incoming),
    outgoingRequests: mapEntries(outgoing),
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
        const transactionalRepo = new UserRepository(trx);
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

        const nextCurrentState: UserFriendState = {
          friends: uniqueList(currentState.friends),
          incomingFriendRequests: removeId(
            currentState.incomingFriendRequests,
            targetUserId,
          ),
          outgoingFriendRequests: addUnique(
            currentState.outgoingFriendRequests,
            targetUserId,
          ),
        };
        const nextTargetState: UserFriendState = {
          friends: uniqueList(targetState.friends),
          incomingFriendRequests: addUnique(
            targetState.incomingFriendRequests,
            sessionUserId,
          ),
          outgoingFriendRequests: removeId(
            targetState.outgoingFriendRequests,
            sessionUserId,
          ),
        };

        await transactionalRepo.updateFriendState(
          sessionUserId,
          nextCurrentState,
        );
        await transactionalRepo.updateFriendState(
          targetUserId,
          nextTargetState,
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
        const transactionalRepo = new UserRepository(trx);
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

        const nextCurrentState: UserFriendState = {
          friends: addUnique(currentState.friends, requesterUserId),
          incomingFriendRequests: removeId(
            currentState.incomingFriendRequests,
            requesterUserId,
          ),
          outgoingFriendRequests: removeId(
            currentState.outgoingFriendRequests,
            requesterUserId,
          ),
        };

        const nextRequesterState: UserFriendState = {
          friends: addUnique(requesterState.friends, sessionUserId),
          incomingFriendRequests: removeId(
            requesterState.incomingFriendRequests,
            sessionUserId,
          ),
          outgoingFriendRequests: removeId(
            requesterState.outgoingFriendRequests,
            sessionUserId,
          ),
        };

        await transactionalRepo.updateFriendState(
          sessionUserId,
          nextCurrentState,
        );
        await transactionalRepo.updateFriendState(
          requesterUserId,
          nextRequesterState,
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
        const transactionalRepo = new UserRepository(trx);
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

        const nextCurrentState: UserFriendState = {
          friends: uniqueList(currentState.friends),
          incomingFriendRequests: removeId(
            currentState.incomingFriendRequests,
            requesterUserId,
          ),
          outgoingFriendRequests: uniqueList(
            currentState.outgoingFriendRequests,
          ),
        };

        const nextRequesterState: UserFriendState = {
          friends: uniqueList(requesterState.friends),
          incomingFriendRequests: uniqueList(
            requesterState.incomingFriendRequests,
          ),
          outgoingFriendRequests: removeId(
            requesterState.outgoingFriendRequests,
            sessionUserId,
          ),
        };

        await transactionalRepo.updateFriendState(
          sessionUserId,
          nextCurrentState,
        );
        await transactionalRepo.updateFriendState(
          requesterUserId,
          nextRequesterState,
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
        const transactionalRepo = new UserRepository(trx);
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

        const nextCurrentState: UserFriendState = {
          friends: uniqueList(currentState.friends),
          incomingFriendRequests: uniqueList(
            currentState.incomingFriendRequests,
          ),
          outgoingFriendRequests: removeId(
            currentState.outgoingFriendRequests,
            targetUserId,
          ),
        };

        const nextTargetState: UserFriendState = {
          friends: uniqueList(targetState.friends),
          incomingFriendRequests: removeId(
            targetState.incomingFriendRequests,
            sessionUserId,
          ),
          outgoingFriendRequests: uniqueList(
            targetState.outgoingFriendRequests,
          ),
        };

        await transactionalRepo.updateFriendState(
          sessionUserId,
          nextCurrentState,
        );
        await transactionalRepo.updateFriendState(
          targetUserId,
          nextTargetState,
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
        const transactionalRepo = new UserRepository(trx);
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

        const nextCurrentState: UserFriendState = {
          friends: removeId(currentState.friends, friendUserId),
          incomingFriendRequests: removeId(
            currentState.incomingFriendRequests,
            friendUserId,
          ),
          outgoingFriendRequests: removeId(
            currentState.outgoingFriendRequests,
            friendUserId,
          ),
        };

        const nextFriendState: UserFriendState = {
          friends: removeId(friendState.friends, sessionUserId),
          incomingFriendRequests: removeId(
            friendState.incomingFriendRequests,
            sessionUserId,
          ),
          outgoingFriendRequests: removeId(
            friendState.outgoingFriendRequests,
            sessionUserId,
          ),
        };

        await transactionalRepo.updateFriendState(
          sessionUserId,
          nextCurrentState,
        );
        await transactionalRepo.updateFriendState(
          friendUserId,
          nextFriendState,
        );
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
