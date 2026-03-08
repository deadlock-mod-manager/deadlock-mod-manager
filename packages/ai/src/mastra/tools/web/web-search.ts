import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  clampInt,
  DEFAULT_TIMEOUT_SECONDS,
  extractHostname,
  normalizeCacheKey,
  readResponseText,
  searchCache,
  withTimeout,
} from "./shared";

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_SEARCH_COUNT = 5;
const MAX_SEARCH_COUNT = 10;

// Perplexity via OpenRouter configuration
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Available Perplexity Sonar models via OpenRouter:
 * - perplexity/sonar: Fast Q&A with web search (best for quick lookups)
 * - perplexity/sonar-pro: Multi-step reasoning with web search (default, best for complex questions)
 * - perplexity/sonar-reasoning-pro: Chain-of-thought analysis (best for deep research)
 */
const PERPLEXITY_MODELS = [
  "perplexity/sonar",
  "perplexity/sonar-pro",
  "perplexity/sonar-reasoning-pro",
] as const;
type PerplexityModel = (typeof PERPLEXITY_MODELS)[number];
const DEFAULT_PERPLEXITY_MODEL: PerplexityModel = "perplexity/sonar-pro";

const BRAVE_FRESHNESS_SHORTCUTS = new Set(["pd", "pw", "pm", "py"]);
const BRAVE_FRESHNESS_RANGE = /^(\d{4}-\d{2}-\d{2})to(\d{4}-\d{2}-\d{2})$/;

const SEARCH_PROVIDERS = ["brave", "perplexity"] as const;
type SearchProvider = (typeof SEARCH_PROVIDERS)[number];

type BraveSearchResult = {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
};

type BraveSearchResponse = {
  web?: {
    results?: BraveSearchResult[];
  };
};

type PerplexitySearchResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  citations?: string[];
};

function normalizeFreshness(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const lower = trimmed.toLowerCase();
  if (BRAVE_FRESHNESS_SHORTCUTS.has(lower)) {
    return lower;
  }

  const match = trimmed.match(BRAVE_FRESHNESS_RANGE);
  if (!match) {
    return undefined;
  }

  const start = match[1];
  const end = match[2];
  if (!start || !end || !isValidIsoDate(start) || !isValidIsoDate(end)) {
    return undefined;
  }
  if (start > end) {
    return undefined;
  }

  return `${start}to${end}`;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export type PerplexityConfig = {
  /** OpenRouter API key (uses OPENROUTER_API_KEY env var if not provided) */
  apiKey?: string;
  /**
   * Perplexity model to use. Let the agent choose based on query complexity:
   * - "perplexity/sonar": Fast Q&A with web search (quick lookups)
   * - "perplexity/sonar-pro": Multi-step reasoning + web search (complex questions, default)
   * - "perplexity/sonar-reasoning-pro": Chain-of-thought analysis (deep research)
   */
  model?: PerplexityModel;
};

export type WebSearchConfig = {
  /** Search provider: "brave" or "perplexity" */
  provider?: SearchProvider;
  /** Brave Search API key (for brave provider, uses BRAVE_API_KEY env var if not provided) */
  braveApiKey?: string;
  /** Perplexity configuration (for perplexity provider, uses OpenRouter) */
  perplexity?: PerplexityConfig;
  /** Request timeout in seconds */
  timeoutSeconds?: number;
  /** Max results for brave search */
  maxResults?: number;
};

async function runBraveSearch(params: {
  query: string;
  count: number;
  apiKey: string;
  timeoutSeconds: number;
  country?: string;
  searchLang?: string;
  uiLang?: string;
  freshness?: string;
}): Promise<{
  query: string;
  provider: "brave";
  count: number;
  tookMs: number;
  results: Array<{
    title: string;
    url: string;
    description: string;
    published?: string;
    siteName?: string;
  }>;
}> {
  const start = Date.now();

  const url = new URL(BRAVE_SEARCH_ENDPOINT);
  url.searchParams.set("q", params.query);
  url.searchParams.set("count", String(params.count));

  if (params.country) {
    url.searchParams.set("country", params.country);
  }
  if (params.searchLang) {
    url.searchParams.set("search_lang", params.searchLang);
  }
  if (params.uiLang) {
    url.searchParams.set("ui_lang", params.uiLang);
  }
  if (params.freshness) {
    url.searchParams.set("freshness", params.freshness);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": params.apiKey,
    },
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
  });

  if (!res.ok) {
    const detail = await readResponseText(res);
    throw new Error(
      `Brave Search API error (${res.status}): ${detail || res.statusText}`,
    );
  }

  const data = (await res.json()) as BraveSearchResponse;
  const results = Array.isArray(data.web?.results)
    ? (data.web?.results ?? [])
    : [];

  const mapped = results.map((entry) => ({
    title: entry.title ?? "",
    url: entry.url ?? "",
    description: entry.description ?? "",
    published: entry.age || undefined,
    siteName: extractHostname(entry.url ?? "") || undefined,
  }));

  return {
    query: params.query,
    provider: "brave",
    count: mapped.length,
    tookMs: Date.now() - start,
    results: mapped,
  };
}

