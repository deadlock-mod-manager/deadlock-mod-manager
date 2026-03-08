import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  extractReadableContent,
  htmlToMarkdown,
  looksLikeHtml,
  markdownToText,
  truncateText,
  type ExtractMode,
} from "./fetch-utils";
import {
  clampInt,
  DEFAULT_TIMEOUT_SECONDS,
  fetchCache,
  normalizeCacheKey,
  readResponseText,
  validateHttpUrl,
  withTimeout,
} from "./shared";

const DEFAULT_MAX_CHARS = 50_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_ERROR_MAX_CHARS = 4_000;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function normalizeContentType(value: string | null | undefined): string {
  if (!value) {
    return "application/octet-stream";
  }
  const [raw] = value.split(";");
  return raw?.trim() || "application/octet-stream";
}

function formatErrorDetail(params: {
  detail: string;
  contentType?: string | null;
  maxChars: number;
}): string {
  const { detail, contentType, maxChars } = params;
  if (!detail) {
    return "";
  }

  let text = detail;
  const contentTypeLower = contentType?.toLowerCase();

  if (contentTypeLower?.includes("text/html") || looksLikeHtml(detail)) {
    const rendered = htmlToMarkdown(detail);
    const withTitle = rendered.title
      ? `${rendered.title}\n${rendered.text}`
      : rendered.text;
    text = markdownToText(withTitle);
  }

  const truncated = truncateText(text.trim(), maxChars);
  return truncated.text;
}

export type WebFetchConfig = {
  timeoutSeconds?: number;
  maxChars?: number;
  maxRedirects?: number;
  userAgent?: string;
};

async function fetchWithRedirects(params: {
  url: string;
  maxRedirects: number;
  timeoutSeconds: number;
  userAgent: string;
}): Promise<{ response: Response; finalUrl: string }> {
  let finalUrl = params.url;
  let redirectCount = 0;

  while (redirectCount <= params.maxRedirects) {
    const response = await fetch(finalUrl, {
      method: "GET",
      headers: {
        Accept: "*/*",
        "User-Agent": params.userAgent,
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "manual",
      signal: withTimeout(undefined, params.timeoutSeconds * 1000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return { response, finalUrl };
      }

      try {
        finalUrl = new URL(location, finalUrl).toString();
        validateHttpUrl(finalUrl);
      } catch {
        throw new Error(`Invalid redirect URL: ${location}`);
      }

      redirectCount++;
      continue;
    }

    return { response, finalUrl };
  }

  throw new Error("Too many redirects");
}

async function runWebFetch(params: {
  url: string;
  extractMode: ExtractMode;
  maxChars: number;
  maxRedirects: number;
  timeoutSeconds: number;
  userAgent: string;
}): Promise<{
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  title?: string;
  extractMode: ExtractMode;
  extractor: string;
  truncated: boolean;
  length: number;
  fetchedAt: string;
  tookMs: number;
  text: string;
}> {
  const start = Date.now();
  validateHttpUrl(params.url);

  const { response, finalUrl } = await fetchWithRedirects({
    url: params.url,
    maxRedirects: params.maxRedirects,
    timeoutSeconds: params.timeoutSeconds,
    userAgent: params.userAgent,
  });

  if (!response.ok) {
    const rawDetail = await readResponseText(response);
    const detail = formatErrorDetail({
      detail: rawDetail,
      contentType: response.headers.get("content-type"),
      maxChars: DEFAULT_ERROR_MAX_CHARS,
    });
    throw new Error(
      `Web fetch failed (${response.status}): ${detail || response.statusText}`,
    );
  }

  const contentType =
    response.headers.get("content-type") ?? "application/octet-stream";
  const normalizedContentType = normalizeContentType(contentType);
  const body = await readResponseText(response);

  let title: string | undefined;
  let extractor = "raw";
  let text = body;

  if (contentType.includes("text/html")) {
    const readable = await extractReadableContent({
      html: body,
      url: finalUrl,
      extractMode: params.extractMode,
    });

    if (readable?.text) {
      text = readable.text;
      title = readable.title;
      extractor = "readability";
    } else {
      const fallback = htmlToMarkdown(body);
      text =
        params.extractMode === "text"
          ? markdownToText(fallback.text)
          : fallback.text;
      title = fallback.title;
      extractor = "fallback";
    }
  } else if (contentType.includes("application/json")) {
    try {
      text = JSON.stringify(JSON.parse(body), null, 2);
      extractor = "json";
    } catch {
      text = body;
      extractor = "raw";
    }
  }

  const truncated = truncateText(text, params.maxChars);

  return {
    url: params.url,
    finalUrl,
    status: response.status,
    contentType: normalizedContentType,
    title,
    extractMode: params.extractMode,
    extractor,
    truncated: truncated.truncated,
    length: truncated.text.length,
    fetchedAt: new Date().toISOString(),
    tookMs: Date.now() - start,
    text: truncated.text,
  };
}

export function createWebFetchTool(config?: WebFetchConfig) {
  const timeoutSeconds = config?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const maxChars = config?.maxChars ?? DEFAULT_MAX_CHARS;
  const maxRedirects = config?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const userAgent = config?.userAgent ?? DEFAULT_USER_AGENT;

  return createTool({
    id: "web-fetch",
    description:
      "Fetch and extract readable content from a URL (HTML to markdown/text). Use for lightweight page access without browser automation. Best for articles, documentation, and text-heavy pages.",
    inputSchema: z.object({
      url: z.string().describe("HTTP or HTTPS URL to fetch"),
      extractMode: z
        .enum(["markdown", "text"])
        .optional()
        .default("markdown")
        .describe('Extraction mode: "markdown" or "text"'),
      maxChars: z
        .number()
        .min(100)
        .optional()
        .describe("Maximum characters to return (truncates when exceeded)"),
    }),
    outputSchema: z.object({
      url: z.string(),
      finalUrl: z.string(),
      status: z.number(),
      contentType: z.string(),
      title: z.string().optional(),
      extractMode: z.enum(["markdown", "text"]),
      extractor: z.string(),
      truncated: z.boolean(),
      length: z.number(),
      fetchedAt: z.string(),
      tookMs: z.number(),
      cached: z.boolean().optional(),
      text: z.string(),
      error: z.string().optional(),
    }),
    execute: async ({ url, extractMode, maxChars: requestedMaxChars }) => {
      const mode: ExtractMode = extractMode === "text" ? "text" : "markdown";
      const effectiveMaxChars = clampInt(
        requestedMaxChars,
        maxChars,
        100,
        Number.POSITIVE_INFINITY,
      );

      const cacheKey = normalizeCacheKey(
        `fetch:${url}:${mode}:${effectiveMaxChars}`,
      );
      const cached = fetchCache.get(cacheKey);
      if (cached) {
        return { ...cached, cached: true };
      }

      try {
        const result = await runWebFetch({
          url,
          extractMode: mode,
          maxChars: effectiveMaxChars,
          maxRedirects,
          timeoutSeconds,
          userAgent,
        });

        fetchCache.set(cacheKey, result);

        return result;
      } catch (error) {
        return {
          url,
          finalUrl: url,
          status: 0,
          contentType: "unknown",
          extractMode: mode,
          extractor: "none",
          truncated: false,
          length: 0,
          fetchedAt: new Date().toISOString(),
          tookMs: 0,
          text: "",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}
