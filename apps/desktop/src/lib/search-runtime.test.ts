import { describe, expect, it } from "bun:test";
import {
  FuseIndexCache,
  LatestTaskScheduler,
  searchFuseIndex,
} from "./search-runtime";

type SearchItem = {
  name: string;
  description: string;
};

const items: SearchItem[] = [
  { name: "Alpha", description: "first mod" },
  { name: "Beta", description: "second mod" },
  { name: "Gamma", description: "third mod" },
];

describe("search runtime", () => {
  it("reuses the Fuse index until data or key content changes", () => {
    const cache = new FuseIndexCache<SearchItem>();
    const first = cache.get(items, ["name", "description"]);

    expect(cache.get(items, ["name", "description"])).toBe(first);
    expect(cache.get([...items], ["name", "description"])).not.toBe(first);
    expect(cache.get(items, ["name"])).not.toBe(first);
  });

  it("keeps rapid typing, deletion, and replacement results in query order", () => {
    const callbacks = new Map<number, () => void>();
    const canceled = new Set<number>();
    let nextHandle = 1;
    const scheduler = new LatestTaskScheduler(
      (callback) => {
        const handle = nextHandle;
        nextHandle += 1;
        callbacks.set(handle, callback);
        return handle;
      },
      (handle) => canceled.add(handle),
    );
    const index = new FuseIndexCache<SearchItem>().get(items, ["name"]);
    const published: string[][] = [];
    const scheduleQuery = (query: string) =>
      scheduler.schedule(
        () => searchFuseIndex(index, items, query).map((item) => item.name),
        (names) => published.push(names),
      );

    scheduleQuery("Al");
    scheduleQuery("Beta");
    expect(canceled.has(1)).toBe(true);
    callbacks.get(1)?.();
    callbacks.get(2)?.();
    expect(published).toEqual([["Beta"]]);

    scheduleQuery("");
    scheduleQuery("Gamma");
    callbacks.get(3)?.();
    callbacks.get(4)?.();
    expect(published).toEqual([["Beta"], ["Gamma"]]);

    scheduleQuery("");
    callbacks.get(5)?.();
    expect(published.at(-1)).toEqual(["Alpha", "Beta", "Gamma"]);
  });
});
