import { UniqueConstraintError } from "@deadlock-mods/common";
import { db } from "@deadlock-mods/database";
import {
  SegmentRepository,
  SegmentService,
} from "@deadlock-mods/feature-flags";
import type { Collection, Message, ThreadChannel } from "discord.js";
import { ChannelType } from "discord.js";
import client from "@/lib/discord";
import { env } from "@/lib/env";
import { logger as mainLogger } from "@/lib/logger";
import {
  findUserIdByDiscordId,
  findUserIdByName,
} from "@/repositories/user.repository";

const logger = mainLogger.child().withContext({
  service: "nightly-testers-sync",
});

const SEGMENT_NAME = "nightly-testers";
const SEGMENT_DESCRIPTION =
  "Users participating in the nightly testing program";
const SEGMENT_RANK = 10;

export function parseUsername(content: string): string | null {
  // Pattern 1 (most common): "Username: <value>" - case-insensitive, flexible spacing
  const usernameMatch = content.match(/username\s*:\s*(.+)/i);
  if (usernameMatch?.[1]) {
    const parsed = usernameMatch[1].trim();
    if (parsed.length > 0) return parsed;
  }

  // Pattern 2: Two-line format with no explicit "Username:" label
  // First line starts with an OS indicator, second line is just the username.
  // e.g. "windows 11\nzax"
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 2) {
    const firstLineIsOS =
      /^(os\b|operating\s*system|windows|linux|macos|mac\s*os|ubuntu|arch|fedora|debian)/i.test(
        lines[0],
      );
    const secondLineHasNoColon = !lines[1].includes(":");
    if (firstLineIsOS && secondLineHasNoColon && lines[1].length > 0) {
      return lines[1];
    }
  }

  return null;
}

interface ParsedTesterEntry {
  discordAuthorId: string;
  discordAuthorUsername: string;
  parsedAppUsername: string | null;
}

interface SyncResult {
  totalMessages: number;
  parsedEntries: number;
  matchedUsers: number;
  addedToSegment: number;
  alreadyInSegment: number;
  roleAssigned: number;
  roleAssignFailed: number;
  unmatchedEntries: ParsedTesterEntry[];
}

export class NightlyTestersSyncService {
  private static instance: NightlyTestersSyncService | null = null;
  private readonly segmentRepository: SegmentRepository;
  private readonly segmentService: SegmentService;

  private constructor() {
    this.segmentRepository = new SegmentRepository(db, logger);
    this.segmentService = new SegmentService(this.segmentRepository);
  }

  static getInstance(): NightlyTestersSyncService {
    if (!NightlyTestersSyncService.instance) {
      NightlyTestersSyncService.instance = new NightlyTestersSyncService();
    }
    return NightlyTestersSyncService.instance;
  }

  async sync(): Promise<SyncResult> {
    const result: SyncResult = {
      totalMessages: 0,
      parsedEntries: 0,
      matchedUsers: 0,
      addedToSegment: 0,
      alreadyInSegment: 0,
      roleAssigned: 0,
      roleAssignFailed: 0,
      unmatchedEntries: [],
    };

    const segment = await this.getOrCreateSegment();
    if (!segment) {
      throw new Error("Failed to get or create nightly-testers segment");
    }

    const messages = await this.fetchAllMessages();
    result.totalMessages = messages.size;

    const entries = this.parseEntries(messages);
    result.parsedEntries = entries.length;

    for (const entry of entries) {
      const userId = await this.resolveUserId(entry);

      if (!userId) {
        result.unmatchedEntries.push(entry);
      } else {
        result.matchedUsers++;

        const addResult = await this.segmentService.addUserToSegment(
          segment.id,
          userId,
        );

        if (addResult.isErr()) {
          if (addResult.error instanceof UniqueConstraintError) {
            result.alreadyInSegment++;
          } else {
            logger
              .withError(addResult.error)
              .withMetadata({ userId, segmentId: segment.id })
              .error("Failed to add user to segment");
          }
        } else {
          result.addedToSegment++;
        }
      }

      const roleAssigned = await this.assignRole(entry.discordAuthorId);
      if (roleAssigned) {
        result.roleAssigned++;
      } else {
        result.roleAssignFailed++;
      }
    }

    logger
      .withMetadata({
        totalMessages: result.totalMessages,
        parsedEntries: result.parsedEntries,
        matchedUsers: result.matchedUsers,
        addedToSegment: result.addedToSegment,
        alreadyInSegment: result.alreadyInSegment,
        roleAssigned: result.roleAssigned,
        roleAssignFailed: result.roleAssignFailed,
        unmatchedCount: result.unmatchedEntries.length,
      })
      .info("Nightly testers sync complete");

    return result;
  }

