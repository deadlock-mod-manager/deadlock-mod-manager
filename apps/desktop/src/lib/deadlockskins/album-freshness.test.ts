import type { ModDto } from "@deadlock-mods/shared";
import { describe, expect, test } from "bun:test";
import { MOD_OUTDATED_CUTOFF_SECONDS } from "@/lib/constants";
import { getAlbumFreshness } from "./album-freshness";

const updatedAt = (offsetSeconds: number) =>
  ({
    remoteUpdatedAt: new Date(
      (MOD_OUTDATED_CUTOFF_SECONDS + offsetSeconds) * 1000,
    ),
  }) as ModDto;

const fresh = updatedAt(60);
const stale = updatedAt(-60);

describe("album freshness", () => {
  test("is current when every mod was updated after the patch", () => {
    expect(getAlbumFreshness([fresh, fresh])).toEqual({
      status: "current",
      outdated: 0,
      total: 2,
    });
  });

  test("is partial when only some mods predate the patch", () => {
    expect(getAlbumFreshness([fresh, stale, stale])).toEqual({
      status: "partial",
      outdated: 2,
      total: 3,
    });
  });

  test("is outdated when every mod predates the patch", () => {
    expect(getAlbumFreshness([stale])?.status).toBe("outdated");
  });

  test("counts updates from patch day before the release as outdated", () => {
    expect(
      getAlbumFreshness([
        { remoteUpdatedAt: new Date("2026-09-29T12:00:00Z") } as ModDto,
      ])?.status,
    ).toBe("outdated");
  });

  test("clears once the author updates the last stale mod", () => {
    expect(getAlbumFreshness([fresh, stale])?.status).toBe("partial");
    expect(getAlbumFreshness([fresh, fresh])?.status).toBe("current");
  });

  test("has no verdict without catalog data", () => {
    expect(getAlbumFreshness([])).toBeNull();
  });
});
