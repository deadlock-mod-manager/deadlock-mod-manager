import type { CatalogSyncStatusDto } from "@/types/generated/CatalogSyncStatusDto";
import type { TcpAutoTuningLevel } from "@/types/generated/TcpAutoTuningLevel";

export type NetworkCheckId =
  | "network"
  | "internet"
  | "dns"
  | "dmmApi"
  | "gamebanana"
  | "deadlockApi"
  | "deadlockAssets"
  | "catalog"
  | "tcpAutoTuning";

export type NetworkCheckStatus =
  | "pending"
  | "running"
  | "ok"
  | "warning"
  | "error";

/** Keys under `networkDiagnostics.results` in the locale files. */
export const NETWORK_CHECK_MESSAGES = [
  "online",
  "offline",
  "reachable",
  "slow",
  "timeout",
  "unreachable",
  "blocked",
  "rateLimited",
  "degraded",
  "serverError",
  "httpError",
  "dnsFailed",
  "dnsHostFailed",
  "catalogReady",
  "catalogStale",
  "catalogEmpty",
  "catalogCheckFailed",
  "autoTuningOn",
  "autoTuningRestricted",
] as const;

type NetworkCheckMessage = (typeof NETWORK_CHECK_MESSAGES)[number];

/** Keys under `networkDiagnostics.fixes` in the locale files. */
export const NETWORK_FIXES = [
  "checkConnection",
  "restartRouter",
  "disableVpnFirewall",
  "checkProxy",
  "changeDns",
  "flushDnsCache",
  "fixInternetFirst",
  "checkStatusPage",
  "waitAndRetry",
  "tryOtherNetwork",
  "checkGamebanana",
  "checkDeadlockApi",
  "allowFirewall",
  "syncCatalog",
  "restartApp",
  "enableAutoTuning",
] as const;

type NetworkFix = (typeof NETWORK_FIXES)[number];

export type NetworkCheckResult = {
  id: NetworkCheckId;
  status: NetworkCheckStatus;
  message?: NetworkCheckMessage;
  params?: Record<string, string | number>;
  latencyMs?: number;
  /** The address that was probed, so the user can see and share what failed. */
  url?: string;
  host?: string;
  fixes: NetworkFix[];
};

type ProbeResponse = { status: number };

export type NetworkDiagnosticsDeps = {
  fetch: (
    url: string,
    init: { method: "GET"; signal: AbortSignal },
  ) => Promise<ProbeResponse>;
  isOnline: () => boolean;
  inspectCatalog: () => Promise<CatalogSyncStatusDto>;
  /** Only on Windows; resolves `null` when the setting can't be read. */
  readTcpAutoTuning?: () => Promise<TcpAutoTuningLevel | null>;
  proxyEnabled: boolean;
  origins: {
    /** Cloudflare's trace endpoint, by bare IP and by hostname. */
    internet: string;
    dns: string;
    dmmApi: string;
    gamebanana: string;
    deadlockApi: string;
    assets: string;
  };
  now?: () => number;
  timeoutMs?: number;
  slowThresholdMs?: number;
};

export const NETWORK_CHECK_IDS: readonly NetworkCheckId[] = [
  "network",
  "internet",
  "dns",
  "dmmApi",
  "gamebanana",
  "deadlockApi",
  "deadlockAssets",
  "catalog",
  "tcpAutoTuning",
];

const TRACE_PATH = "/cdn-cgi/trace";

const GAMEBANANA_GAME_ID = 20_948;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_SLOW_THRESHOLD_MS = 3000;

type ProbeOutcome =
  | { kind: "response"; status: number; latencyMs: number }
  | { kind: "timeout"; latencyMs: number }
  | { kind: "failed"; latencyMs: number; dns: boolean };

/**
 * A host that does not resolve fails within milliseconds and needs completely
 * different advice than a blocked or dead server, so the transport error is
 * inspected instead of being lumped in with every other failure.
 */
const isDnsFailure = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /dns|resolve|getaddrinfo|name not known|nodename|no such host/i.test(
    message,
  );
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * The bare service address, without the probe path. That is what a user has to
 * unblock or hand to support; which endpoint happened to be probed is noise.
 */
const originOf = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
};

type RemoteServiceId = Extract<
  NetworkCheckId,
  "dmmApi" | "gamebanana" | "deadlockApi" | "deadlockAssets"
