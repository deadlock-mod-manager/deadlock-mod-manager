import type { ModAuthorContactDto } from "./schemas/mod.schemas";

type ContactType = ModAuthorContactDto["type"];

interface ContactPlatform {
  /** GameBanana's contact titles, lowercased */
  titles: string[];
  hosts: string[];
  /** Builds the profile link from a bare handle */
  profileUrl: (handle: string) => string;
}

const PLATFORMS = {
  steam: {
    titles: ["steam"],
    hosts: ["steamcommunity.com"],
    profileUrl: (handle) => `https://steamcommunity.com/id/${handle}`,
  },
  x: {
    titles: ["twitter/x", "twitter", "x"],
    hosts: ["x.com", "twitter.com"],
    profileUrl: (handle) => `https://x.com/${handle}`,
  },
  bluesky: {
    titles: ["bluesky"],
    hosts: ["bsky.app"],
    profileUrl: (handle) => `https://bsky.app/profile/${handle}`,
  },
  instagram: {
    titles: ["instagram"],
    hosts: ["instagram.com"],
    profileUrl: (handle) => `https://www.instagram.com/${handle}`,
  },
  youtube: {
    titles: ["youtube"],
    hosts: ["youtube.com"],
    profileUrl: (handle) => `https://www.youtube.com/@${handle}`,
  },
  twitch: {
    titles: ["twitch"],
    hosts: ["twitch.tv"],
    profileUrl: (handle) => `https://www.twitch.tv/${handle}`,
  },
  kofi: {
    titles: ["ko-fi"],
    hosts: ["ko-fi.com"],
    profileUrl: (handle) => `https://ko-fi.com/${handle}`,
  },
  patreon: {
    titles: ["patreon"],
    hosts: ["patreon.com"],
    profileUrl: (handle) => `https://www.patreon.com/${handle}`,
  },
  buymeacoffee: {
    titles: ["buy me a coffee"],
    hosts: ["buymeacoffee.com"],
    profileUrl: (handle) => `https://buymeacoffee.com/${handle}`,
  },
  github: {
    titles: ["github"],
    hosts: ["github.com"],
    profileUrl: (handle) => `https://github.com/${handle}`,
  },
  reddit: {
    titles: ["reddit"],
    hosts: ["reddit.com"],
    profileUrl: (handle) => `https://www.reddit.com/user/${handle}`,
  },
  soundcloud: {
    titles: ["soundcloud"],
    hosts: ["soundcloud.com"],
    profileUrl: (handle) => `https://soundcloud.com/${handle}`,
  },
} satisfies Record<Exclude<ContactType, "discord">, ContactPlatform>;

const DISCORD_INVITE_HOSTS = ["discord.gg", "discord.com", "discordapp.com"];
const HANDLE = /^@?([\w.-]{1,64})$/u;
// Current Discord usernames, plus the old name#1234 form some profiles still show.
const DISCORD_USERNAME = /^@?([\w.]{2,32}(?:#\d{4})?)$/u;
const DISCORD_INVITE_PATH = /^\/(?:invite\/)?([\w-]{2,32})\/?$/u;
const MAX_CONTACTS = 12;

const matchesHost = (hostname: string, hosts: string[]) => {
  const host = hostname.toLowerCase();
  return hosts.some(
    (trusted) => host === trusted || host.endsWith(`.${trusted}`),
  );
};

/** Parses a link an author typed, with or without the scheme. */
const parseLink = (value: string): URL | null => {
  if (!value.includes("/") && !value.includes(".")) return null;
  try {
    const url = new URL(
      /^https?:\/\//iu.test(value) ? value : `https://${value}`,
    );
    return url.hostname.includes(".") ? url : null;
  } catch {
    return null;
  }
};

const lastPathSegment = (url: URL) =>
  /([^/]+)\/?$/u.exec(url.pathname)?.[1] ?? url.hostname;

/** Whether a stored contact link may be opened for the given platform. */
export const isAuthorContactUrl = (type: ContactType, url: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const hosts =
    type === "discord" ? DISCORD_INVITE_HOSTS : PLATFORMS[type].hosts;
  return matchesHost(parsed.hostname, hosts);
};

const parseDiscord = (value: string): ModAuthorContactDto | null => {
  const link = parseLink(value);
  if (link && matchesHost(link.hostname, DISCORD_INVITE_HOSTS)) {
    const code = DISCORD_INVITE_PATH.exec(link.pathname)?.[1];
    if (!code) return null;
    return {
      type: "discord",
      value: `discord.gg/${code}`,
      url: `https://discord.gg/${code}`,
    };
  }
  const username = DISCORD_USERNAME.exec(value)?.[1];
  return username ? { type: "discord", value: username, url: null } : null;
};

const parsePlatform = (
  type: Exclude<ContactType, "discord">,
  value: string,
): ModAuthorContactDto | null => {
  const platform = PLATFORMS[type];
  const link = parseLink(value);
  if (link) {
    if (!matchesHost(link.hostname, platform.hosts)) return null;
    if (link.pathname === "/" || link.pathname === "") return null;
    return {
      type,
      value: lastPathSegment(link),
      url: `https://${link.hostname.toLowerCase()}${link.pathname}`,
    };
  }
  const handle = HANDLE.exec(value.replace(/^\/?u\//u, ""))?.[1];
  return handle
    ? { type, value: handle, url: platform.profileUrl(handle) }
    : null;
};

const typeForTitle = (title: string): ContactType | null => {
  const normalized = title.trim().toLowerCase();
  if (normalized === "discord") return "discord";
  for (const [type, platform] of Object.entries(PLATFORMS)) {
    if (platform.titles.includes(normalized)) {
      return type as Exclude<ContactType, "discord">;
    }
  }
  return null;
};

/**
 * Turns GameBanana's free-text contact list into links we can open. Entries
 * for platforms we don't know, or values that aren't a handle or a link to
 * that platform, are dropped.
 */
export const parseGameBananaContacts = (
  entries: ReadonlyArray<{ title?: string; value?: string }>,
): ModAuthorContactDto[] => {
  const contacts: ModAuthorContactDto[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const type = entry.title ? typeForTitle(entry.title) : null;
    const value = entry.value?.trim();
    if (!type || !value) continue;
    const contact =
      type === "discord" ? parseDiscord(value) : parsePlatform(type, value);
    if (!contact) continue;
    const key = `${contact.type}:${(contact.url ?? contact.value).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contacts.push(contact);
    if (contacts.length === MAX_CONTACTS) break;
  }
  return contacts;
};
