import type { RouterClient } from "@orpc/server";
import { v1Router } from "./v1";
import { v2Router } from "./v2";
import { publicRouter } from "./www";

export const appRouter = {
  ...publicRouter,
  ...v1Router,
  ...v2Router,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
