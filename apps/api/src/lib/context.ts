import type { ResponseHeadersPluginContext } from "@orpc/server/plugins";
import type { Context as HonoContext } from "hono";
import { introspectToken, type UserInfo } from "./auth/introspection";

export type CreateContextOptions = {
  context: HonoContext;
};

export interface Session {
  user: UserInfo;
}

function getClientIp(context: HonoContext): string {
  const cfConnectingIp = context.req.header("cf-connecting-ip")?.trim();
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const forwardedFor = context.req.header("x-forwarded-for");
  if (forwardedFor) {
    const firstHop = forwardedFor.split(",")[0]?.trim();
    if (firstHop) {
      return firstHop;
    }
  }

  const realIp = context.req.header("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

export async function createContext({
  context,
}: CreateContextOptions): Promise<{
  session: Session | null;
  clientIp: string;
}> {
  const clientIp = getClientIp(context);
  const authHeader = context.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { session: null, clientIp };
  }

  const token = authHeader.slice(7);
  const userInfo = await introspectToken(token);

  if (!userInfo) {
    return { session: null, clientIp };
  }

  return {
    session: {
      user: userInfo,
    },
    clientIp,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>> &
  ResponseHeadersPluginContext;
