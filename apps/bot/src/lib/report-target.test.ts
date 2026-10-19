import { describe, expect, it, mock } from "bun:test";
import { ProviderError, ValidationError } from "@deadlock-mods/common";
import {
  parseReportTarget,
  type ReportTarget,
  resolveReportTarget,
} from "./report-target";

describe("report targets", () => {
  it("accepts mod links, sound links, and IDs without mixing namespaces", () => {
    for (const input of ["https://gamebanana.com/mods/688091", "688091"]) {
      expect(parseReportTarget(input)).toEqual({
        kind: "submission",
        identity: {
          provider: "gamebanana",
          submissionType: "mod",
          submissionId: "688091",
        },
      });
    }
    for (const input of [
      "https://www.gamebanana.com/sounds/688091/?x=y#files",
      "snd-688091",
    ]) {
      expect(parseReportTarget(input)).toEqual({
        kind: "submission",
        identity: {
          provider: "gamebanana",
          submissionType: "sound",
          submissionId: "688091",
        },
      });
    }
  });

  it("accepts member links and trims exact author names", () => {
    expect(
      parseReportTarget(" https://gamebanana.com/members/5573864 "),
    ).toEqual({
      kind: "member",
      memberId: "5573864",
    });
    expect(parseReportTarget("  Author Name_%  ")).toEqual({
      kind: "author",
      authorName: "Author Name_%",
    });
  });

  it("accepts punctuation in author names", () => {
    expect(parseReportTarget("Author: Name")).toEqual({
      kind: "author",
      authorName: "Author: Name",
    });
  });

  it("rejects malformed URLs and unsafe targets instead of treating them as names", () => {
    for (const input of [
      "",
      "   ",
      "http://gamebanana.com/mods/688091",
      "https://gamebanana.com.evil.test/mods/688091",
      "https://evil.test/members/5573864",
      "https://gamebanana.com@evil.test/mods/688091",
      "https://user@gamebanana.com/mods/688091",
      "https://gamebanana.com:8443/mods/688091",
      "https://gamebanana.com/maps/688091",
      "https://gamebanana.com/members/0",
      "https://gamebanana.com/mods/688091/extra",
      "gamebanana.com/mods/688091",
      "https://",
      "//gamebanana.com/mods/688091",
    ]) {
      expect(() => parseReportTarget(input)).toThrow(ValidationError);
    }
  });

  it("resolves a member URL through a validated GameBanana profile", async () => {
    const fetcher = mock(async (_input: string, _init?: RequestInit) =>
      Response.json({ _idRow: 5573864, _sName: "Mod Author" }),
    );
    expect(
      await resolveReportTarget(
        { kind: "member", memberId: "5573864" },
        fetcher,
      ),
    ).toEqual({
      kind: "author",
      authorName: "Mod Author",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toMatchObject([
      "https://gamebanana.com/apiv11/Member/5573864/ProfilePage",
      { signal: expect.any(AbortSignal) },
    ]);
  });

  it("does not call GameBanana for author names or mod links", async () => {
    const fetcher = mock(async () => new Response(null, { status: 500 }));
    for (const input of ["Mod Author", "https://gamebanana.com/mods/688091"]) {
      const target = parseReportTarget(input);
      expect<ReportTarget>(await resolveReportTarget(target, fetcher)).toBe(
        target,
      );
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails safely when a member is missing or GameBanana is unavailable", async () => {
    const target = parseReportTarget("https://gamebanana.com/members/5573864");
    await expect(
      resolveReportTarget(
        target,
        async () => new Response(null, { status: 404 }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      resolveReportTarget(
        target,
        async () => new Response(null, { status: 503 }),
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    for (const profile of [
      { _idRow: 123, _sName: "Wrong Author" },
      { _idRow: 5573864, _sName: " " },
      { _sName: "Missing ID" },
    ]) {
      await expect(
        resolveReportTarget(target, async () => Response.json(profile)),
      ).rejects.toBeInstanceOf(ProviderError);
    }
  });
});
