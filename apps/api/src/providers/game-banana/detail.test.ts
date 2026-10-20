import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { assertProfileFresh, fetchDetailPage } from "./detail";

afterEach(() => mock.restore());

describe("GameBanana detail freshness", () => {
  const kinds: Array<"Mod" | "Sound"> = ["Mod", "Sound"];
  const pages: Array<"ProfilePage" | "DownloadPage"> = [
    "ProfilePage",
    "DownloadPage",
  ];
  for (const kind of kinds) {
    for (const page of pages) {
      it(`bypasses an older cached ${kind} ${page} for a changed listing`, async () => {
        const fetch = spyOn(globalThis, "fetch").mockImplementation(
          Object.assign(
            async (input: string | Request | URL) => {
              const url = new URL(String(input));
              const fresh = url.searchParams.get("_v") === "1792515954";
              return Response.json({
                _aFiles: [{ _idRow: fresh ? 1856171 : 1744602 }],
              });
            },
            { preconnect: globalThis.fetch.preconnect },
          ),
        );

        const cached = await fetchDetailPage("629490", kind, page);
        const fresh = await fetchDetailPage("629490", kind, page, 1792515954);

        expect(await cached.json()).toEqual({ _aFiles: [{ _idRow: 1744602 }] });
        expect(await fresh.json()).toEqual({ _aFiles: [{ _idRow: 1856171 }] });
        expect(fetch).toHaveBeenLastCalledWith(
          `https://gamebanana.com/apiv11/${kind}/629490/${page}?_v=1792515954`,
        );
      });
    }
  }

  it("rejects an older profile so sync cannot acknowledge the newer listing", () => {
    expect(() => assertProfileFresh(1792455811, 1792515954)).toThrow(
      "GameBanana profile is older than its index listing",
    );
  });

  it("accepts matching or newer profiles", () => {
    expect(() => assertProfileFresh(1792515954, 1792515954)).not.toThrow();
    expect(() => assertProfileFresh(1792515955, 1792515954)).not.toThrow();
  });

  it("does not compare timestamps for refreshes without a valid index timestamp", () => {
    expect(() => assertProfileFresh(1792455811, undefined)).not.toThrow();
    expect(() => assertProfileFresh(1792455811, 0)).not.toThrow();
  });

  it("preserves handling of undated profiles", () => {
    expect(() => assertProfileFresh(undefined, 1792515954)).not.toThrow();
    expect(() => assertProfileFresh(0, 1792515954)).not.toThrow();
  });
});
