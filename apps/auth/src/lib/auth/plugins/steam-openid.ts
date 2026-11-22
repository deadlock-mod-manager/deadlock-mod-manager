import { z } from "zod";

export const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_CLAIMED_ID =
  /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const NONCE_MAX_AGE_MS = 5 * 60 * 1000;

const NonceSchema = z
  .string()
  .regex(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)[\x21-\x7e]{1,64}$/,
    "nonce must be an OpenID 2.0 response_nonce",
  );

export type SteamAssertion = Record<string, string | undefined>;

export type SteamAssertionCheck =
  | { ok: true; steamId: string; nonce: string }
  | { ok: false; reason: string };

/**
 * Checks that an OpenID positive assertion was issued by Steam, for this server, and is not
 * being replayed. Steam's `check_authentication` only proves the signature is genuine; it does
 * not prove the assertion was meant for our realm, so an attacker could obtain one for their
 * own site and relay it here. These checks run before that round trip. The caller records the
 * returned nonce with `NonceStore.record` once Steam confirms the signature, so a transient
 * Steam failure leaves the assertion retryable and unverified callbacks fill no memory.
 */
export function checkSteamAssertion(
  params: SteamAssertion,
  expectedReturnTo: string,
  seenNonces: NonceStore,
  now = Date.now(),
): SteamAssertionCheck {
  if (params["openid.ns"] !== "http://specs.openid.net/auth/2.0") {
    return { ok: false, reason: "openid_ns_mismatch" };
  }
  if (params["openid.mode"] !== "id_res") {
    return { ok: false, reason: "openid_mode_mismatch" };
  }
  if (params["openid.op_endpoint"] !== STEAM_OPENID_ENDPOINT) {
    return { ok: false, reason: "openid_op_endpoint_mismatch" };
  }

  const returnTo = params["openid.return_to"];
  if (!returnTo || !sameEndpoint(returnTo, expectedReturnTo)) {
    return { ok: false, reason: "openid_return_to_mismatch" };
  }

  const claimedId = params["openid.claimed_id"];
  const steamId = claimedId?.match(STEAM_CLAIMED_ID)?.[1];
  if (!steamId || params["openid.identity"] !== claimedId) {
    return { ok: false, reason: "openid_claimed_id_invalid" };
  }

  const signed = new Set(params["openid.signed"]?.split(","));
  for (const field of [
    "op_endpoint",
    "return_to",
    "response_nonce",
    "claimed_id",
    "identity",
  ]) {
    if (!signed.has(field)) {
      return { ok: false, reason: `openid_${field}_unsigned` };
    }
  }

  const nonce = NonceSchema.safeParse(params["openid.response_nonce"]);
  if (!nonce.success) {
    return { ok: false, reason: "openid_nonce_invalid" };
  }
  const issuedAt = Date.parse(nonce.data.slice(0, 20));
  if (Number.isNaN(issuedAt) || Math.abs(now - issuedAt) > NONCE_MAX_AGE_MS) {
    return { ok: false, reason: "openid_nonce_expired" };
  }
  if (seenNonces.has(nonce.data, now)) {
    return { ok: false, reason: "openid_nonce_replayed" };
  }

  return { ok: true, steamId, nonce: nonce.data };
}

/**
 * Steam signs `openid.return_to`, which carries our own query (`callbackURL`, `email`,
 * `linkAccount`...). The request query is what the browser sent, which an attacker can edit.
 * Every value we act on must be the signed one.
 */
export function signedQueryMatches(
  signedReturnTo: string,
  requestQuery: Record<string, string | undefined>,
): boolean {
  let signed: URLSearchParams;
  try {
    signed = new URL(signedReturnTo).searchParams;
  } catch {
    return false;
  }
  for (const [key, value] of Object.entries(requestQuery)) {
    if (key.startsWith("openid.") || value === undefined) {
      continue;
    }
    if (signed.get(key) !== value) {
      return false;
    }
  }
  return true;
}

/** Same scheme, host, port and path. The query is compared separately by `signedQueryMatches`. */
function sameEndpoint(actual: string, expected: string): boolean {
  try {
    const a = new URL(actual);
    const e = new URL(expected);
    return a.origin === e.origin && a.pathname === e.pathname;
  } catch {
    return false;
  }
}

/**
 * Remembers nonces until they expire. Steam nonces carry their issue time and we only accept
 * them for five minutes, so an in-process set bounded by that window is enough to stop replay
 * on a single instance. Multiple replicas each keep their own set, which still limits a replay
 * to one use per replica inside the window.
 */
export class NonceStore {
  private readonly expiresAt = new Map<string, number>();

  has(nonce: string, now: number): boolean {
    this.evict(now);
    return this.expiresAt.has(nonce);
  }

  record(nonce: string, now = Date.now()): void {
    this.expiresAt.set(nonce, now + NONCE_MAX_AGE_MS);
  }

  private evict(now: number): void {
    for (const [nonce, expiry] of this.expiresAt) {
      if (expiry <= now) {
        this.expiresAt.delete(nonce);
      }
    }
  }
}
