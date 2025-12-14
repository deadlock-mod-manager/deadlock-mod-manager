import { invoke } from "@tauri-apps/api/core";
import { refreshTokens, type TokenResponse } from "./oidc";

interface StoredTokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let accessToken: string | null = null;
let tokenExpiresAt: number | null = null;
let refreshToken: string | null = null;

export async function setTokens(tokenResponse: TokenResponse): Promise<void> {
  accessToken = tokenResponse.access_token;
  tokenExpiresAt = Date.now() + tokenResponse.expires_in * 1000;
  refreshToken = tokenResponse.refresh_token || null;

  const tokenData: StoredTokenData = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token || "",
    expiresAt: tokenExpiresAt,
  };

  await invoke("store_auth_token", { token: JSON.stringify(tokenData) });
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function isTokenExpired(): boolean {
  if (!tokenExpiresAt) return true;
  return Date.now() >= tokenExpiresAt - 60000;
}

export async function ensureValidToken(): Promise<string | null> {
  if (accessToken && !isTokenExpired()) {
    return accessToken;
  }

  if (!refreshToken) {
    return null;
  }

  try {
    const tokenResponse = await refreshTokens(refreshToken);
    await setTokens(tokenResponse);
    return accessToken;
  } catch {
    await clearTokens();
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  tokenExpiresAt = null;
  refreshToken = null;
  await invoke("clear_auth_token");
}

export async function loadStoredTokens(): Promise<boolean> {
  try {
    const storedToken = await invoke<string | null>("get_auth_token");
    if (!storedToken) {
      return false;
    }

    const tokenData: StoredTokenData = JSON.parse(storedToken);

    accessToken = tokenData.accessToken;
    refreshToken = tokenData.refreshToken || null;
    tokenExpiresAt = tokenData.expiresAt;

    if (isTokenExpired() && refreshToken) {
      const token = await ensureValidToken();
      return !!token;
    }

    return !!accessToken;
  } catch {
    return false;
  }
}

export function hasTokens(): boolean {
  return !!accessToken || !!refreshToken;
}
