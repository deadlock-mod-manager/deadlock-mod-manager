import {
  CODE_VERIFIER_STORAGE_KEY,
  generateCodeChallenge,
  generateCodeVerifier,
  type OIDCState,
  parseOIDCState,
  type TokenResponse,
} from "@deadlock-mods/shared/auth";
import { fetch } from "@tauri-apps/plugin-http";
import { open } from "@tauri-apps/plugin-shell";
import { AUTH_URL } from "../config";

const CLIENT_ID = "deadlockmods-desktop";
const REDIRECT_URI = `${AUTH_URL}/auth/desktop-callback`;

export { parseOIDCState, type OIDCState, type TokenResponse };

export async function initiateOIDCLogin(): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  sessionStorage.setItem(CODE_VERIFIER_STORAGE_KEY, codeVerifier);

  const state: OIDCState = { returnTo: "/" };
  const encodedState = btoa(JSON.stringify(state));

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid profile email",
    state: encodedState,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `${AUTH_URL}/api/auth/oauth2/authorize?${params}`;
  await open(authUrl);
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<TokenResponse> {
  const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_STORAGE_KEY);

  if (!codeVerifier) {
    throw new Error("Code verifier not found. Please initiate login again.");
  }

  const tokenUrl = `${AUTH_URL}/api/auth/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: codeVerifier,
  }).toString();

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    sessionStorage.removeItem(CODE_VERIFIER_STORAGE_KEY);
    throw new Error(`Token exchange failed: ${error}`);
  }

  sessionStorage.removeItem(CODE_VERIFIER_STORAGE_KEY);
  return response.json() as Promise<TokenResponse>;
}

export async function refreshTokens(
  refreshToken: string,
): Promise<TokenResponse> {
  const response = await fetch(`${AUTH_URL}/api/auth/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  return response.json() as Promise<TokenResponse>;
}
