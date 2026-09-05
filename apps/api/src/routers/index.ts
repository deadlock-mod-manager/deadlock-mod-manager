import type { RouterClient } from "@orpc/server";
import { v2Router } from "./v2";
import { publicRouter } from "./www";

export const appRouter = {
  ...publicRouter,
  ...v2Router,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
