export function imageLocationCounts(paths: readonly string[]) {
  const counts = new Map<string, number>();
  for (const path of new Set(paths)) {
    const parts = path.split("/");
    for (let length = 1; length <= parts.length; length++) {
      const ancestor = parts.slice(0, length).join("/");
      counts.set(ancestor, (counts.get(ancestor) ?? 0) + 1);
    }
  }
  return counts;
}
