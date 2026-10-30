import { describe, expect, it } from "bun:test";
import {
  checkSteamAssertion,
  NonceStore,
  STEAM_OPENID_ENDPOINT,
} from "./steam-openid";

const RETURN_TO = "https://auth.deadlockmods.app/api/auth/steam/callback";
const NOW = Date.parse("2026-10-30T12:00:30Z");

function assertion(overrides: Record<string, string | undefined> = {}) {
  return {
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "id_res",
    "openid.op_endpoint": STEAM_OPENID_ENDPOINT,
    "openid.claimed_id":
      "https://steamcommunity.com/openid/id/76561198000000001",
    "openid.identity": "https://steamcommunity.com/openid/id/76561198000000001",
    "openid.return_to": `${RETURN_TO}?callbackURL=https%3A%2F%2Fdeadlockmods.app%2F`,
    "openid.response_nonce": "2026-10-30T12:00:00Zabc123",
    "openid.assoc_handle": "1234567890",
    "openid.signed":
      "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "base64sig=",
    ...overrides,
  };
}

describe("checkSteamAssertion", () => {
  it("accepts a genuine assertion and extracts the SteamID", () => {
    const result = checkSteamAssertion(
      assertion(),
      RETURN_TO,
      new NonceStore(),
      NOW,
    );
    expect(result).toEqual({ ok: true, steamId: "76561198000000001" });
  });

  it("rejects an assertion issued for another site's return_to", () => {
    const result = checkSteamAssertion(
      assertion({ "openid.return_to": "https://evil.example/steam/callback" }),
      RETURN_TO,
      new NonceStore(),
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: "openid_return_to_mismatch" });
  });

  it("rejects a return_to on a different path of our origin", () => {
    const result = checkSteamAssertion(
      assertion({ "openid.return_to": "https://auth.deadlockmods.app/other" }),
      RETURN_TO,
      new NonceStore(),
      NOW,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a non-Steam op_endpoint", () => {
    const result = checkSteamAssertion(
      assertion({ "openid.op_endpoint": "https://evil.example/openid/login" }),
      RETURN_TO,
      new NonceStore(),
      NOW,
    );
    expect(result).toEqual({
      ok: false,
      reason: "openid_op_endpoint_mismatch",
    });
  });

  it("rejects a claimed_id that is not a Steam identity URL", () => {
    for (const claimed of [
      "https://evil.example/openid/id/76561198000000001",
      "https://steamcommunity.com/openid/id/76561198000000001/../76561198000000002",
      "https://steamcommunity.com/openid/id/abc",
      "https://steamcommunity.com.evil.example/openid/id/76561198000000001",
    ]) {
      const result = checkSteamAssertion(
        assertion({ "openid.claimed_id": claimed, "openid.identity": claimed }),
        RETURN_TO,
        new NonceStore(),
        NOW,
      );
      expect(result.ok).toBe(false);
    }
  });

  it("rejects when identity and claimed_id disagree", () => {
    const result = checkSteamAssertion(
      assertion({
        "openid.identity":
          "https://steamcommunity.com/openid/id/76561198000000002",
      }),
      RETURN_TO,
      new NonceStore(),
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: "openid_claimed_id_invalid" });
  });

  it("rejects when a security-relevant field is not covered by the signature", () => {
    const result = checkSteamAssertion(
      assertion({
        "openid.signed": "signed,op_endpoint,claimed_id,identity,assoc_handle",
      }),
      RETURN_TO,
      new NonceStore(),
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: "openid_return_to_unsigned" });
  });

  it("rejects a stale nonce", () => {
    const result = checkSteamAssertion(
      assertion({ "openid.response_nonce": "2026-10-30T11:00:00Zabc123" }),
      RETURN_TO,
      new NonceStore(),
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: "openid_nonce_expired" });
  });

  it("rejects a replayed nonce", () => {
    const store = new NonceStore();
    expect(checkSteamAssertion(assertion(), RETURN_TO, store, NOW).ok).toBe(
      true,
    );
    expect(checkSteamAssertion(assertion(), RETURN_TO, store, NOW)).toEqual({
      ok: false,
      reason: "openid_nonce_replayed",
    });
  });
});
