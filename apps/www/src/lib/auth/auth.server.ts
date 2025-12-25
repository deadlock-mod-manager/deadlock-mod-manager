import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AUTH_URL } from "../config.server";
import {
  clearAuthCookies,
  createAuthorizationUrl,
  ensureValidToken,
  exchangeCodeForTokens,
  parseOIDCState,
  setAuthCookies,
} from "./server";

const OIDCUserSchema = z.object({
  sub: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  picture: z.string().nullable().optional(),
  isAdmin: z.boolean().optional(),
});

const InitiateLoginInput = z.object({
  returnTo: z
    .string()
    .optional()
    .refine(
      (val) => !val || (val.startsWith("/") && !val.startsWith("//")),
      "returnTo must be a relative path",
    ),
});

export const initiateLogin = createServerFn({ method: "GET" })
  .inputValidator(InitiateLoginInput.parse)
  .handler(async ({ data }) => {
    const authUrl = await createAuthorizationUrl(data.returnTo || "/");
    return { authUrl };
  });

export const handleCallback = createServerFn({ method: "GET" })
  .inputValidator(
    (data: {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    if (data.error) {
      throw redirect({
        to: "/login",
        search: { error: data.error_description || data.error },
      });
    }

    if (!data.code) {
      throw redirect({
        to: "/login",
        search: { error: "No authorization code received" },
      });
    }

    try {
      const tokenResponse = await exchangeCodeForTokens(data.code);
      setAuthCookies(tokenResponse);

      const { returnTo } = parseOIDCState(data.state || null);
      throw redirect({ to: returnTo });
    } catch (err) {
      if (err instanceof Response || (err as { status?: number }).status) {
        throw err;
      }
      throw redirect({
        to: "/login",
        search: {
          error:
            err instanceof Error ? err.message : "Failed to complete login",
        },
      });
    }
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  clearAuthCookies();
  throw redirect({ to: "/" });
});

async function fetchSession() {
  let token: string;
  try {
    token = await ensureValidToken();
  } catch {
    return null;
  }

  try {
    const response = await fetch(`${AUTH_URL}/api/auth/oauth2/userinfo`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        clearAuthCookies();
      }
      return null;
    }

    const json = await response.json();
    const result = OIDCUserSchema.safeParse(json);

    if (!result.success) {
      return null;
    }

    return { user: result.data };
  } catch {
    return null;
  }
}

export const getServerSession = createServerFn({ method: "GET" }).handler(
  async () => {
    return fetchSession();
  },
);

export const checkAuth = createServerFn({ method: "GET" }).handler(async () => {
  const session = await fetchSession();
  return {
    isLoggedIn: !!session?.user,
    isAdmin: !!session?.user?.isAdmin,
  };
});
