import { UnauthorizedError } from "@deadlock-mods/common";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  type OIDCState,
  type TokenResponse,
} from "@deadlock-mods/shared/auth";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { env } from "../../../../env";
import { AUTH_URL } from "../config";
import {
  ACCESS_TOKEN_COOKIE,
  CLIENT_ID,
  PKCE_COOKIE,
  REFRESH_TOKEN_COOKIE,
  TOKEN_EXPIRY_COOKIE,
} from "./constants";

const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
  token_type: z.string(),
});

const isProduction = env.NODE_ENV === "production";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
};

export function getRedirectUri(): string {
  if (env.BASE_URL) {
    const baseUrl = new URL(env.BASE_URL);
    return `${baseUrl.origin}/auth/callback`;
  }

  if (isProduction) {
    throw new Error(
      "BASE_URL environment variable is required in production for secure OAuth redirects",
    );
  }

  return "http://localhost:3003/auth/callback";
}

export async function createAuthorizationUrl(
  returnTo: string,
): Promise<string> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  setCookie(PKCE_COOKIE, codeVerifier, {
    ...COOKIE_OPTIONS,
    maxAge: 600, // 10 minutes for PKCE flow
  });

  const state: OIDCState = { returnTo: returnTo || "/" };
  const encodedState = btoa(JSON.stringify(state));

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "openid profile email offline_access",
    state: encodedState,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${AUTH_URL}/api/auth/oauth2/authorize?${params}`;
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<TokenResponse> {
  const codeVerifier = getCookie(PKCE_COOKIE);

  if (!codeVerifier) {
    throw new Error("Code verifier not found. Please initiate login again.");
  }

  const response = await fetch(`${AUTH_URL}/api/auth/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  // Clear the PKCE cookie
  setCookie(PKCE_COOKIE, "", {
    ...COOKIE_OPTIONS,
    maxAge: 0,
  });

  const data = await response.json();
  return TokenResponseSchema.parse(data);
}

export function setAuthCookies(tokenResponse: TokenResponse): void {
  const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

  setCookie(ACCESS_TOKEN_COOKIE, tokenResponse.access_token, {
    ...COOKIE_OPTIONS,
    maxAge: tokenResponse.expires_in,
  });

  setCookie(TOKEN_EXPIRY_COOKIE, expiresAt.toString(), {
    ...COOKIE_OPTIONS,
    maxAge: tokenResponse.expires_in,
  });

  if (tokenResponse.refresh_token) {
    setCookie(REFRESH_TOKEN_COOKIE, tokenResponse.refresh_token, {
      ...COOKIE_OPTIONS,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
  }
}

export function clearAuthCookies(): void {
  const clearOptions = {
    ...COOKIE_OPTIONS,
    maxAge: 0,
  };

  setCookie(ACCESS_TOKEN_COOKIE, "", clearOptions);
  setCookie(REFRESH_TOKEN_COOKIE, "", clearOptions);
  setCookie(TOKEN_EXPIRY_COOKIE, "", clearOptions);
}

export function getAccessToken(): string | null {
  return getCookie(ACCESS_TOKEN_COOKIE) || null;
}

export function getRefreshToken(): string | null {
  return getCookie(REFRESH_TOKEN_COOKIE) || null;
}

export function isTokenExpired(): boolean {
  const expiry = getCookie(TOKEN_EXPIRY_COOKIE);
  if (!expiry) return true;

  const expiresAt = Number.parseInt(expiry, 10);
  return Date.now() >= expiresAt - 60000; // 1 minute buffer
}

export async function refreshTokens(): Promise<TokenResponse> {
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  const response = await fetch(`${AUTH_URL}/api/auth/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });

  if (!response.ok) {
    clearAuthCookies();
    throw new Error("Token refresh failed");
  }

  const data = await response.json();
  const tokenResponse = TokenResponseSchema.parse(data);
  setAuthCookies(tokenResponse);

  return tokenResponse;
}

export async function ensureValidToken(): Promise<string> {
  const accessToken = getAccessToken();

  if (accessToken && !isTokenExpired()) {
    return accessToken;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new UnauthorizedError("Authentication required");
  }

  try {
    const tokenResponse = await refreshTokens();
    return tokenResponse.access_token;
  } catch {
    clearAuthCookies();
    throw new UnauthorizedError("Authentication required");
  }
}

export function parseOIDCState(state: string | null): OIDCState {
  if (!state) {
    return { returnTo: "/" };
  }

  try {
    return JSON.parse(atob(state)) as OIDCState;
  } catch {
    return { returnTo: "/" };
  }
}
