import { getSessionCookie } from "better-auth/cookies";
import { Hono } from "hono";
import { auth } from "../lib/auth";

const desktopAuthRouter = new Hono();

desktopAuthRouter.get("/session", async (c) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Invalid session" }, 401);
  }

  return c.json({
    cookieValue: getSessionCookie(c.req.raw.headers),
    token: session.session.token,
    user: session.user,
    session: session.session,
  });
});

desktopAuthRouter.get("/validate", async (c) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return c.json({ error: "No token provided" }, 401);
  }

  const headers = new Headers();
  headers.set("Cookie", `better-auth.session_token=${token}`);

  const session = await auth.api.getSession({
    headers,
  });

  if (!session) {
    return c.json({ error: "Invalid session" }, 401);
  }

  return c.json({
    user: session.user,
    session: session.session,
  });
});

export default desktopAuthRouter;