async function runPerplexitySearch(params: {
  query: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutSeconds: number;
}): Promise<{
  query: string;
  provider: "perplexity";
  model: string;
  tookMs: number;
  content: string;
  citations: string[];
}> {
  const start = Date.now();
  const endpoint = `${params.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
      "HTTP-Referer": "https://deadlockmods.app/",
      "X-Title": "Deadlock Mod Manager Web Search",
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        {
          role: "user",
          content: params.query,
        },
      ],
    }),
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
  });

  if (!res.ok) {
    const detail = await readResponseText(res);
    throw new Error(
      `Perplexity API error (${res.status}): ${detail || res.statusText}`,
    );
  }

  const data = (await res.json()) as PerplexitySearchResponse;
  const content = data.choices?.[0]?.message?.content ?? "No response";
  const citations = data.citations ?? [];

  return {
    query: params.query,
    provider: "perplexity",
    model: params.model,
    tookMs: Date.now() - start,
    content,
    citations,
  };
}

export function createWebSearchTool(config?: WebSearchConfig) {
  const provider: SearchProvider = config?.provider ?? "brave";
  const braveApiKey = config?.braveApiKey ?? process.env.BRAVE_API_KEY;
  const openRouterApiKey =
    config?.perplexity?.apiKey ?? process.env.OPENROUTER_API_KEY;
  const perplexityModel = config?.perplexity?.model ?? DEFAULT_PERPLEXITY_MODEL;
  const timeoutSeconds = config?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const maxResults = config?.maxResults ?? DEFAULT_SEARCH_COUNT;

  const description =
    provider === "perplexity"
      ? `Search the web using Perplexity Sonar via OpenRouter. Returns AI-synthesized answers with citations from real-time web search. Available models: perplexity/sonar (fast), perplexity/sonar-pro (reasoning, default), perplexity/sonar-reasoning-pro (deep research).`
      : "Search the web using Brave Search API. Supports region-specific and localized search via country and language parameters. Returns titles, URLs, and snippets for fast research.";

  const resultItemSchema = z.object({
    title: z.string(),
    url: z.string(),
    description: z.string(),
    published: z.string().optional(),
    siteName: z.string().optional(),
  });

  const outputSchema = z.object({
    query: z.string(),
    provider: z.string(),
    tookMs: z.number(),
    count: z.number().optional(),
    results: z.array(resultItemSchema).optional(),
    model: z.string().optional(),
    content: z.string().optional(),
    citations: z.array(z.string()).optional(),
    cached: z.boolean().optional(),
    error: z.string().optional(),
  });

  return createTool({
    id: provider === "perplexity" ? "perplexity-search" : "brave-search",
    description,
    inputSchema: z.object({
      query: z.string().describe("Search query string"),
      // Perplexity-specific options
      model: z
        .enum([
          "perplexity/sonar",
          "perplexity/sonar-pro",
          "perplexity/sonar-reasoning-pro",
        ])
        .optional()
        .describe(
          "Perplexity model to use (Perplexity provider only). Choose based on query complexity: 'perplexity/sonar' for fast Q&A, 'perplexity/sonar-pro' for multi-step reasoning (default), 'perplexity/sonar-reasoning-pro' for deep research",
        ),
      // Brave-specific options
      count: z
        .number()
        .min(1)
        .max(MAX_SEARCH_COUNT)
        .optional()
        .describe("Number of results to return (1-10, Brave only)"),
      country: z
        .string()
        .optional()
        .describe(
          "2-letter country code for region-specific results (e.g., 'DE', 'US', 'ALL', Brave only)",
        ),
      searchLang: z
        .string()
        .optional()
        .describe(
          "ISO language code for search results (e.g., 'de', 'en', 'fr', Brave only)",
        ),
      uiLang: z
        .string()
        .optional()
        .describe("ISO language code for UI elements (Brave only)"),
      freshness: z
        .string()
        .optional()
        .describe(
          "Filter results by discovery time (Brave only). Values: 'pd' (past 24h), 'pw' (past week), 'pm' (past month), 'py' (past year), or date range 'YYYY-MM-DDtoYYYY-MM-DD'",
        ),
    }),
    outputSchema,
    execute: async ({
      query,
      model,
      count,
      country,
      searchLang,
      uiLang,
      freshness,
    }) => {
      // Handle Perplexity provider (via OpenRouter)
      if (provider === "perplexity") {
        if (!openRouterApiKey) {
          return {
            query,
            provider: "perplexity",
            tookMs: 0,
            error:
              "Missing OpenRouter API key. Set OPENROUTER_API_KEY environment variable.",
          };
        }

        const selectedModel = model ?? perplexityModel;
        const cacheKey = normalizeCacheKey(
          `perplexity:${query}:${selectedModel}`,
        );
        const cached = searchCache.get(cacheKey);
        if (cached) {
          return outputSchema.parse({ ...cached, cached: true });
        }

        try {
          const result = await runPerplexitySearch({
            query,
            apiKey: openRouterApiKey,
            baseUrl: OPENROUTER_BASE_URL,
            model: selectedModel,
            timeoutSeconds,
          });

          searchCache.set(cacheKey, result);

          return result;
        } catch (error) {
          return {
            query,
            provider: "perplexity",
            tookMs: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      // Handle Brave provider
      if (!braveApiKey) {
        return {
          query,
          provider: "brave",
          count: 0,
          tookMs: 0,
          results: [],
          error:
            "Missing Brave Search API key. Set BRAVE_API_KEY environment variable or configure braveApiKey.",
        };
      }

      const normalizedFreshness = freshness
        ? normalizeFreshness(freshness)
        : undefined;
      if (freshness && !normalizedFreshness) {
        return {
          query,
          provider: "brave",
          count: 0,
          tookMs: 0,
          results: [],
          error:
            "Invalid freshness value. Must be one of: pd, pw, pm, py, or a range like YYYY-MM-DDtoYYYY-MM-DD",
        };
      }

      const effectiveCount = clampInt(
        count ?? maxResults,
        DEFAULT_SEARCH_COUNT,
        1,
        MAX_SEARCH_COUNT,
      );
      const cacheKey = normalizeCacheKey(
        `brave:${query}:${effectiveCount}:${country || "default"}:${searchLang || "default"}:${uiLang || "default"}:${normalizedFreshness || "default"}`,
      );

      const cached = searchCache.get(cacheKey);
      if (cached) {
        return outputSchema.parse({ ...cached, cached: true });
      }

      try {
        const result = await runBraveSearch({
          query,
          count: effectiveCount,
          apiKey: braveApiKey,
          timeoutSeconds,
          country,
          searchLang,
          uiLang,
          freshness: normalizedFreshness,
        });

        searchCache.set(cacheKey, result);

        return result;
      } catch (error) {
        return {
          query,
          provider: "brave",
          count: 0,
          tookMs: 0,
          results: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}
