import { Counter, Histogram } from "prom-client";

export const relayRequestsTotal = new Counter({
  name: "relay_mesh_requests_total",
  help: "Total number of upstream requests made to a relay",
  labelNames: ["relay", "endpoint", "outcome"] as const,
});

export const relayRequestDurationSeconds = new Histogram({
  name: "relay_mesh_request_duration_seconds",
  help: "Latency of upstream relay requests in seconds",
  labelNames: ["relay", "endpoint"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

export const relayManifestRefreshTotal = new Counter({
  name: "relay_mesh_manifest_refresh_total",
  help: "Number of relay manifest refresh attempts",
  labelNames: ["outcome"] as const,
});
