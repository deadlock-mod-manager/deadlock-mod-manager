import { useQuery } from "@tanstack/react-query";
import { fetch } from "@/lib/fetch";
import { STALE_TIME_API } from "@/lib/query-constants";

// The commissions site isn't live yet. Probe both places it may land and only
// surface the entry point once one of them answers.
const COMMISSIONS_URLS = [
  "https://commissions.deadlockmods.app/",
  "https://deadlockmods.app/commissions",
];

// deadlockmods.app answers unknown paths with its 404 page but status 200, so a
// 200 alone doesn't mean the commissions page exists. That page is recognised
// by its headline.
const NOT_FOUND_HEADLINE = "Lost in the Astral Gates";

const isNotFoundPage = (html: string) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll("h1")).some(
    (heading) => heading.textContent?.trim() === NOT_FOUND_HEADLINE,
  );
};

const isReachable = async (url: string) => {
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) return false;
    return !isNotFoundPage(await response.text());
  } catch {
    return false;
  }
};

const findCommissionsUrl = async (): Promise<string | null> => {
  for (const url of COMMISSIONS_URLS) {
    if (await isReachable(url)) return url;
  }
  return null;
};

/** The reachable commissions URL, or null while it is offline. */
export const useCommissionsUrl = () => {
  const { data } = useQuery({
    queryKey: ["commissions-url"],
    queryFn: findCommissionsUrl,
    staleTime: STALE_TIME_API,
    refetchOnWindowFocus: false,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });

  return data ?? null;
};
