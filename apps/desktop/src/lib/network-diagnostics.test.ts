import { describe, expect, it } from "bun:test";
import en from "@/locales/en.json";
import type { CatalogSyncStatusDto } from "@/types/generated/CatalogSyncStatusDto";
import {
  createPendingResults,
  DNS_PROBE_URL,
  evaluateCatalog,
  INTERNET_PROBE_URL,
  NETWORK_CHECK_IDS,
  NETWORK_CHECK_MESSAGES,
  NETWORK_FIXES,
  type NetworkCheckId,
  type NetworkCheckResult,
  type NetworkDiagnosticsDeps,
  runNetworkDiagnostics,
  summarizeNetworkDiagnostics,
} from "./network-diagnostics";

const ORIGINS = {
  dmmApi: "https://dmm.test",
  gamebanana: "https://gb.test",
  deadlockApi: "https://dlapi.test",
  assets: "https://assets.test",
};

type Reply = number | "fail" | "hang" | "dns";

const catalog = (
  overrides: Partial<CatalogSyncStatusDto> = {},
): CatalogSyncStatusDto => ({
  syncPhase: null,
  syncPercentage: null,
  available: true,
  count: 1200,
  stale: false,
  lastIncrementalAt: null,
  lastFullSyncAt: null,
  outcome: null,
  unavailableReason: null,
  ...overrides,
});

/** Answers by URL prefix; anything unmatched gets a 200. */
const fakeFetch = (replies: Record<string, Reply> = {}) => {
  const calls: string[] = [];
  const fetch: NetworkDiagnosticsDeps["fetch"] = (url, init) => {
    calls.push(url);
    const match = Object.keys(replies).find((prefix) => url.startsWith(prefix));
    const reply = match === undefined ? 200 : replies[match];
    if (reply === "fail")
      return Promise.reject(new Error("connection refused"));
    if (reply === "dns")
      return Promise.reject(
        new Error(
          "error sending request: dns error: failed to lookup address information",
        ),
      );
    if (reply === "hang") {
      return new Promise((_, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      });
    }
    return Promise.resolve({ status: reply });
  };
  return { fetch, calls };
};

const deps = (
  overrides: Partial<NetworkDiagnosticsDeps> = {},
): NetworkDiagnosticsDeps => ({
  fetch: fakeFetch().fetch,
  isOnline: () => true,
  inspectCatalog: async () => catalog(),
  proxyEnabled: false,
  origins: ORIGINS,
  now: () => 0,
  timeoutMs: 50,
  ...overrides,
});

const byId = (results: NetworkCheckResult[], id: NetworkCheckId) => {
  const result = results.find((entry) => entry.id === id);
  if (!result) throw new Error(`missing ${id}`);
  return result;
};

const REMOTE_IDS: NetworkCheckId[] = [
  "dmmApi",
  "gamebanana",
  "deadlockApi",
  "deadlockAssets",
];

