import type { Context as HonoContext } from "hono";
import { auth } from "./auth";
import { env } from "./env";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const authHeader = context.req.header("Authorization");
  const rawBearerToken = authHeader?.replace("Bearer ", "");

  const bearerToken = rawBearerToken
    ? decodeURIComponent(rawBearerToken)
    : undefined;

  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  if (bearerToken) {
    const headers = new Headers();
    const cookieName =
      env.NODE_ENV === "production"
        ? "__Secure-better-auth.session_token"
        : "better-auth.session_token";
    headers.set("Cookie", `${cookieName}=${bearerToken}`);
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
