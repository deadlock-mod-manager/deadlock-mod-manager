import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";

export const PACKAGE_DIR = join(import.meta.dirname, "..", "..");
const CACHE_DIR = join(PACKAGE_DIR, ".cache");

const USER_AGENT =
  "DeadlockModManager-catalog (+https://github.com/deadlock-mod-manager/deadlock-mod-manager)";
const GAMEBANANA_DELAY_MS = 750;
let lastGamebananaRequest = 0;

export const sha256 = (data: Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");
const md5 = (data: Uint8Array): string =>
  createHash("md5").update(data).digest("hex");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const throttle = async (url: string) => {
  if (!/gamebanana\.com/.test(new URL(url).hostname)) return;
  const wait = lastGamebananaRequest + GAMEBANANA_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastGamebananaRequest = Date.now();
};

const request = async (
  url: string,
  headers: Record<string, string> = {},
): Promise<Response> => {
  let lastError = new Error(`${url}: request failed`);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await sleep(1000 * 2 ** attempt);
    await throttle(url);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, ...headers },
        redirect: "follow",
      });
      if (response.status >= 500 || response.status === 429) {
        lastError = new Error(`${url}: HTTP ${response.status}`);
        continue;
      }
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return response;
    } catch (error) {
      if (error instanceof Error) lastError = error;
    }
  }
  throw lastError;
};

const encodePath = (path: string): string =>
  path
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/'/g, "%27"))
    .join("/");

export const githubRawUrl = (
  repo: string,
  commit: string,
  path: string,
): string =>
  `https://raw.githubusercontent.com/${repo}/${commit}/${encodePath(path)}`;

export const githubBlobUrl = (
  repo: string,
  commit: string,
  path: string,
): string => `https://github.com/${repo}/blob/${commit}/${encodePath(path)}`;

interface PinnedDownload {
  url: string;
  sha256?: string;
  md5?: string;
}

/**
 * Downloads a pinned file, from the local cache when we have it. A hash
 * mismatch is a hard failure: the pin no longer describes what upstream serves.
 */
export const fetchPinned = async ({
  url,
  sha256: expectedSha,
  md5: expectedMd5,
}: PinnedDownload): Promise<Uint8Array> => {
  const cacheKey =
    expectedSha ?? expectedMd5 ?? sha256(new TextEncoder().encode(url));
  const cachePath = join(CACHE_DIR, "files", cacheKey);
  if (existsSync(cachePath)) {
    const cached = new Uint8Array(readFileSync(cachePath));
    if (
      (!expectedSha || sha256(cached) === expectedSha) &&
      (!expectedMd5 || md5(cached) === expectedMd5)
    )
      return cached;
  }
  const data = await fetchBytes(url);
  if (expectedSha && sha256(data) !== expectedSha) {
    throw new Error(
      `sha256 mismatch for ${url}: expected ${expectedSha}, got ${sha256(data)}`,
    );
  }
  if (expectedMd5 && md5(data) !== expectedMd5) {
    throw new Error(
      `md5 mismatch for ${url}: expected ${expectedMd5}, got ${md5(data)}`,
    );
  }
  if (expectedSha || expectedMd5) {
    mkdirSync(join(CACHE_DIR, "files"), { recursive: true });
    writeFileSync(cachePath, data);
  }
  return data;
};

/** Unpinned download for `--refresh`, which computes the new pins. */
export const fetchBytes = async (url: string): Promise<Uint8Array> =>
  new Uint8Array(await (await request(url)).arrayBuffer());

export const fetchJson = async <T>(
  url: string,
  schema: z.ZodType<T>,
  headers: Record<string, string> = {},
): Promise<T> => schema.parse(await (await request(url, headers)).json());

export const githubApi = async <T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T> => {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const auth = token ? [["Authorization", `Bearer ${token}`]] : [];
  const headers = Object.fromEntries([
    ["Accept", "application/vnd.github+json"],
    ...auth,
  ]);
  return fetchJson(`https://api.github.com/${path}`, schema, headers);
};

/** All pages of a GitHub list endpoint. */
export const githubApiPaged = async <T>(
  path: string,
  schema: z.ZodType<T[]>,
  maxPages = 10,
): Promise<T[]> => {
  const out: T[] = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await githubApi(
      `${path}${separator}per_page=100&page=${page}`,
      schema,
    );
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
};

export const decodeText = (data: Uint8Array): string => {
  if (data[0] === 0xff && data[1] === 0xfe)
    return Buffer.from(data.subarray(2)).toString("utf16le");
  if (data[0] === 0xfe && data[1] === 0xff)
    return Buffer.from(data.subarray(2)).swap16().toString("utf16le");
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(data)
      .replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(data);
  }
};

/** Runs `tasks` with at most `limit` in flight, keeping input order. */
export const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = [];
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await task(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
};
