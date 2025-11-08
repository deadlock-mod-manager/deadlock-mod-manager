import { publicProcedure } from "../../lib/orpc";

export const authRouter = {
  getSession: publicProcedure
    .route({ method: "GET", path: "/v2/auth/session" })
    .handler(async ({ context }) => {
      return context.session;
    }),
};
