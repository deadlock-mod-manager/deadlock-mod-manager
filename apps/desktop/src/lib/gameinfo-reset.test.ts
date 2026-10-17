import { expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { refreshGameinfoState } from "./gameinfo-reset";

it("refreshes failed status and mod-path queries and records vanilla mode after reset", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let corrupted = true;
  const status = {
    queryKey: ["gameinfo-status"],
    queryFn: async () => {
      if (corrupted) throw new Error("parse failure");
      return "valid";
    },
  };
  await expect(client.fetchQuery(status)).rejects.toThrow("parse failure");
  client.setQueryData(["gameinfo-mod-paths"], true);
  let lastLaunchVanilla = false;
  corrupted = false;
  await refreshGameinfoState(client, (vanilla) => {
    lastLaunchVanilla = vanilla;
  });
  expect(lastLaunchVanilla).toBe(true);
  expect(client.getQueryState(["gameinfo-status"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["gameinfo-mod-paths"])?.isInvalidated).toBe(
    true,
  );
  const refreshed: string = await client.fetchQuery(status);
  expect(refreshed).toBe("valid");
  client.clear();
});
