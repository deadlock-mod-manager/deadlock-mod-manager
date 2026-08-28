import { z } from "zod";

const GitHubAssetSchema = z.object({
  name: z.string(),
  download_count: z.number(),
  browser_download_url: z.string(),
  size: z.number(),
  content_type: z.string(),
});

const GitHubReleaseSchema = z.object({
  tag_name: z.string(),
  name: z
    .string()
    .nullable()
    .transform((name) => name ?? ""),
  body: z
    .string()
    .nullable()
    .transform((body) => body ?? ""),
  published_at: z
    .string()
    .nullable()
    .transform((publishedAt) => publishedAt ?? ""),
  assets: z.array(GitHubAssetSchema),
  draft: z.boolean(),
  prerelease: z.boolean(),
});

export const GitHubReleasesSchema = z.array(GitHubReleaseSchema);