  private async getOrCreateSegment() {
    const findResult = await this.segmentRepository.findByName(SEGMENT_NAME);

    if (findResult.isErr()) {
      logger
        .withError(findResult.error)
        .error("Failed to look up nightly-testers segment");
      return null;
    }

    if (findResult.value) {
      return findResult.value;
    }

    const createResult = await this.segmentService.createSegment({
      name: SEGMENT_NAME,
      description: SEGMENT_DESCRIPTION,
      rank: SEGMENT_RANK,
    });

    if (createResult.isErr()) {
      logger
        .withError(createResult.error)
        .error("Failed to create nightly-testers segment");
      return null;
    }

    return createResult.value;
  }

  private async fetchAllMessages(): Promise<Collection<string, Message>> {
    const channel = await client.channels.fetch(env.NIGHTLY_TESTERS_CHANNEL_ID);

    if (!channel) {
      throw new Error(`Channel ${env.NIGHTLY_TESTERS_CHANNEL_ID} not found`);
    }

    if (channel.type !== ChannelType.PublicThread) {
      throw new Error(
        `Channel ${env.NIGHTLY_TESTERS_CHANNEL_ID} must be a public thread (got type: ${channel.type})`,
      );
    }

    const thread = channel as ThreadChannel;
    const allMessages: Collection<string, Message> =
      await thread.messages.fetch({ limit: 100 });

    if (allMessages.size === 100) {
      let lastId = allMessages.last()?.id;

      while (lastId) {
        const batch = await thread.messages.fetch({
          limit: 100,
          before: lastId,
        });

        if (batch.size === 0) break;

        batch.forEach((msg, id) => allMessages.set(id, msg));
        lastId = batch.size === 100 ? batch.last()?.id : undefined;
      }
    }

    return allMessages;
  }

  private parseEntries(
    messages: Collection<string, Message>,
  ): ParsedTesterEntry[] {
    const entries: ParsedTesterEntry[] = [];

    for (const message of messages.values()) {
      // Skip the original channel post by the bot/admin (the signup instructions message)
      if (message.author.bot) continue;

      const parsedAppUsername = parseUsername(message.content);

      entries.push({
        discordAuthorId: message.author.id,
        discordAuthorUsername: message.author.username,
        parsedAppUsername,
      });
    }

    return entries;
  }

  private async assignRole(discordAuthorId: string): Promise<boolean> {
    try {
      const guild = await client.guilds.fetch(env.DMM_GUILD_ID);
      const member = await guild.members.fetch(discordAuthorId);
      await member.roles.add(env.NIGHTLY_TESTER_ROLE_ID);
      return true;
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ discordAuthorId })
        .warn("Failed to assign nightly tester role");
      return false;
    }
  }

  private async resolveUserId(
    entry: ParsedTesterEntry,
  ): Promise<string | null> {
    // Primary: Discord account link
    const userIdByDiscord = await findUserIdByDiscordId(entry.discordAuthorId);
    if (userIdByDiscord) return userIdByDiscord;

    // Fallback: name match using the username they typed in the message
    if (entry.parsedAppUsername) {
      const userIdByName = await findUserIdByName(entry.parsedAppUsername);
      if (userIdByName) return userIdByName;
    }

    return null;
  }
}
