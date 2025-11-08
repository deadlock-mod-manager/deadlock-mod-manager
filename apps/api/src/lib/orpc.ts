import { ORPCError, os } from "@orpc/server";
import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);

const requireAdmin = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }

  const user = context.session.user as typeof context.session.user & {
    isAdmin?: boolean;
  };

  if (!user.isAdmin) {
    throw new ORPCError("FORBIDDEN", {
      message: "Admin access required",
    });
  }

  return next({
    context: {
      session: context.session,
    },
  });
});

export const adminProcedure = protectedProcedure.use(requireAdmin);
