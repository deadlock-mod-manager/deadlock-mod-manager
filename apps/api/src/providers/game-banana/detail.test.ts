import { describe, expect, it } from "bun:test";
import { assertProfileFresh, indexRevisionToAcknowledge } from "./detail";
import { indexListingChanged } from "./utils";

describe("GameBanana detail freshness", () => {
  const revision = new Date("2026-10-20T12:00:00Z");
  const minute = 60 * 1000;

  it("revisits an unchanged listing after an early sync, even with a fresh profile", () => {
    let stored = new Date("2026-10-19T12:00:00Z");
    assertProfileFresh(revision.getTime() / 1000, revision.getTime() / 1000);

    const early = indexRevisionToAcknowledge(
      revision,
      revision.getTime() + 5 * minute,
    );
    expect(early).toBeUndefined();
    stored = early ?? stored;
    expect(indexListingChanged(revision, stored)).toBe(true);

    const recheck = indexRevisionToAcknowledge(
      revision,
      revision.getTime() + 20 * minute,
    );
    expect(recheck).toEqual(revision);
    stored = recheck ?? stored;
    expect(indexListingChanged(revision, stored)).toBe(false);
  });

  it("leaves a new mod eligible for a recheck", () => {
    const stored = indexRevisionToAcknowledge(revision, revision.getTime());
    expect(stored).toBeUndefined();
    expect(indexListingChanged(revision, stored)).toBe(true);
  });

  it("acknowledges revisions only once the cache window has elapsed before fetching", () => {
    expect(
      indexRevisionToAcknowledge(
        revision,
        revision.getTime() + 10 * minute - 1,
      ),
    ).toBeUndefined();
    expect(
      indexRevisionToAcknowledge(revision, revision.getTime() + 10 * minute),
    ).toEqual(revision);
    expect(
      indexRevisionToAcknowledge(revision, revision.getTime() - minute),
    ).toBeUndefined();
  });

  it("does not acknowledge a revision for background refreshes", () => {
    expect(
      indexRevisionToAcknowledge(undefined, revision.getTime()),
    ).toBeUndefined();
  });

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
