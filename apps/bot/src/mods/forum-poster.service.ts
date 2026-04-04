import type { NewModEvent } from "@deadlock-mods/shared";
import { ChannelType, type ForumChannel } from "discord.js";
import { inject, singleton } from "tsyringe";
import { SapphireClient } from "@sapphire/framework";
import { env } from "@/lib/env";
import { wideEventContext } from "@/lib/logger";
import { TOKENS } from "@/lib/tokens";
import { buildModForumPost, getModForumTags } from "@/mods/embed-builder";
import { ModEnricherService } from "@/mods/mod-enricher.service";

@singleton()
export class ForumPosterService {
  constructor(
    @inject(TOKENS.DiscordClient) private readonly client: SapphireClient,
    @inject(ModEnricherService)
    private readonly modEnricher: ModEnricherService,
  ) {}

  async postNewMod(event: NewModEvent): Promise<void> {
    const wide = wideEventContext.get();
    wide?.merge({
      service: "forum-poster",
      modTitle: event.data.title,
      modLink: event.data.link,
      channelId: env.FORUM_CHANNEL_ID,
    });

    try {
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

      wide?.merge({
        threadId: thread.id,
        threadName: thread.name,
        forumPostOutcome: "created",
      });
    } catch (error) {
      wide?.merge({ forumPostOutcome: "failed" });
      throw error;
    }
  }
}
