import type { Context as HonoContext } from "hono";
import { introspectToken, type UserInfo } from "./auth/introspection";

export type CreateContextOptions = {
  context: HonoContext;
};

export interface Session {
  user: UserInfo;
}

export async function createContext({
  context,
}: CreateContextOptions): Promise<{ session: Session | null }> {
  const authHeader = context.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { session: null };
  }

  const token = authHeader.slice(7);
  const userInfo = await introspectToken(token);

  if (!userInfo) {
    return { session: null };
  }

  return {
    session: {
      user: userInfo,
    },
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
