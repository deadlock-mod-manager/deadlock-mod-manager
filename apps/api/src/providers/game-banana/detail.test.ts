import { describe, expect, it } from "bun:test";
import { isProfileStale, indexRevisionToAcknowledge } from "./detail";
import { indexListingChanged } from "./utils";

describe("GameBanana detail freshness", () => {
  const revision = new Date("2026-10-20T12:00:00Z");
  const minute = 60 * 1000;

  it("revisits an unchanged listing after an early sync, even with a fresh profile", () => {
    let stored = new Date("2026-10-19T12:00:00Z");
    expect(
      isProfileStale(revision.getTime() / 1000, revision.getTime() / 1000),
    ).toBe(false);

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

  it("identifies an older profile without throwing", () => {
    expect(isProfileStale(1792455811, 1792515954)).toBe(true);
  });

  it("accepts matching or newer profiles", () => {
    expect(isProfileStale(1792515954, 1792515954)).toBe(false);
    expect(isProfileStale(1792515955, 1792515954)).toBe(false);
  });

  it("does not compare timestamps for refreshes without a valid index timestamp", () => {
    expect(isProfileStale(1792455811, undefined)).toBe(false);
    expect(isProfileStale(1792455811, 0)).toBe(false);
  });

  it("preserves handling of undated profiles", () => {
    expect(isProfileStale(undefined, 1792515954)).toBe(false);
    expect(isProfileStale(0, 1792515954)).toBe(false);
  });
});