>;

type RemoteService = {
  id: RemoteServiceId;
  url: (origins: NetworkDiagnosticsDeps["origins"]) => string;
  unreachableFixes: NetworkFix[];
  serverFixes: NetworkFix[];
};

const REMOTE_SERVICES: Record<RemoteServiceId, RemoteService> = {
  dmmApi: {
    id: "dmmApi",
    url: (origins) => `${origins.dmmApi}/health/ready`,
    unreachableFixes: ["checkStatusPage", "allowFirewall"],
    serverFixes: ["checkStatusPage", "waitAndRetry"],
  },
  gamebanana: {
    id: "gamebanana",
    url: (origins) =>
      `${origins.gamebanana}/apiv11/Mod/Index?_nPerpage=1&_nPage=1&_aFilters%5BGeneric_Game%5D=${GAMEBANANA_GAME_ID}`,
    unreachableFixes: ["checkGamebanana", "tryOtherNetwork", "allowFirewall"],
    serverFixes: ["checkGamebanana", "waitAndRetry"],
  },
  deadlockApi: {
    id: "deadlockApi",
    url: (origins) => `${origins.deadlockApi}/v1/assets/ranked-seasons`,
    unreachableFixes: ["checkDeadlockApi", "allowFirewall"],
    serverFixes: ["checkDeadlockApi", "waitAndRetry"],
  },
  deadlockAssets: {
    id: "deadlockAssets",
    url: (origins) => `${origins.assets}/v1/assets/heroes?only_active=true`,
    unreachableFixes: ["checkDeadlockApi", "allowFirewall"],
    serverFixes: ["checkDeadlockApi", "waitAndRetry"],
  },
};

const probe = async (
  deps: NetworkDiagnosticsDeps,
  url: string,
): Promise<ProbeOutcome> => {
  const now = deps.now ?? (() => performance.now());
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const start = now();

  try {
    const response = await deps.fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    return {
      kind: "response",
      status: response.status,
      latencyMs: Math.round(now() - start),
    };
  } catch (error) {
    const latencyMs = Math.round(now() - start);
    return timedOut
      ? { kind: "timeout", latencyMs }
      : { kind: "failed", latencyMs, dns: isDnsFailure(error) };
  } finally {
    clearTimeout(timer);
  }
};

const withProxyFix = (
  deps: NetworkDiagnosticsDeps,
  fixes: NetworkFix[],
): NetworkFix[] => (deps.proxyEnabled ? ["checkProxy", ...fixes] : fixes);

const checkNetwork = (deps: NetworkDiagnosticsDeps): NetworkCheckResult =>
  deps.isOnline()
    ? { id: "network", status: "ok", message: "online", fixes: [] }
    : {
        id: "network",
        status: "error",
        message: "offline",
        fixes: ["checkConnection", "restartRouter"],
      };

type RunContext = {
  deps: NetworkDiagnosticsDeps;
  dnsProbe?: ProbeOutcome;
  internetUp: boolean;
};

const dnsProbe = async (context: RunContext): Promise<ProbeOutcome> => {
  context.dnsProbe ??= await probe(
    context.deps,
    `${context.deps.origins.dns}${TRACE_PATH}`,
  );
  return context.dnsProbe;
};

const checkInternet = async (
  context: RunContext,
): Promise<NetworkCheckResult> => {
  const { origins } = context.deps;
  const direct = await probe(context.deps, `${origins.internet}${TRACE_PATH}`);
  // Some networks block 1.1.1.1 outright; reaching the hostname still proves
  // there is a way out.
  const viaHostname = direct.kind !== "response";
  const outcome = viaHostname ? await dnsProbe(context) : direct;
  const url = viaHostname ? origins.dns : origins.internet;

  if (outcome.kind === "response") {
    context.internetUp = true;
    return {
      id: "internet",
      status: "ok",
      message: "reachable",
      latencyMs: outcome.latencyMs,
      url,
      host: hostOf(url),
      fixes: [],
    };
  }

  return {
    id: "internet",
    status: "error",
    message: outcome.kind === "timeout" ? "timeout" : "unreachable",
    latencyMs: outcome.latencyMs,
    url,
    host: hostOf(url),
    fixes: withProxyFix(context.deps, [
      "checkConnection",
      "restartRouter",
      "disableVpnFirewall",
    ]),
  };
};

