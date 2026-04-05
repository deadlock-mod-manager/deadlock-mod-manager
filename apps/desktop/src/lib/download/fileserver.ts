import type { FileserverDto } from "@deadlock-mods/shared";
import type { FileserverPreference } from "@/lib/store/slices/network";

type DownloadFile = { url: string; name: string; size: number };

const GAMEBANANA_FILESERVER_HEAD_TEST_PATH =
  "tools/deadlockmodmanager-v050.zip";

export const buildGameBananaFileserverTestUrl = (domain: string): string =>
  new URL(GAMEBANANA_FILESERVER_HEAD_TEST_PATH, `https://${domain}/`).href;

const buildGameBananaFilecacheUrl = (
  template: string,
  category: "mods" | "sounds",
  filename: string,
): string =>
  template
    .replace("{category}", category)
    .replace("{filename}", encodeURIComponent(filename));

const isGameBananaDirectDownloadUrl = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "gamebanana.com" || hostname.endsWith(".gamebanana.com")
    );
  } catch {
    return false;
  }
};

const findLowestLatencyServer = (
  servers: FileserverDto[],
  latencyMs: Record<string, number>,
): FileserverDto | undefined => {
  let result: FileserverDto | undefined;
  let best = Number.POSITIVE_INFINITY;
  for (const server of servers) {
    const lat = latencyMs[server.id];
    if (lat !== undefined && lat < best) {
      best = lat;
      result = server;
    }
  }
  return result;
};

const findHighestThroughputServer = (
  servers: FileserverDto[],
): FileserverDto | undefined => {
  let result: FileserverDto | undefined;
  let best = -1;
  for (const server of servers) {
    const rate = server.stats?.rateBytes ?? 0;
    if (rate > best) {
      best = rate;
      result = server;
    }
  }
  return result;
};

const pickServerForAuto = (
  servers: FileserverDto[],
  latencyMs: Record<string, number>,
): FileserverDto | undefined => {
  const up = servers.filter((s) => s.state === "up");
  if (up.length === 0) return undefined;

  if (Object.keys(latencyMs).length > 0) {
    const byLatency = findLowestLatencyServer(up, latencyMs);
    if (byLatency) return byLatency;
  }

  return findHighestThroughputServer(up);
};

const resolveServer = (
  preference: Exclude<FileserverPreference, "default">,
  fileservers: FileserverDto[],
  latencyMs: Record<string, number>,
): FileserverDto | undefined => {
  if (preference === "auto") {
    return pickServerForAuto(fileservers, latencyMs);
  }
  return fileservers.find((s) => s.id === preference);
};

const isUsableGameBananaServer = (
  server: FileserverDto | undefined,
): server is FileserverDto =>
  server !== undefined &&
  server.provider === "gamebanana" &&
  server.state !== "terminated";

export const resolveDownloadFileUrls = (params: {
  files: DownloadFile[];
  preference: FileserverPreference;
  fileservers: FileserverDto[];
  latencyMs: Record<string, number>;
  isAudio: boolean;
}): DownloadFile[] => {
  const { files, preference, fileservers, latencyMs, isAudio } = params;
  if (preference === "default") return files;

  const server = resolveServer(preference, fileservers, latencyMs);
  if (!isUsableGameBananaServer(server)) return files;

  const category: "mods" | "sounds" = isAudio ? "sounds" : "mods";

  return files.map((f) => {
    if (!isGameBananaDirectDownloadUrl(f.url)) return f;
    return {
      ...f,
      url: buildGameBananaFilecacheUrl(server.urlTemplate, category, f.name),
    };
  });
};
