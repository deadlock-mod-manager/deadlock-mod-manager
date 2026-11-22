import { createServerFn } from "@tanstack/react-start";
import type { ChangeKind } from "./changelog";
import { DESKTOP_RELEASES } from "./desktop-changelog";

const V2_VERSION = "2.0.0";

/**
 * Reads the 2.0.0 release notes on the server, so the /v2 page gets its
 * numbers and fix list without shipping the whole changelog to the browser.
 */
export const getV2Stats = createServerFn({ method: "GET" }).handler(() => {
  const changes =
    DESKTOP_RELEASES.find((release) => release.version === V2_VERSION)
      ?.changes ?? [];
  const ofKind = (kind: ChangeKind) =>
    changes.filter((change) => change.kind === kind);
  return {
    new: ofKind("new").length,
    improved: ofKind("improved").length,
    fixes: ofKind("fixed").map((change) => change.summary),
  };
});
