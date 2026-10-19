import type { Report } from "@deadlock-mods/database";

export function reportCacheKeys(
  deletedReports: Report[],
  submissionIds: string[] = [],
): string[] {
  const keys = new Set<string>();
  for (const id of submissionIds) {
    keys.add(`reports:mod:${id}`);
    keys.add(`reports:counts:${id}`);
  }
  for (const report of deletedReports) {
    if (report.submissionId) {
      const slug =
        report.submissionType === "sound"
          ? `snd-${report.submissionId}`
          : report.submissionId;
      keys.add(`reports:mod:${slug}`);
      keys.add(`reports:counts:${slug}`);
    }
    if (report.modId) {
      keys.add(`reports:mod:${report.modId}`);
      keys.add(`reports:counts:${report.modId}`);
    }
  }
  // The recent reports endpoint accepts limits from 1 through 100.
  for (let limit = 1; limit <= 100; limit++) {
    keys.add(`reports:recent:${limit}`);
  }
  return [...keys];
}

export async function summarizeClearedReports(
  deletedReports: Report[],
  mods: Array<{ id: string; slug: string }>,
  readCachedCount: (slug: string) => Promise<number | undefined>,
): Promise<{ totalCount: number; cacheKeys: string[] }> {
  const slugsByModId = new Map(mods.map((mod) => [mod.id, mod.slug]));
  const submissions = new Map<string, { count: number; ids: Set<string> }>();
  for (const mod of mods) {
    const entry = submissions.get(mod.slug) ?? {
      count: 0,
      ids: new Set<string>(),
    };
    entry.ids.add(mod.slug);
    entry.ids.add(mod.id);
    submissions.set(mod.slug, entry);
  }
  let unidentifiedCount = 0;
  for (const report of deletedReports) {
    let slug = report.modId
      ? (slugsByModId.get(report.modId) ?? report.modId)
      : null;
    if (report.submissionId) {
      slug =
        report.submissionType === "sound"
          ? `snd-${report.submissionId}`
          : report.submissionId;
    }
    if (!slug) {
      unidentifiedCount++;
      continue;
    }
    const entry = submissions.get(slug) ?? { count: 0, ids: new Set<string>() };
    entry.count++;
    entry.ids.add(slug);
    if (report.modId) entry.ids.add(report.modId);
    submissions.set(slug, entry);
  }
  const totals = await Promise.all(
    [...submissions.values()].map(async ({ count, ids }) => {
      const cached = await Promise.all([...ids].map(readCachedCount));
      return Math.max(count, ...cached.map((value) => value ?? 0));
    }),
  );
  const ids: string[] = [];
  for (const entry of submissions.values()) ids.push(...entry.ids);
  return {
    totalCount: totals.reduce((sum, count) => sum + count, unidentifiedCount),
    cacheKeys: reportCacheKeys(deletedReports, ids),
  };
}
