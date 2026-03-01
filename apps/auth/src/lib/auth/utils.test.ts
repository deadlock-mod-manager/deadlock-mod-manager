import { describe, expect, it } from "bun:test";
import { wildcardMatch } from "./utils";

describe("wildcardMatch URL origin validation", () => {
  it("matches single-level subdomains with dot separator", () => {
    const isMatch = wildcardMatch(["https://*.example.com"], {
      separator: ".",
    });
    expect(isMatch("https://app.example.com")).toBe(true);
    expect(isMatch("https://api.example.com")).toBe(true);
  });

  it("rejects multi-level subdomains with dot separator", () => {
    const isMatch = wildcardMatch(["https://*.example.com"], {
      separator: ".",
    });
    expect(isMatch("https://malicious.attacker.example.com")).toBe(false);
    expect(isMatch("https://a.b.c.d.example.com")).toBe(false);
  });

  it("rejects apex domain when pattern expects subdomain", () => {
    const isMatch = wildcardMatch(["https://*.example.com"], {
      separator: ".",
    });
    expect(isMatch("https://example.com")).toBe(false);
  });

  it("vulnerable default separator matches multi-level subdomains", () => {
    const isMatch = wildcardMatch(["https://*.example.com"]);
    expect(isMatch("https://app.example.com")).toBe(true);
    expect(isMatch("https://malicious.attacker.example.com")).toBe(true);
  });
});
