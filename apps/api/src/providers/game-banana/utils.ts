import type { ModDependency, ModDownload } from "@deadlock-mods/database";
import type {
  DonationLink,
  FileserverDto,
  GameBanana,
  ModMetadata,
} from "@deadlock-mods/shared";
import { NSFW_CONTENT_RATINGS, NSFW_KEYWORDS } from "./constants";
import { parseTags } from "./profile";
import type { GameBananaSubmission } from "./types";

export {
  categoryFromGameBananaProfile,
  heroFromGameBananaProfile,
  isUnavailableProfile,
  parseTags,
  submitterDisplayName,
} from "./profile";

const GB_MOD_URL_RE = /^https?:\/\/(?:www\.)?gamebanana\.com\/mods\/(\d+)/i;

// GameBanana's Required/Recommended dropdown. The profile endpoint spells it out,
// the base endpoint sends a number
const MODALITY_BY_CODE: Record<string, ModDependency["level"]> = {
  "1": "required",
  "2": "recommended",
};
const MODALITY_BY_LABEL: Record<string, ModDependency["level"]> = {
  required: "required",
  recommended: "recommended",
};

// The state dropdown is 1-indexed with ten options, and its five negative ones
// ("uninstalled", "absent" ...) mean the mods clash, which is why these are the evens
const NEGATIVE_STATE_CODES = new Set(["2", "4", "6", "8", "10"]);
const NEGATIVE_STATE_LABELS = new Set([
  "uninstalled",
  "absent",
  "disabled",
  "off",
  "false",
]);
const POSITIVE_STATE_LABELS = new Set([
  "installed",
  "present",
  "enabled",
  "on",
  "true",
]);

/**
 * Turns a mod's GameBanana requirements into the dependencies we store. Anything
 * that flags a conflict is dropped, the rest are kept. The link can be empty, and
 * when it points at another mod we pull out that mod's id.
 *
 * Rows arrive in two layouts, words from the profile page and numbers from the base
 * endpoint, so the columns after label and url are read by what they say, not where
 * they sit.
 */
export const parseRequirements = (
  raw: string[][] | null | undefined,
): ModDependency[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const dependencies: ModDependency[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length === 0) {
      continue;
    }
    const label = typeof row[0] === "string" ? row[0].trim() : "";
    const url = typeof row[1] === "string" ? row[1].trim() : "";
    if (!label && !url) {
      continue;
    }

    const meta = row
      .slice(2)
      .map((value) =>
        typeof value === "string" ? value.trim().toLowerCase() : "",
      );

    // Nothing in the response tells us which layout we got, so work it out from
    // whether any of the trailing columns are words we recognise
    const isLabelShape = meta.some(
      (token) =>
        token in MODALITY_BY_LABEL ||
        NEGATIVE_STATE_LABELS.has(token) ||
        POSITIVE_STATE_LABELS.has(token),
    );

    let level: ModDependency["level"];
    let isIncompatibility: boolean;
    if (isLabelShape) {
      const modalityLabel = meta.find((token) => token in MODALITY_BY_LABEL);
      level = modalityLabel ? MODALITY_BY_LABEL[modalityLabel] : null;
      isIncompatibility = meta.some((token) =>
        NEGATIVE_STATE_LABELS.has(token),
      );
    } else {
      // In the number layout modality comes first and state second
      level = MODALITY_BY_CODE[meta[0] ?? ""] ?? null;
      isIncompatibility = NEGATIVE_STATE_CODES.has(meta[1] ?? "");
    }

    // The author wants the other mod gone, so there is nothing to offer installing
    if (isIncompatibility) {
      continue;
    }

    dependencies.push({
      label,
      url: url || null,
      remoteId: url ? (url.match(GB_MOD_URL_RE)?.[1] ?? null) : null,
      level,
    });
  }
  return dependencies;
};

/**
 * Classify if a GameBanana mod contains NSFW content
 * @param mod GameBanana mod submission data
 * @returns boolean indicating if the mod is NSFW
 */
