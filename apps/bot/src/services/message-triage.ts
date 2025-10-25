import {
  db,
  type MessagePattern,
  MessagePatternRepository,
  TriageKeywordRepository,
} from "@deadlock-mods/database";
import { OpenAIEmbeddings } from "@langchain/openai";
import { ok } from "neverthrow";
import { env } from "@/lib/env";
import { logger as mainLogger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { FeatureFlagsService } from "./feature-flags";

const logger = mainLogger.child().withContext({
  service: "message-triage-service",
});

export type MessageType = "bug_report" | "help_request" | "normal";

interface ClassificationResult {
  type: MessageType;
  confidence: number;
  suggestedChannelId?: string;
}

export class MessageTriageService {
  private static instance: MessageTriageService | null = null;

  private embeddings: OpenAIEmbeddings;
  private patternRepository: MessagePatternRepository;
  private keywordRepository: TriageKeywordRepository;
  private keywords: Set<string> = new Set();
  private patterns: MessagePattern[] = [];
  private readonly RATE_LIMIT_WINDOW = 60;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
      dimensions: 1536,
    });

    this.patternRepository = new MessagePatternRepository(db, logger);
    this.keywordRepository = new TriageKeywordRepository(db, logger);
  }

  static getInstance(): MessageTriageService {
    if (!MessageTriageService.instance) {
      MessageTriageService.instance = new MessageTriageService();
    }
    return MessageTriageService.instance;
  }

  async initialize() {
    logger.info("Initializing message triage service");

    const keywordsResult = await this.keywordRepository.findAll();
    if (keywordsResult.isErr()) {
      logger
        .withError(keywordsResult.error)
        .error("Failed to load keywords from database");
      throw keywordsResult.error;
    }

    this.keywords = new Set(
      keywordsResult.value.map((k) => k.keyword.toLowerCase()),
    );

    const patternsResult = await this.patternRepository.findAll();
    if (patternsResult.isErr()) {
      logger
        .withError(patternsResult.error)
        .error("Failed to load patterns from database");
      throw patternsResult.error;
    }

    this.patterns = patternsResult.value;

    logger
      .withMetadata({
        keywordCount: this.keywords.size,
        patternCount: this.patterns.length,
      })
      .info("Message triage service initialized");
  }

  private async checkRateLimit(userId: string) {
    if (env.NODE_ENV === "development") {
      return ok(true);
    }

    const key = `triage:ratelimit:${userId}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, this.RATE_LIMIT_WINDOW);
      }

      return ok(count === 1);
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ userId })
        .warn("Rate limit check failed, allowing request");
      return ok(true);
    }
  }

  private containsKeywords(content: string): boolean {
    const lowerContent = content.toLowerCase();
    for (const keyword of this.keywords) {
      if (lowerContent.includes(keyword)) {
        return true;
      }
    }
    return false;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have the same length");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  async classifyMessage(
    content: string,
    userId: string,
  ): Promise<
    | { success: true; result: ClassificationResult }
    | { success: false; reason: string }
  > {
    if (content.length < 10) {
      return { success: true, result: { type: "normal", confidence: 1.0 } };
    }

    const rateLimitResult = await this.checkRateLimit(userId);
    if (rateLimitResult.isErr()) {
      logger
        .withError(rateLimitResult.error)
        .withMetadata({ userId })
        .error("Rate limit check failed");
      return { success: false, reason: "Rate limit check failed" };
    }

    if (!rateLimitResult.value) {
      logger.withMetadata({ userId }).info("User rate limited");
      return { success: false, reason: "Rate limited" };
    }

    if (!this.containsKeywords(content)) {
      logger
        .withMetadata({ contentLength: content.length })
        .debug("Message does not contain keywords, classified as normal");
      return { success: true, result: { type: "normal", confidence: 1.0 } };
    }

    logger.info("Message contains keywords, generating embedding");

    try {
      const messageEmbedding = await this.embeddings.embedQuery(content);

      let maxSimilarity = 0;
      let bestMatch: MessagePattern | null = null;

      for (const pattern of this.patterns) {
        const patternEmbedding = pattern.embedding as number[];

        const similarity = this.cosineSimilarity(
          messageEmbedding,
          patternEmbedding,
        );

        logger
          .withMetadata({
            patternType: pattern.patternType,
            patternText: pattern.patternText.slice(0, 50),
            similarity: similarity.toFixed(4),
          })
          .debug("Pattern similarity evaluated");

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          bestMatch = pattern;
        }
      }

      const similarityThresholdResult =
        await FeatureFlagsService.instance.getFeatureFlagValue<number>(
          "triage_similarity_threshold",
        );
      const threshold = similarityThresholdResult.match(
        (value: number | null) => value ?? 0.75,
        () => 0.75,
      );

      if (maxSimilarity >= threshold && bestMatch) {
        const channelId =
          bestMatch.patternType === "bug_report"
            ? env.BUG_REPORT_CHANNEL_ID || env.REPORTS_CHANNEL_ID
            : env.SUPPORT_CHANNEL_ID;

        logger
          .withMetadata({
            userId,
            classification: bestMatch.patternType,
            confidence: maxSimilarity,
            matchedPattern: bestMatch.patternText.slice(0, 50),
          })
          .info("Message classified");

        return {
          success: true,
          result: {
            type: bestMatch.patternType,
            confidence: maxSimilarity,
            suggestedChannelId: channelId,
          },
        };
      }

      logger
        .withMetadata({
          userId,
          maxSimilarity,
        })
        .debug("Message similarity below threshold, classified as normal");

      return { success: true, result: { type: "normal", confidence: 1.0 } };
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ userId })
        .error("Failed to classify message");
      return { success: false, reason: "Classification failed" };
    }
  }

  async reload() {
    logger.info("Reloading triage data");
    await this.initialize();
  }
}
