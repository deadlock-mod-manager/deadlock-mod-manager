import { Counter } from "prom-client";

export const relayManifestRefreshTotal = new Counter({
  name: "relay_mesh_manifest_refresh_total",
  help: "Number of relay manifest refresh attempts",
  labelNames: ["outcome"] as const,
});
