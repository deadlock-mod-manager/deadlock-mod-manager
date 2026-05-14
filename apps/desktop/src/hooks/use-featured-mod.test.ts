import { describe, expect, it } from "bun:test";
import type { ModDto } from "@deadlock-mods/shared";
import { ModDtoSchema } from "@deadlock-mods/shared";
import { getIsoWeekParts, pickFeaturedMod } from "./use-featured-mod";

function makeMod(
  id: string,
  downloadCount: number,
  options?: { isObsolete?: boolean; remoteUpdatedAt?: Date },
): ModDto {
  const remoteUpdatedAt =
    options?.remoteUpdatedAt ?? new Date("2026-01-23T00:00:00.000Z");
  const parsed = ModDtoSchema.parse({
    id,
    remoteId: id,
    name: `Mod ${id}`,
    description: null,
    remoteUrl: "https://example.com",
    category: "test",
    likes: 0,
    author: "author",
    downloadable: true,
    remoteAddedAt: remoteUpdatedAt,
    remoteUpdatedAt,
    tags: [],
    images: ["https://example.com/image.png"],
    hero: null,
    isAudio: false,
    isMap: false,
    audioUrl: null,
    downloadCount,
    isNSFW: false,
    filesUpdatedAt: null,
    metadata: null,
    createdAt: null,
    updatedAt: null,
  });
  return {
    ...parsed,
    isObsolete: options?.isObsolete ?? false,
  };
}

function maxConsecutiveSame(ids: string[]): number {
  if (ids.length === 0) return 0;
  let maxRun = 1;
  let run = 1;
  for (let i = 1; i < ids.length; i++) {
    if (ids[i] === ids[i - 1]) {
      run++;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 1;
    }
  }
  return maxRun;
}

function collectWeeklyPicks(pool: ModDto[], year: number): string[] {
  const picks: string[] = [];
  let lastKey = "";
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  for (let t = start; t < end; t += 86400000) {
    const date = new Date(t);
    const parts = getIsoWeekParts(date);
    const key = `${parts.year}-W${parts.week}`;
    if (key !== lastKey) {
      lastKey = key;
      const picked = pickFeaturedMod(pool, date);
      if (picked) picks.push(picked.id);
    }
  }
  return picks;
}

describe("pickFeaturedMod", () => {
  it("returns stable pick for the same instant", () => {
    const pool = [makeMod("a", 100), makeMod("b", 99)];
    const at = new Date("2025-06-15T12:00:00.000Z");
    expect(pickFeaturedMod(pool, at)?.id).toBe(pickFeaturedMod(pool, at)?.id);
  });

  it("uses many distinct mods across ISO weeks in a year", () => {
    const pool = Array.from({ length: 60 }, (_, i) =>
      makeMod(`m-${i}`, 10_000 - i),
    );
    const picks = collectWeeklyPicks(pool, 2025);
    expect(picks.length).toBeGreaterThanOrEqual(52);
    const unique = new Set(picks);
    expect(unique.size).toBeGreaterThanOrEqual(32);
  });

  it("limits long streaks of the same featured mod", () => {
    const pool = Array.from({ length: 60 }, (_, i) =>
      makeMod(`m-${i}`, 10_000 - i),
    );
    const picks = collectWeeklyPicks(pool, 2025);
    expect(maxConsecutiveSame(picks)).toBeLessThanOrEqual(4);
  });

  it("excludes ineligible mods from the pool", () => {
    const ok = makeMod("ok", 100);
    const noVisuals = ModDtoSchema.parse({
      ...ok,
      id: "nov",
      remoteId: "nov",
      images: [],
      hero: null,
      downloadCount: 999_999,
    });
    const nsfw = ModDtoSchema.parse({
      ...ok,
      id: "nsfw",
      remoteId: "nsfw",
      isNSFW: true,
      downloadCount: 999_998,
    });
    const pool = [nsfw, noVisuals, ok];
    const at = new Date("2025-03-01T00:00:00.000Z");
    expect(pickFeaturedMod(pool, at)?.id).toBe("ok");
  });

  it("excludes obsolete and outdated mods from the pool", () => {
    const ok = makeMod("ok", 100);
    const obsolete = makeMod("obs", 999_997, { isObsolete: true });
    const outdated = makeMod("old", 999_996, {
      remoteUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const pool = [obsolete, outdated, ok];
    const at = new Date("2025-03-01T00:00:00.000Z");
    expect(pickFeaturedMod(pool, at)?.id).toBe("ok");
  });
});
