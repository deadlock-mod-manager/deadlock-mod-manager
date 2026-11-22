import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import logger from "@/lib/logger";
import { NATIVE_SOURCES_QUERY_KEY, syncHostedSources } from "@/lib/mod-sources";

export const useHostedSourcesSync = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    syncHostedSources()
      .then(() =>
        queryClient.invalidateQueries({ queryKey: NATIVE_SOURCES_QUERY_KEY }),
      )
      .catch((error) => {
        logger.withError(error).warn("Hosted mod sources unavailable");
      });
  }, [queryClient]);
};