describe("runNetworkDiagnostics", () => {
  it("passes every check when everything is reachable", async () => {
    const results = await runNetworkDiagnostics(deps());

    expect(results.map((r) => r.id)).toEqual([...NETWORK_CHECK_IDS]);
    for (const result of results) {
      expect(result.status).toBe("ok");
      expect(result.fixes).toEqual([]);
    }
    expect(byId(results, "catalog").params).toEqual({ count: 1200 });
    expect(summarizeNetworkDiagnostics(results)).toBe("ok");
  });

  it("runs the checks one after another, top to bottom", async () => {
    const snapshots: NetworkCheckResult[][] = [];
    await runNetworkDiagnostics(deps(), (results) => snapshots.push(results));

    expect(snapshots).toHaveLength(NETWORK_CHECK_IDS.length * 2);
    NETWORK_CHECK_IDS.forEach((id, index) => {
      const running = snapshots[index * 2];
      const done = snapshots[index * 2 + 1];
      expect(byId(running, id).status).toBe("running");
      expect(byId(done, id).status).toBe("ok");
      // Nothing below the current check has started yet.
      for (const later of NETWORK_CHECK_IDS.slice(index + 1)) {
        expect(byId(running, later).status).toBe("pending");
      }
    });
  });

  it("calls the real service endpoints", async () => {
    const { fetch, calls } = fakeFetch();
    await runNetworkDiagnostics(deps({ fetch }));

    expect(calls).toEqual([
      INTERNET_PROBE_URL,
      DNS_PROBE_URL,
      "https://dmm.test/health/ready",
      "https://gb.test/apiv11/Mod/Index?_nPerpage=1&_nPage=1&_aFilters%5BGeneric_Game%5D=20948",
      "https://dlapi.test/v1/assets/ranked-seasons",
      "https://assets.test/v2/heroes?only_active=true",
    ]);
  });

  it("points every remote failure at the internet check when offline", async () => {
    const { fetch } = fakeFetch({ "https://": "fail" });
    const results = await runNetworkDiagnostics(
      deps({ fetch, isOnline: () => false }),
    );

    expect(byId(results, "network")).toMatchObject({
      status: "error",
      message: "offline",
    });
    expect(byId(results, "internet")).toMatchObject({
      status: "error",
      message: "unreachable",
      fixes: ["checkConnection", "restartRouter", "disableVpnFirewall"],
    });
    for (const id of ["dns", ...REMOTE_IDS] as NetworkCheckId[]) {
      expect(byId(results, id).status).toBe("error");
      expect(byId(results, id).fixes).toEqual(["fixInternetFirst"]);
    }
    expect(summarizeNetworkDiagnostics(results)).toBe("error");
  });

  it("still reports a cached catalog as usable offline", async () => {
    const { fetch } = fakeFetch({ "https://": "fail" });
    const results = await runNetworkDiagnostics(deps({ fetch }));

    expect(byId(results, "catalog")).toMatchObject({
      status: "ok",
      message: "catalogReady",
    });
  });

  it("suggests checking the proxy first when one is configured", async () => {
    const { fetch } = fakeFetch({ "https://": "fail" });
    const results = await runNetworkDiagnostics(
      deps({ fetch, proxyEnabled: true }),
    );

    expect(byId(results, "internet").fixes[0]).toBe("checkProxy");
  });

  it("falls back to the hostname probe when 1.1.1.1 is blocked", async () => {
    const { fetch, calls } = fakeFetch({ [INTERNET_PROBE_URL]: "fail" });
    const results = await runNetworkDiagnostics(deps({ fetch }));

    expect(byId(results, "internet").status).toBe("ok");
    expect(byId(results, "dns").status).toBe("ok");
    expect(calls.filter((url) => url === DNS_PROBE_URL)).toHaveLength(1);
  });

  it("detects broken DNS when the bare IP answers but lookups do not", async () => {
    const { fetch } = fakeFetch({ [DNS_PROBE_URL]: "dns" });
    const results = await runNetworkDiagnostics(deps({ fetch }));

    expect(byId(results, "internet").status).toBe("ok");
    expect(byId(results, "dns")).toMatchObject({
      status: "error",
      message: "dnsFailed",
      fixes: ["changeDns", "flushDnsCache", "restartRouter"],
    });
  });

  it("reports a hanging lookup as a timeout, not as broken DNS", async () => {
    const { fetch } = fakeFetch({ [DNS_PROBE_URL]: "hang" });
    const results = await runNetworkDiagnostics(deps({ fetch }));

    const dns = byId(results, "dns");
    expect(dns.status).toBe("error");
    expect(dns.message).toBe("timeout");
    expect(dns.fixes).not.toContain("changeDns");
    expect(dns.fixes).not.toContain("flushDnsCache");
  });

  it("does not blame DNS for a host that resolved but refused", async () => {
    const { fetch } = fakeFetch({ [DNS_PROBE_URL]: "fail" });
    const results = await runNetworkDiagnostics(deps({ fetch }));

    // The bare IP still answers, so the internet is up and this is a
    // reachability problem rather than a resolver one.
    expect(byId(results, "internet").status).toBe("ok");
    expect(byId(results, "dns")).toMatchObject({
      status: "error",
      message: "unreachable",
      fixes: ["checkConnection", "disableVpnFirewall"],
    });
  });

  it("points at the internet first when nothing answers at all", async () => {
    const { fetch } = fakeFetch({ "https://": "fail" });
    const results = await runNetworkDiagnostics(deps({ fetch }));

    expect(byId(results, "dns")).toMatchObject({
      status: "error",
      fixes: ["fixInternetFirst"],
    });
  });

  it("names the probed address on every failing check", async () => {
    const { fetch } = fakeFetch({ "https://": "fail" });
    const results = await runNetworkDiagnostics(deps({ fetch }));

    // The bare service address, not the endpoint that happened to be probed.
    expect(byId(results, "dmmApi")).toMatchObject({
      url: "https://dmm.test",
      host: "dmm.test",
    });
    expect(byId(results, "internet").url).toBe("https://www.cloudflare.com");
    expect(byId(results, "dns").url).toBe("https://www.cloudflare.com");
    // A local catalog has no address to show.
    expect(byId(results, "catalog").url).toBeUndefined();
  });

  it("names a failing lookup as DNS instead of blaming a firewall", async () => {
    const { fetch } = fakeFetch({ "https://assets.test": "dns" });
    const results = await runNetworkDiagnostics(deps({ fetch }));

    expect(byId(results, "deadlockAssets")).toMatchObject({
      status: "error",
      message: "dnsHostFailed",
      params: { host: "assets.test" },
      fixes: ["changeDns", "flushDnsCache", "restartRouter"],
    });
    expect(byId(results, "deadlockAssets").fixes).not.toContain(
      "allowFirewall",
    );
    // Other hosts resolve, so the shared DNS check still passes.
    expect(byId(results, "dns").status).toBe("ok");
  });

  it("reports a timeout when a service never answers", async () => {
    const { fetch } = fakeFetch({ "https://gb.test": "hang" });
    const results = await runNetworkDiagnostics(deps({ fetch }));

    expect(byId(results, "gamebanana")).toMatchObject({
      status: "error",
      message: "timeout",
      fixes: ["checkGamebanana", "tryOtherNetwork", "allowFirewall"],
    });
    expect(byId(results, "deadlockApi").status).toBe("ok");
  });

  it("maps HTTP status codes to specific problems", async () => {
    const { fetch } = fakeFetch({
      "https://dmm.test": 503,
      "https://gb.test": 403,
      "https://dlapi.test": 500,
      "https://assets.test": 404,
    });
    const results = await runNetworkDiagnostics(deps({ fetch }));

    expect(byId(results, "dmmApi")).toMatchObject({
      status: "warning",
      message: "degraded",
      params: { status: 503 },
      fixes: ["checkStatusPage", "waitAndRetry"],
    });
    expect(byId(results, "gamebanana")).toMatchObject({
      status: "error",
      message: "blocked",
      params: { status: 403, host: "gb.test" },
      fixes: ["waitAndRetry", "tryOtherNetwork"],
    });
    expect(byId(results, "deadlockApi")).toMatchObject({
      status: "error",
      message: "serverError",
      params: { status: 500 },
    });
    expect(byId(results, "deadlockAssets")).toMatchObject({
      status: "error",
      message: "httpError",
      params: { status: 404 },
    });
  });

  it("warns instead of failing on rate limits", async () => {
    const { fetch } = fakeFetch({ "https://gb.test": 429 });
    const results = await runNetworkDiagnostics(deps({ fetch }));

    expect(byId(results, "gamebanana")).toMatchObject({
      status: "warning",
      message: "rateLimited",
      fixes: ["waitAndRetry"],
    });
    expect(summarizeNetworkDiagnostics(results)).toBe("warning");
  });

  it("flags slow services", async () => {
    let clock = 0;
    const results = await runNetworkDiagnostics(
      deps({
        now: () => {
          clock += 4000;
          return clock;
        },
      }),
    );

    for (const id of REMOTE_IDS) {
      expect(byId(results, id)).toMatchObject({
        status: "warning",
        message: "slow",
        latencyMs: 4000,
      });
    }
    // The slow threshold is about services, not the raw internet probe.
    expect(byId(results, "internet").status).toBe("ok");
  });

  it("reports a catalog that can't be read", async () => {
    const results = await runNetworkDiagnostics(
      deps({
        inspectCatalog: () => Promise.reject(new Error("database locked")),
      }),
    );

    expect(byId(results, "catalog")).toMatchObject({
      status: "error",
      message: "catalogCheckFailed",
      fixes: ["restartApp"],
    });
  });
});

