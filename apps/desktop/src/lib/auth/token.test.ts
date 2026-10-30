import { describe, expect, it, mock } from "bun:test";

mock.module("@tauri-apps/api/core", () => ({
  invoke: async () => {},
}));

let refreshCalls = 0;
mock.module("./oidc", () => ({
  TokenRefreshError: class extends Error {},
  refreshTokens: async () => {
    refreshCalls++;
    await Bun.sleep(10);
    return {
      access_token: `access-${refreshCalls}`,
      refresh_token: `refresh-${refreshCalls}`,
      expires_in: 3600,
      token_type: "Bearer",
    };
  },
}));

const { ensureValidToken, setTokens } = await import("./token");

describe("ensureValidToken", () => {
  it("shares one refresh between concurrent callers", async () => {
    await setTokens({
      access_token: "expired",
      refresh_token: "refresh-0",
      expires_in: 0,
      token_type: "Bearer",
    });

    const tokens = await Promise.all(
      Array.from({ length: 5 }, () => ensureValidToken()),
    );

    expect(refreshCalls).toBe(1);
    expect(new Set(tokens)).toEqual(new Set(["access-1"]));
  });
});
