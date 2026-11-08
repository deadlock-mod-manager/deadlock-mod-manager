import { useQuery } from "@tanstack/react-query";
import { isHostedSource, PERFORMANCE_PACK_TAG } from "@/lib/hosted-sources";
import {
  NATIVE_SOURCES_QUERY_KEY,
  queryNativeSource,
  useNativeSources,
} from "@/lib/mod-sources";

/** Installable hosted listings tagged as performance packs. */
export const usePerformancePacks = () => {
  const { data: sources = [] } = useNativeSources();
  const hosted = sources.filter(
    (source) => source.enabled && !source.removed && isHostedSource(source),
  );

  return useQuery({
    queryKey: [
      ...NATIVE_SOURCES_QUERY_KEY,
      "performance-packs",
      hosted.map((source) => source.key),
    ],
    queryFn: async () => {
      const listings = await Promise.all(
        hosted.map((source) => queryNativeSource(source.key)),
      );
      return listings
        .flat()
        .filter(
          (listing) =>
            listing.availability === "available" &&
            listing.tags.includes(PERFORMANCE_PACK_TAG),
        );
    },
    enabled: hosted.length > 0,
    meta: { skipGlobalErrorHandler: true },
  });
};
