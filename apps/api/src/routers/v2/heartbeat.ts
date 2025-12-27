import { db, UserRepository } from "@deadlock-mods/database";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "../../lib/orpc";

const userRepository = new UserRepository(db);

export const heartbeatRouter = {
  sendHeartbeat: protectedProcedure
    .route({ method: "POST", path: "/v2/heartbeat" })
    .handler(async ({ context }) => {
      const sessionUserId = context.session?.user?.id;
      if (!sessionUserId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      await userRepository.updateHeartbeat(sessionUserId);

      return { success: true };
    }),
};
