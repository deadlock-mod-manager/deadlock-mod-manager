import { protectedProcedure, publicProcedure } from "../../lib/orpc";
import { UserIdResponseSchema } from "../../validation/auth";

export const authRouter = {
  getSession: publicProcedure
    .route({ method: "GET", path: "/v2/auth/session" })
    .handler(async ({ context }) => {
      return context.session;
    }),
  getUserId: protectedProcedure
    .route({ method: "GET", path: "/v2/auth/user-id" })
    .output(UserIdResponseSchema)
    .handler(async ({ context }) => {
      return { userId: context.session.user.id };
    }),
};
