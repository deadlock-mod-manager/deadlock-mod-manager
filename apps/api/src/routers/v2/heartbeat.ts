import { db, UserRepository } from "@deadlock-mods/database";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../lib/orpc";

const userRepository = new UserRepository(db);

const MAX_ACTIVE_MODS = 200;

const HeartbeatInputSchema = z.object({
  modIds: z.array(z.string()).max(MAX_ACTIVE_MODS).optional(),
});

export const heartbeatRouter = {
  sendHeartbeat: protectedProcedure
    .route({ method: "POST", path: "/v2/heartbeat" })
    .input(HeartbeatInputSchema)
    .handler(async ({ context, input }) => {
      const sessionUserId = context.session?.user?.id;
      if (!sessionUserId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      await userRepository.updateHeartbeat(sessionUserId, input.modIds);

      return { success: true };
    }),
};
