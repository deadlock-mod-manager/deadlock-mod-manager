import type { NewModEvent } from "@deadlock-mods/shared";
import { ChannelType, type ForumChannel } from "discord.js";
import { inject, singleton } from "tsyringe";
import { SapphireClient } from "@sapphire/framework";
import { env } from "@/lib/env";
import { logger as mainLogger } from "@/lib/logger";
import { TOKENS } from "@/lib/tokens";
import { buildModForumPost, getModForumTags } from "@/mods/embed-builder";
import { ModEnricherService } from "@/mods/mod-enricher.service";

const logger = mainLogger.child().withContext({
  service: "forum-poster",
});

@singleton()
export class ForumPosterService {
  constructor(
    @inject(TOKENS.DiscordClient) private readonly client: SapphireClient,
    @inject(ModEnricherService)
    private readonly modEnricher: ModEnricherService,
  ) {}

  async postNewMod(event: NewModEvent): Promise<void> {
    try {
      logger
        .withMetadata({
          modTitle: event.data.title,
          modLink: event.data.link,
          channelId: env.FORUM_CHANNEL_ID,
        })
        .info("Posting new mod to forum channel");

      const channel = await this.client.channels.fetch(env.FORUM_CHANNEL_ID);

      if (!channel) {
        throw new Error(`Channel with ID ${env.FORUM_CHANNEL_ID} not found`);
      }

      if (channel.type !== ChannelType.GuildForum) {
        throw new Error(
          `Channel ${env.FORUM_CHANNEL_ID} is not a forum channel (type: ${channel.type})`,
        );
      }

      const modTitle = event.data.title;
      const enrichedData = await this.modEnricher.enrichModData(event.data);
      const { content, embeds, components } = buildModForumPost(enrichedData);
      const forumChannel = channel as ForumChannel;
      const availableTags = getModForumTags(forumChannel, event.data);
      const thread = await forumChannel.threads.create({
        name: modTitle,
        appliedTags: availableTags,
        message: {
          content,
          embeds,
          components,
        },
      });

      logger
        .withMetadata({
          threadId: thread.id,
          threadName: thread.name,
          modTitle: event.data.title,
          modLink: event.data.link,
        })
        .info("Successfully created forum post for new mod");
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          modTitle: event.data.title,
          modLink: event.data.link,
        })
        .error("Failed to post new mod to forum channel");
      throw error;
    }
  }
}
