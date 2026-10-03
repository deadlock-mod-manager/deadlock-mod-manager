import { ProviderError } from "@deadlock-mods/common/client-errors";
import { z } from "zod";
import { fetch } from "./fetch";
import {
  steamBbcodeExcerpt,
  steamBbcodeFirstImage,
  steamBbcodeToHtml,
} from "./steam-bbcode";

const DEADLOCK_APP_ID = 1422450;
export const STEAM_NEWS_PAGE = `https://store.steampowered.com/news/app/${DEADLOCK_APP_ID}`;
const STEAM_NEWS_URL =
  "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/";

class SteamNewsError extends ProviderError {
  constructor(readonly status: number) {
    super(`Steam news request failed with ${status}`);
  }
}

const newsItemSchema = z.object({
  gid: z.string(),
  title: z.string(),
  contents: z.string(),
  date: z.number(),
  tags: z.array(z.string()).optional(),
});

const newsResponseSchema = z.object({
  appnews: z.object({ newsitems: z.array(newsItemSchema) }),
});

export type PatchNote = {
  id: string;
  title: string;
  /** Unix seconds. */
  publishedAt: number;
  /** Tagged as patch notes by Valve, rather than a general announcement. */
  isPatch: boolean;
  url: string;
  html: string;
  excerpt: string;
  image: string | null;
};

/** Valve's own announcements for Deadlock, newest first. */
export const getPatchNotes = async (count = 5): Promise<PatchNote[]> => {
  const params = new URLSearchParams({
    appid: String(DEADLOCK_APP_ID),
    count: String(count),
    maxlength: "0",
    feeds: "steam_community_announcements",
    format: "json",
  });
  const res = await fetch(`${STEAM_NEWS_URL}?${params}`);
  if (!res.ok) {
    throw new SteamNewsError(res.status);
  }

  const { appnews } = newsResponseSchema.parse(await res.json());
  return appnews.newsitems.map((item) => ({
    id: item.gid,
    title: item.title,
    publishedAt: item.date,
    isPatch: item.tags?.includes("patchnotes") ?? false,
    url: `${STEAM_NEWS_PAGE}/view/${item.gid}`,
    html: steamBbcodeToHtml(item.contents),
    excerpt: steamBbcodeExcerpt(item.contents),
    image: steamBbcodeFirstImage(item.contents),
  }));
};
