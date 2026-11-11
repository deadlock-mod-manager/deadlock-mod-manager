// The share fixtures with slow file lookups and slow archives, so the request
// log shows whether an import downloads one mod while it looks up the next.
import type { FixtureRequest, FixtureRoute } from "./fixture-server";
import { shareRoutes } from "./profile-share-fixtures";

const SLOW_MS = 1_500;
const isLookup = (url: string) => url.includes("/DownloadPage");
const isArchive = (url: string) => url.startsWith("/dl/");

export const slowShareRoutes = async () => {
  const base = await shareRoutes();
  return (origin: string): FixtureRoute[] =>
    base(origin).map((route) =>
      isLookup(route.path) || isArchive(route.path)
        ? Object.assign(route, { headerDelayMs: SLOW_MS })
        : route,
    );
};

/** The first archive was still downloading while a file lookup ran. */
export const assertDownloadOverlapsLookup = (
  _id: string,
  requests: readonly FixtureRequest[],
) => {
  const first = requests.find((request) => isArchive(request.url));
  if (!first?.endedAt) throw new Error("The import downloaded no archive");
  const { at, endedAt } = first;
  const overlapping = requests.some(
    (request) =>
      isLookup(request.url) &&
      request.at < endedAt &&
      request.endedAt !== undefined &&
      request.endedAt > at,
  );
  if (!overlapping)
    throw new Error(
      `The first archive (${at}–${endedAt}) downloaded while no file lookup ran: ${JSON.stringify(
        requests
          .filter((request) => isLookup(request.url) || isArchive(request.url))
          .map(({ url, at, endedAt }) => ({ url, at, endedAt })),
      )}`,
    );
};
