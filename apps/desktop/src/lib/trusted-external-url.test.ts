import { describe, expect, it } from "bun:test";
import { isTrustedExternalUrl } from "./trusted-external-url";

describe("isTrustedExternalUrl", () => {
  it("accepts https urls on the trusted hosts and their subdomains", () => {
    expect(isTrustedExternalUrl("https://gamebanana.com/mods/693642")).toBe(
      true,
    );
    expect(isTrustedExternalUrl("https://www.gamebanana.com/tools/20525")).toBe(
      true,
    );
    expect(isTrustedExternalUrl("https://docs.deadlockmods.app/")).toBe(true);
    expect(isTrustedExternalUrl("https://deadlock-api.com/")).toBe(true);
  });

  it("rejects untrusted hosts", () => {
    expect(isTrustedExternalUrl("https://example.com/mods/1")).toBe(false);
    // Suffix without a dot boundary, e.g. someone registering evilgamebanana.com
    expect(isTrustedExternalUrl("https://evilgamebanana.com/mods/1")).toBe(
      false,
    );
    // Trusted host in the path or query only
    expect(
      isTrustedExternalUrl("https://example.com/?ref=gamebanana.com/mods/1"),
    ).toBe(false);
  });

  it("rejects non-https protocols", () => {
    expect(isTrustedExternalUrl("http://gamebanana.com/mods/1")).toBe(false);
    expect(isTrustedExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isTrustedExternalUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects empty and unparseable values", () => {
    expect(isTrustedExternalUrl(null)).toBe(false);
    expect(isTrustedExternalUrl(undefined)).toBe(false);
    expect(isTrustedExternalUrl("")).toBe(false);
    expect(isTrustedExternalUrl("not a url")).toBe(false);
  });
});
