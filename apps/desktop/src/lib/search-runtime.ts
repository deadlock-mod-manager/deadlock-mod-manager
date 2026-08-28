import Fuse, { type FuseOptionKey } from "fuse.js";

const FUSE_SEARCH_THRESHOLD = 0.35;

const sameKeys = <T>(
  previousKeys: readonly FuseOptionKey<T>[],
  nextKeys: readonly FuseOptionKey<T>[],
): boolean =>
  previousKeys.length === nextKeys.length &&
  previousKeys.every((key, index) => Object.is(key, nextKeys[index]));

export class FuseIndexCache<T> {
  private data: T[] | null = null;
  private keys: readonly FuseOptionKey<T>[] = [];
  private index: Fuse<T> | null = null;

  get(data: T[], keys: FuseOptionKey<T>[]): Fuse<T> {
    if (this.index && this.data === data && sameKeys(this.keys, keys)) {
      return this.index;
    }

    this.data = data;
    this.keys = [...keys];
    this.index = new Fuse(data, {
      keys,
      threshold: FUSE_SEARCH_THRESHOLD,
      shouldSort: true,
      useExtendedSearch: true,
    });
    return this.index;
  }
}

export const searchFuseIndex = <T>(
  index: Fuse<T>,
  data: T[],
  query: string,
): T[] => {
  if (!query.trim()) return data;
  return index.search(query).map((result) => result.item);
};

type ScheduleTask = (task: () => void) => number;
type CancelTask = (handle: number) => void;

export class LatestTaskScheduler {
  private generation = 0;
  private pendingHandle: number | null = null;

  constructor(
    private readonly scheduleTask: ScheduleTask,
    private readonly cancelTask: CancelTask,
  ) {}

  schedule<Result>(task: () => Result, publish: (result: Result) => void) {
    this.cancel();
    const generation = this.generation;
    this.pendingHandle = this.scheduleTask(() => {
      this.pendingHandle = null;
      const result = task();
      if (generation === this.generation) publish(result);
    });
  }

  cancel() {
    this.generation += 1;
    if (this.pendingHandle === null) return;
    this.cancelTask(this.pendingHandle);
    this.pendingHandle = null;
  }
}
