import type { Context as HonoContext } from "hono";
import { auth } from "./auth";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const authHeader = context.req.header("Authorization");
  const bearerToken = authHeader?.replace("Bearer ", "");

  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  if (bearerToken) {
    const headers = new Headers();
    headers.set("Cookie", `better-auth.session_token=${bearerToken}`);
    session = await auth.api.getSession({ headers });
  } else {
    session = await auth.api.getSession({
      headers: context.req.raw.headers,
    });
  }

  return {
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
