import { auth } from ".";

const REFRESH_RACE_RETRIES = 3;
const REFRESH_RACE_DELAY_MS = 100;

interface OAuthErrorBody {
  error?: string;
  error_description?: string;
}

const isRefreshRaceLoss = async (response: Response): Promise<boolean> => {
  if (response.status !== 400) return false;
  const body: OAuthErrorBody | null = await response
    .clone()
    .json()
    .catch(() => null);
  return (
    body?.error === "invalid_grant" &&
    body.error_description === "invalid refresh token"
  );
};

/**
 * Desktop builds send several refreshes with the same token at once. The
 * oauth provider rotates the token before it stores the replay response, so
 * requests landing in between are rejected and the client signs the user out.
 * Retrying after the winner has stored its replay returns the same tokens.
 */
export const handleAuthRequest = async (
  request: Request,
): Promise<Response> => {
  if (
    request.method !== "POST" ||
    !new URL(request.url).pathname.endsWith("/oauth2/token")
  ) {
    return auth.handler(request);
  }

  const body = await request.text();
  const send = () =>
    auth.handler(
      new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body,
      }),
    );

  if (new URLSearchParams(body).get("grant_type") !== "refresh_token") {
    return send();
  }

  let response = await send();
  for (
    let attempt = 1;
    attempt <= REFRESH_RACE_RETRIES && (await isRefreshRaceLoss(response));
    attempt++
  ) {
    await Bun.sleep(REFRESH_RACE_DELAY_MS * attempt);
    response = await send();
  }
  return response;
};