export const classifyNSFW = (
  mod:
    | GameBananaSubmission
    | GameBanana.GameBananaModProfile
    | GameBanana.GameBananaSoundProfile,
): boolean => {
  // Check if mod has extended fields (full mod profile)
  const extendedMod = mod as GameBanana.GameBananaModProfile;

  // 1. Direct flags (authoritative) - check _aContentRatings
  if (extendedMod._aContentRatings) {
    for (const key of Object.keys(extendedMod._aContentRatings)) {
      if (NSFW_CONTENT_RATINGS[key as keyof typeof NSFW_CONTENT_RATINGS]) {
        return true; // Any content rating flag = NSFW
      }
    }
  }

  // 2. Secondary hints (soft indicators)
  let hintScore = 0;

  // Check _sInitialVisibility
  if (extendedMod._sInitialVisibility === "hide") {
    hintScore += 1;
  }

  // Check text content for NSFW keywords
  const hasName = "_sName" in mod;
  const hasTags = "_aTags" in mod;
  const tags = hasTags ? (mod as { _aTags: unknown })._aTags : [];
  const modName = hasName ? (mod as { _sName: string })._sName : "";

  const textContent = [
    modName,
    extendedMod._sDescription || "",
    extendedMod._sText || "",
    ...parseTags(tags as GameBanana.GameBananaSubmission["_aTags"]),
  ]
    .join(" ")
    .toLowerCase();

  const foundKeywords = NSFW_KEYWORDS.filter((keyword) =>
    textContent.includes(keyword.toLowerCase()),
  );

  if (foundKeywords.length > 0) {
    hintScore += 1;
  }

  // Return true if hint score >= 2 (medium confidence threshold)
  return hintScore >= 2;
};

/**
 * GameBanana sometimes sends null or zero timestamps even though its schema
 * promises a number. `new Date(null * 1000)` is an Invalid Date, and drizzle
 * throws a RangeError while encoding it, which silently drops the whole mod
 * from the sync.
 */
