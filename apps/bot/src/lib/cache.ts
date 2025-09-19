import { createCache } from "cache-manager";
import { createKeyv } from "cacheable";

const memoryStore = createKeyv();
export const cache = createCache({
  stores: [memoryStore],
});

export const getCache = () => cache;
