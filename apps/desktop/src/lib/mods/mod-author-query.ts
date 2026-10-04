import { queryOptions } from "@tanstack/react-query";
import { getModAuthor } from "@/lib/api-client";
import { returnNullForNotFound } from "@/lib/http-error";
import { STALE_TIME_API } from "@/lib/query-constants";

export const modAuthorQueryOptions = (authorId: string) =>
  queryOptions({
    queryKey: ["mod-author", authorId],
    queryFn: () => getModAuthor(authorId).catch(returnNullForNotFound),
    staleTime: STALE_TIME_API,
    retry: 3,
  });