const checkDns = async (context: RunContext): Promise<NetworkCheckResult> => {
  const outcome = await dnsProbe(context);
  const url = context.deps.origins.dns;
  const host = hostOf(url);
  if (outcome.kind === "response") {
    return {
      id: "dns",
      status: "ok",
      message: "reachable",
      latencyMs: outcome.latencyMs,
      url,
      host,
      fixes: [],
    };
  }

  // Only a resolver error says anything about DNS. A timeout or a refused
  // connection to a host that did resolve is a reachability problem, and
  // sending the user off to change nameservers over it wastes their time.
  const dnsFailed = outcome.kind === "failed" && outcome.dns;
  const message = dnsFailed
    ? "dnsFailed"
    : outcome.kind === "timeout"
      ? "timeout"
      : "unreachable";

  const fixes: NetworkFix[] = dnsFailed
    ? ["changeDns", "flushDnsCache", "restartRouter"]
    : context.internetUp
      ? withProxyFix(context.deps, ["checkConnection", "disableVpnFirewall"])
      : ["fixInternetFirst"];

  return {
    id: "dns",
    status: "error",
    message,
    params: { host },
    latencyMs: outcome.latencyMs,
    url,
    host,
    fixes,
  };
};

const evaluateServiceProbe = (
  service: RemoteService,
  probeUrl: string,
  outcome: ProbeOutcome,
  context: Pick<RunContext, "deps" | "internetUp">,
): NetworkCheckResult => {
  const url = originOf(probeUrl);
  const host = hostOf(url);
  const base = { id: service.id, latencyMs: outcome.latencyMs, url, host };

  if (outcome.kind === "failed" && outcome.dns) {
    return {
      ...base,
      status: "error",
      message: "dnsHostFailed",
      params: { host },
      fixes: ["changeDns", "flushDnsCache", "restartRouter"],
    };
  }

  if (outcome.kind !== "response") {
    return {
      ...base,
      status: "error",
      message: outcome.kind === "timeout" ? "timeout" : "unreachable",
      params: { host },
      fixes: context.internetUp
        ? withProxyFix(context.deps, service.unreachableFixes)
        : ["fixInternetFirst"],
    };
  }

  const { status } = outcome;
  if (status >= 200 && status < 300) {
    const slow =
      outcome.latencyMs >
      (context.deps.slowThresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS);
    return slow
      ? {
          ...base,
          status: "warning",
          message: "slow",
          fixes: ["tryOtherNetwork", "disableVpnFirewall"],
        }
      : { ...base, status: "ok", message: "reachable", fixes: [] };
  }

  if (status === 403) {
    return {
      ...base,
      status: "error",
      message: "blocked",
      params: { status, host },
      fixes: ["waitAndRetry", "tryOtherNetwork"],
    };
  }

  if (status === 429) {
    return {
      ...base,
      status: "warning",
      message: "rateLimited",
      params: { status, host },
      fixes: ["waitAndRetry"],
    };
  }

  // The DMM readiness probe answers 503 while it is up but its database or
  // cache is not, so mods may still partially load.
  if (status === 503 && service.id === "dmmApi") {
    return {
      ...base,
      status: "warning",
      message: "degraded",
      params: { status, host },
      fixes: service.serverFixes,
    };
  }

  return {
    ...base,
    status: "error",
    message: status >= 500 ? "serverError" : "httpError",
    params: { status, host },
    fixes: service.serverFixes,
  };
};

const checkService = async (
  context: RunContext,
  id: RemoteServiceId,
): Promise<NetworkCheckResult> => {
  const service = REMOTE_SERVICES[id];
  const url = service.url(context.deps.origins);
  return evaluateServiceProbe(
    service,
    url,
    await probe(context.deps, url),
    context,
  );
};

export const evaluateCatalog = (
  catalog: CatalogSyncStatusDto,
  internetUp: boolean,
): NetworkCheckResult => {
  if (catalog.available && catalog.count > 0) {
    return catalog.stale
      ? {
          id: "catalog",
          status: "warning",
          message: "catalogStale",
          params: { count: catalog.count },
          fixes: internetUp ? ["syncCatalog"] : ["fixInternetFirst"],
        }
      : {
          id: "catalog",
          status: "ok",
          message: "catalogReady",
          params: { count: catalog.count },
          fixes: [],
        };
  }

  return {
    id: "catalog",
    status: "error",
    message: "catalogEmpty",
    fixes: internetUp ? ["syncCatalog", "restartApp"] : ["fixInternetFirst"],
  };
};