describe("evaluateCatalog", () => {
  it("warns about a stale catalog", () => {
    expect(evaluateCatalog(catalog({ stale: true }), true)).toMatchObject({
      status: "warning",
      message: "catalogStale",
      fixes: ["syncCatalog"],
    });
  });

  it("asks for a sync when nothing is cached and the internet works", () => {
    expect(
      evaluateCatalog(catalog({ available: false, count: 0 }), true),
    ).toMatchObject({
      status: "error",
      message: "catalogEmpty",
      fixes: ["syncCatalog", "restartApp"],
    });
  });

  it("points at the internet when nothing is cached and it is down", () => {
    expect(evaluateCatalog(catalog({ count: 0 }), false)).toMatchObject({
      status: "error",
      fixes: ["fixInternetFirst"],
    });
  });
});

describe("summarizeNetworkDiagnostics", () => {
  it("is running while any check is unfinished", () => {
    expect(summarizeNetworkDiagnostics(createPendingResults())).toBe("running");
  });

  it("prefers errors over warnings", () => {
    const results: NetworkCheckResult[] = [
      { id: "network", status: "warning", fixes: [] },
      { id: "internet", status: "error", fixes: [] },
    ];
    expect(summarizeNetworkDiagnostics(results)).toBe("error");
  });
});

describe("locale coverage", () => {
  const strings = en.networkDiagnostics;

  it("translates every check, message and fix", () => {
    expect(Object.keys(strings.checks).sort()).toEqual(
      [...NETWORK_CHECK_IDS].sort(),
    );
    expect(Object.keys(strings.results).sort()).toEqual(
      [...NETWORK_CHECK_MESSAGES].sort(),
    );
    expect(Object.keys(strings.fixes).sort()).toEqual(
      [...NETWORK_FIXES].sort(),
    );
  });
});
