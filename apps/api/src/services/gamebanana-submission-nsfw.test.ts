import { describe, expect, it } from "bun:test";
import { fetchGameBananaSubmission } from "./gamebanana-submission";
import { ServerModsResolver } from "./server-mods-resolver";

interface SafetyCase {
  name: string;
  ratings?: Record<string, string>;
  visibility?: string;
  expected: boolean;
}

const cases: SafetyCase[] = [
  {
    name: "sexual content",
    ratings: { sc: "Sexual Content" },
    expected: true,
  },
  {
    name: "fetishistic",
    ratings: { ft: "Fetishistic" },
    expected: true,
  },
  { name: "hidden", visibility: "hide", expected: true },
  { name: "warning", visibility: "warn", expected: true },
  {
    name: "safe",
    ratings: {},
    visibility: "show",
    expected: false,
  },
];

describe("direct GameBanana NSFW parity", () => {
  for (const entry of cases) {
    it(`classifies ${entry.name} profiles like the sync provider`, async () => {
      const profile = {
        _idRow: 42,
        _sName: "Test submission",
        _aSubmitter: { _sName: "Author" },
        _aGame: { _idRow: 20_948 },
        _aContentRatings: entry.ratings,
        _sInitialVisibility: entry.visibility,
      };
      const fetcher: typeof fetch = Object.assign(
        () => Promise.resolve(Response.json(profile)),
        { preconnect: () => {} },
      );
      const resolver = new ServerModsResolver(
        (identity) => fetchGameBananaSubmission(identity, fetcher),
        () => Promise.resolve([]),
      );

      const result = await resolver.resolve([
        {
          id: "required-submission",
          provider: "gamebanana",
          url: "https://gamebanana.com/mods/42",
        },
      ]);

      expect(result.resolved[0]?.mod?.isNSFW).toBe(entry.expected);
      expect(result.resolved[0]?.resolved).toBe(true);
    });
  }
});
