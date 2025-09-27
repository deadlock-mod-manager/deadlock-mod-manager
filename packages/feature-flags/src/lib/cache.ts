import { DEFAULT_CACHE } from "@deadlock-mods/common";
import { useAdapter } from "@type-cacheable/cache-manager-adapter";

export const cacheClient = useAdapter(DEFAULT_CACHE);