const checkCatalog = async (
  context: RunContext,
): Promise<NetworkCheckResult> => {
  try {
    return evaluateCatalog(
      await context.deps.inspectCatalog(),
      context.internetUp,
    );
  } catch {
    return {
      id: "catalog",
      status: "error",
      message: "catalogCheckFailed",
      fixes: ["restartApp"],
    };
  }
};

const RESTRICTED_AUTO_TUNING = new Set<TcpAutoTuningLevel>([
  "disabled",
  "highlyRestricted",
  "restricted",
]);

/** Names the level the way `Get-NetTCPSetting` prints it. */
export const evaluateTcpAutoTuning = (
  level: TcpAutoTuningLevel,
): NetworkCheckResult => {
  const params = { level: level[0].toUpperCase() + level.slice(1) };
  return RESTRICTED_AUTO_TUNING.has(level)
    ? {
        id: "tcpAutoTuning",
        status: "warning",
        message: "autoTuningRestricted",
        params,
        fixes: ["enableAutoTuning"],
      }
    : {
        id: "tcpAutoTuning",
        status: "ok",
        message: "autoTuningOn",
        params,
        fixes: [],
      };
};

/** The auto-tuning check only exists on Windows. */
const checkIdsFor = (
  deps: Pick<NetworkDiagnosticsDeps, "readTcpAutoTuning">,
): NetworkCheckId[] =>
  NETWORK_CHECK_IDS.filter(
    (id) => id !== "tcpAutoTuning" || deps.readTcpAutoTuning !== undefined,
  );

export const createPendingResults = (
  deps: Pick<NetworkDiagnosticsDeps, "readTcpAutoTuning"> = {},
): NetworkCheckResult[] =>
  checkIdsFor(deps).map((id) => ({ id, status: "pending", fixes: [] }));

/**
 * Runs every check in order, top to bottom, reporting each state change so a
 * dialog can show progress as it happens. Later checks still run when earlier
 * ones fail: a local API or a cached catalog can work without internet.
 */
export const runNetworkDiagnostics = async (
  deps: NetworkDiagnosticsDeps,
  onUpdate?: (results: NetworkCheckResult[]) => void,
): Promise<NetworkCheckResult[]> => {
  let results = createPendingResults(deps);
  const context: RunContext = { deps, internetUp: false };

  const set = (result: NetworkCheckResult) => {
    results = results.map((entry) => (entry.id === result.id ? result : entry));
    onUpdate?.(results);
  };

  const runners = {
    network: async () => checkNetwork(deps),
    internet: () => checkInternet(context),
    dns: () => checkDns(context),
    dmmApi: () => checkService(context, "dmmApi"),
    gamebanana: () => checkService(context, "gamebanana"),
    deadlockApi: () => checkService(context, "deadlockApi"),
    deadlockAssets: () => checkService(context, "deadlockAssets"),
    catalog: () => checkCatalog(context),
    // A setting that can't be read is left out rather than reported.
    tcpAutoTuning: async () => {
      const level = await deps.readTcpAutoTuning?.().catch(() => null);
      return level ? evaluateTcpAutoTuning(level) : null;
    },
  } satisfies Record<NetworkCheckId, () => Promise<NetworkCheckResult | null>>;

  for (const id of checkIdsFor(deps)) {
    set({ id, status: "running", fixes: [] });
    const result = await runners[id]();
    if (result) {
      set(result);
    } else {
      results = results.filter((entry) => entry.id !== id);
      onUpdate?.(results);
    }
  }

  return results;
};

export type NetworkDiagnosticsVerdict = "running" | "ok" | "warning" | "error";

export const summarizeNetworkDiagnostics = (
  results: NetworkCheckResult[],
): NetworkDiagnosticsVerdict => {
  if (results.some((r) => r.status === "pending" || r.status === "running"))
    return "running";
  if (results.some((r) => r.status === "error")) return "error";
  if (results.some((r) => r.status === "warning")) return "warning";
  return "ok";
};
