import type { ModAuthorDto } from "@deadlock-mods/shared";
import { skipToken, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { COMMISSIONS_URL } from "@/lib/constants";
import { fetch } from "@/lib/fetch";
import { STALE_TIME_API } from "@/lib/query-constants";

const CommissionAuthorSchema = z.object({
  author: z.object({
    availability: z.enum(["open", "limited", "closed"]),
  }),
});

export type CommissionAvailability = z.infer<
  typeof CommissionAuthorSchema
>["author"]["availability"];

const commissionsLink = (path: string) =>
  new URL(path, COMMISSIONS_URL).toString();

const findCommissionAuthor = async (remoteId: string) => {
  const response = await fetch(
    commissionsLink(
      `api/authors/gamebanana/${encodeURIComponent(remoteId)}`,
    ),
    { method: "GET" },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Commissions author lookup failed (${response.status})`);
  }
  const { author } = CommissionAuthorSchema.parse(await response.json());
  return {
    availability: author.availability,
    requestUrl:
      author.availability === "closed"
        ? null
        : commissionsLink(
            `requests/new?gamebanana=${encodeURIComponent(remoteId)}`,
          ),
  };
};

/**
 * The author's DMM Commissions listing, or null when they aren't a verified
 * commissions author (or the site is offline). `requestUrl` is null while
 * their commissions are closed.
 */
export const useCommissionAuthor = (
  author: ModAuthorDto | null | undefined,
) => {
  const remoteId =
    author?.provider === "gamebanana" ? author.remoteId : undefined;
  const { data } = useQuery({
    queryKey: ["commission-author", remoteId],
    queryFn:
      // The E2E harness only reaches fixture servers, never the live site.
      remoteId && import.meta.env.VITE_DMM_E2E_HARNESS !== "1"
        ? () => findCommissionAuthor(remoteId)
        : skipToken,
    staleTime: STALE_TIME_API,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
  return data ?? null;
};