export const gameBananaTimestampToDate = (
  seconds: number | null | undefined,
): Date | null => {
  if (
    typeof seconds !== "number" ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return null;
  }
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * `mod.remoteAddedAt` and `mod.remoteUpdatedAt` are NOT NULL, so a missing
 * timestamp falls back to its sibling and then to the epoch. The epoch rather
 * than now() keeps undated mods from surfacing as recently updated.
 */
export const resolveRemoteTimestamps = (
  addedAtSeconds: number | null | undefined,
  updatedAtSeconds: number | null | undefined,
): { remoteAddedAt: Date; remoteUpdatedAt: Date } => {
  const addedAt = gameBananaTimestampToDate(addedAtSeconds);
  const updatedAt = gameBananaTimestampToDate(updatedAtSeconds);
  const fallback = addedAt ?? updatedAt ?? new Date(0);

  return {
    remoteAddedAt: addedAt ?? fallback,
    remoteUpdatedAt: updatedAt ?? fallback,
  };
};

export const buildDownloadSignature = (downloads: ModDownload[]): string => {
  return downloads
    .map(
      (d) =>
        `${d.remoteId}|${d.file}|${d.size}|${d.md5Checksum ?? ""}|${d.createdAt?.getTime()}`,
    )
    .sort()
    .join(";");
};

export const buildDownloadSignatureFromPayload = (
  files: Array<{
    _idRow: number;
    _sFile: string;
    _nFilesize: number;
    _tsDateAdded: number;
    _sMd5Checksum?: string;
  }>,
): string => {
  return files
    .map(
      (f) =>
        `${f._idRow}|${f._sFile}|${f._nFilesize}|${f._sMd5Checksum ?? ""}|${gameBananaTimestampToDate(f._tsDateAdded)?.getTime()}`,
    )
    .sort()
    .join(";");
};

// Matches "map <identifier>" in a quoted or code context (high confidence)
const QUOTED_MAP_RE = /(?:["'`>]|&quot;)\s*map\s+([a-z][a-z0-9_]{2,})\b/gi;

// Matches bare "map <identifier>" (lower confidence)
const BARE_MAP_RE = /\bmap\s+([a-z][a-z0-9_]{2,})\b/gi;

// Only words that actually appear after "map" in real GameBanana descriptions
// and are clearly not map names. Kept minimal on purpose.
const BARE_EXCLUDE = new Set([
  "features",
  "includes",
  "currently",
  "loading",
  "created",
  "queue",
  "using",
  "look",
  "making",
  "overrides",
  "works",
  "featuring",
  "breaking",
  "correctly",
  "again",
]);

export function extractMapName(description: string): string | undefined {
  if (!description) return undefined;

  for (const match of description.matchAll(QUOTED_MAP_RE)) {
    return match[1].toLowerCase();
  }

  for (const match of description.matchAll(BARE_MAP_RE)) {
    const name = match[1].toLowerCase();
    if (!BARE_EXCLUDE.has(name)) {
      return name;
    }
  }

  return undefined;
}

export const mapGameBananaFileserverState = (
  state: string,
): FileserverDto["state"] => {
  switch (state) {
    case "up":
      return "up";
    case "terminated":
      return "terminated";
    default:
      return "down";
  }
};

// --- Donation link extraction ---

const DONATION_HOST_ALLOWLIST = new Set([
  "ko-fi.com",
  "patreon.com",
  "buymeacoffee.com",
  "paypal.me",
  "paypal.com",
  "liberapay.com",
  "opencollective.com",
  "github.com",
]);

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function platformFromTitle(title: string): string | undefined {
  const t = title.toLowerCase();
  if (t.includes("ko-fi") || t.includes("kofi")) return "Ko-fi";
  if (t.includes("patreon")) return "Patreon";
  if (t.includes("buy me a coffee") || t.includes("buymeacoffee"))
    return "Buy Me a Coffee";
  if (t.includes("paypal")) return "PayPal";
  if (t.includes("liberapay")) return "Liberapay";
  if (t.includes("open collective") || t.includes("opencollective"))
    return "Open Collective";
  if (t.includes("github")) return "GitHub Sponsors";
  return undefined;
}

function platformFromHost(host: string): string {
  switch (host) {
    case "ko-fi.com":
      return "Ko-fi";
    case "patreon.com":
      return "Patreon";
    case "buymeacoffee.com":
      return "Buy Me a Coffee";
    case "paypal.me":
    case "paypal.com":
      return "PayPal";
    case "liberapay.com":
      return "Liberapay";
    case "opencollective.com":
      return "Open Collective";
    case "github.com":
      return "GitHub Sponsors";
    default:
      return host;
  }
}

function isDonationUrl(url: URL): boolean {
  const host = normalizeHost(url.hostname);
  if (!DONATION_HOST_ALLOWLIST.has(host)) return false;
  if (host === "github.com") {
    return url.pathname.startsWith("/sponsors");
  }
  return true;
}

function toDonationLink(
  rawUrl: string,
  titleHint?: string,
): DonationLink | undefined {
  try {
    const url = new URL(rawUrl);
    if (!isDonationUrl(url)) return undefined;
    const host = normalizeHost(url.hostname);
    const platform =
      (titleHint && platformFromTitle(titleHint)) || platformFromHost(host);
    return { url: url.toString(), platform };
  } catch {
    return undefined;
  }
}

export function donationLinksFromMethods(
  methods: GameBanana.GameBananaDonationMethod[],
): DonationLink[] {
  if (!Array.isArray(methods)) return [];
  const links: DonationLink[] = [];
  for (const m of methods) {
    if (!m._bIsUrl || !m._sValue) continue;
    const link = toDonationLink(m._sValue, m._sTitle);
    if (link) links.push(link);
  }
  return links;
}

const URL_RE = /https?:\/\/[^\s"'<>]+/gi;

export function extractDonationLinksFromDescription(
  description: string,
): DonationLink[] {
  if (!description) return [];
  const links: DonationLink[] = [];
  const seen = new Set<string>();
  for (const [raw] of description.matchAll(URL_RE)) {
    const cleaned = raw.replace(/[)"'>.,;:!?\]]+$/, "");
    const link = toDonationLink(cleaned);
    if (link && !seen.has(link.url)) {
      seen.add(link.url);
      links.push(link);
    }
  }
  return links;
}

export function buildDonationLinks({
  methods,
  description,
}: {
  methods: GameBanana.GameBananaDonationMethod[];
  description: string;
}): DonationLink[] {
  const fromApi = donationLinksFromMethods(methods);
  const fromDesc = extractDonationLinksFromDescription(description);

  const seen = new Set<string>();
  const result: DonationLink[] = [];

  for (const link of [...fromApi, ...fromDesc]) {
    if (!seen.has(link.url)) {
      seen.add(link.url);
      result.push(link);
    }
  }

  return result;
}

export function buildMetadata({
  description,
  isMap,
  donationMethods,
}: {
  description: string;
  isMap: boolean;
  donationMethods: GameBanana.GameBananaDonationMethod[];
}): ModMetadata | null {
  const mapName = isMap ? extractMapName(description) : undefined;
  const donationLinks = buildDonationLinks({
    methods: donationMethods,
    description,
  });

  if (!mapName && donationLinks.length === 0) return null;

  const metadata: ModMetadata = {};
  if (mapName) metadata.mapName = mapName;
  if (donationLinks.length > 0) metadata.donationLinks = donationLinks;
  return metadata;
}
