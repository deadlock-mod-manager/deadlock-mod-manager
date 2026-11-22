import type {
  ModDependency,
  ModDownload,
  NewModAuthor,
} from "@deadlock-mods/database";
import {
  type DonationLink,
  type FileserverDto,
  type GameBanana,
  type ModMetadata,
  parseEmbeddedVideos,
} from "@deadlock-mods/shared";
import { NSFW_CONTENT_RATINGS, NSFW_VISIBILITIES } from "./constants";

export {
  categoryFromGameBananaProfile,
  heroFromGameBananaProfile,
  isUnavailableProfile,
  parseTags,
  submitterDisplayName,
} from "./profile";

const GB_MOD_URL_RE = /^https?:\/\/(?:www\.)?gamebanana\.com\/mods\/(\d+)/i;

const MODALITY_BY_CODE: Record<string, ModDependency["level"]> = {
  "1": "required",
  "2": "recommended",
};
const MODALITY_BY_LABEL: Record<string, ModDependency["level"]> = {
  required: "required",
  recommended: "recommended",
};

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
      level = MODALITY_BY_CODE[meta[0] ?? ""] ?? null;
      isIncompatibility = NEGATIVE_STATE_CODES.has(meta[1] ?? "");
    }

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

export const classifyNSFW = (profile: {
  _aContentRatings?: Record<string, string> | null;
  _sInitialVisibility?: string | null;
}): boolean => {
  if (NSFW_VISIBILITIES.includes(profile._sInitialVisibility ?? "")) {
    return true;
  }
  return Object.keys(profile._aContentRatings ?? {}).some(
    (key) => key in NSFW_CONTENT_RATINGS,
  );
};

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

export const indexListingChanged = (
  listedModifiedAt: Date | null,
  storedModifiedAt: Date | null | undefined,
): boolean =>
  !listedModifiedAt ||
  !storedModifiedAt ||
  listedModifiedAt.getTime() !== storedModifiedAt.getTime();

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

const BLOCK_TAG_RE = /<\/?(?:br|p|li|ol|ul|div|h[1-6])\b[^>]*>/gi;
const INLINE_TAG_RE = /<[^>]*>/g;
const HTML_ENTITIES: Record<string, string> = {
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
};
const HTML_ENTITY_RE = /&(?:quot|#39|apos|nbsp|lt|gt|amp);/g;

const MAP_COMMAND_RE = /\bmap([^\S\n]+|_)([a-z][a-z0-9_]{2,})\b/gi;
const QUOTED_PREFIX_RE = /["'`‘’“”]\s*$/;
const INSTRUCTION_PREFIX_RE = /\b(?:type|typing|command|run)\b\W*(?:\w+\W+)?$/i;
const OWN_LINE_PREFIX_RE = /^[\W\d]*$/;
const OWN_LINE_SUFFIX_RE = /^\W*$/;

function descriptionToText(description: string): string {
  return description
    .replace(BLOCK_TAG_RE, "\n")
    .replace(INLINE_TAG_RE, " ")
    .replace(HTML_ENTITY_RE, (entity) => HTML_ENTITIES[entity]);
}

export function extractMapName(description: string): string | undefined {
  if (!description) return undefined;

  const text = descriptionToText(description);
  let identifier: string | undefined;

  for (const match of text.matchAll(MAP_COMMAND_RE)) {
    const [command, separator, rawName] = match;
    const name = rawName.toLowerCase();
    if (separator === "_" && !name.includes("_")) continue;

    const start = match.index;
    const end = start + command.length;
    const lineStart = text.lastIndexOf("\n", start) + 1;
    const lineEnd = text.indexOf("\n", end);
    const prefix = text.slice(lineStart, start);
    const suffix = text.slice(end, lineEnd === -1 ? undefined : lineEnd);

    const isCommand =
      QUOTED_PREFIX_RE.test(prefix) ||
      INSTRUCTION_PREFIX_RE.test(prefix) ||
      (OWN_LINE_PREFIX_RE.test(prefix) && OWN_LINE_SUFFIX_RE.test(suffix));
    if (isCommand) return name;
    if (/[_\d]/.test(name)) identifier ??= name;
  }

  return identifier;
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
  embeddedMedia = [],
}: {
  description: string;
  isMap: boolean;
  donationMethods: GameBanana.GameBananaDonationMethod[];
  embeddedMedia?: string[];
}): ModMetadata {
  const mapName = isMap ? extractMapName(description) : undefined;
  const donationLinks = buildDonationLinks({
    methods: donationMethods,
    description,
  });

  const metadata: ModMetadata = {
    videos: parseEmbeddedVideos(embeddedMedia),
  };
  if (mapName) metadata.mapName = mapName;
  if (donationLinks.length > 0) metadata.donationLinks = donationLinks;
  return metadata;
}

export function buildModAuthor(
  submitter?: Partial<GameBanana.GameBananaModProfile["_aSubmitter"]> | null,
): NewModAuthor | undefined {
  if (!submitter) return undefined;

  const remoteId = submitter._idRow;
  const name = submitter._sName?.trim();
  const profileUrl = trustedGameBananaUrl(submitter._sProfileUrl);
  const avatarUrl = trustedGameBananaUrl(submitter._sAvatarUrl);
  const joinedAt = submitter._tsJoinDate;
  const subscriberCount = submitter._nSubscriberCount;

  if (
    typeof remoteId !== "number" ||
    !Number.isSafeInteger(remoteId) ||
    remoteId <= 0 ||
    !name ||
    !profileUrl ||
    !avatarUrl
  ) {
    return undefined;
  }

  return {
    provider: "gamebanana",
    remoteId: remoteId.toString(),
    name,
    profileUrl,
    avatarUrl,
    hdAvatarUrl: trustedGameBananaUrl(submitter._sHdAvatarUrl),
    upicUrl: trustedGameBananaUrl(submitter._sUpicUrl),
    signatureUrl: trustedGameBananaUrl(submitter._sSigUrl),
    title: submitter._sUserTitle || null,
    joinedAt:
      typeof joinedAt === "number" &&
      Number.isSafeInteger(joinedAt) &&
      joinedAt > 0
        ? joinedAt
        : null,
    subscriberCount:
      typeof subscriberCount === "number" &&
      Number.isSafeInteger(subscriberCount) &&
      subscriberCount >= 0
        ? subscriberCount
        : null,
  };
}

const trustedGameBananaUrl = (
  value: string | null | undefined,
): string | null => {
  if (!value) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isGameBananaHost =
      hostname === "gamebanana.com" || hostname.endsWith(".gamebanana.com");

    if (
      url.protocol !== "https:" ||
      !isGameBananaHost ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
};
