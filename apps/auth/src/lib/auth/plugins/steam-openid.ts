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
  | { ok: true; steamId: string }
  | { ok: false; reason: string };

/**
 * Checks that an OpenID positive assertion was issued by Steam, for this server, and is not
 * being replayed. Steam's `check_authentication` only proves the signature is genuine; it does
 * not prove the assertion was meant for our realm, so an attacker could obtain one for their
 * own site and relay it here. These checks run before that round trip.
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
  if (!seenNonces.add(nonce.data, now, NONCE_MAX_AGE_MS)) {
    return { ok: false, reason: "openid_nonce_replayed" };
  }

  return { ok: true, steamId };
}

/** Same scheme, host, port and path. Query differs: Steam echoes ours, but we built the URL. */
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

  /** Returns false if the nonce was already seen. */
  add(nonce: string, now: number, ttlMs: number): boolean {
    this.evict(now);
    if (this.expiresAt.has(nonce)) {
      return false;
    }
    this.expiresAt.set(nonce, now + ttlMs);
    return true;
  }

  private evict(now: number): void {
    for (const [nonce, expiry] of this.expiresAt) {
      if (expiry <= now) {
        this.expiresAt.delete(nonce);
      }
    }
  }
}
