import { Listener } from "@sapphire/framework";
import type { Message, TextChannel } from "discord.js";
import { SupportAgent } from "@/ai/agents/support";

export class MessageCreateListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
  ) {
    super(context, {
      ...options,
      event: "messageCreate",
    });
  }

  public async shouldRespond(message: Message) {
    if (message.mentions.has(this.container.client.user?.id || "")) {
      return true;
    }

    if (
      message.author.bot ||
      message.author.id === this.container.client.user?.id
    ) {
      return false;
    }

    return false;
  }

  public async run(message: Message) {
    if (!(await this.shouldRespond(message))) {
      return;
    }

    await (message.channel as TextChannel).sendTyping();

    const supportAgent = new SupportAgent();
    const response = await supportAgent.invoke(
      message.content,
      message.id,
      message.author.id,
      ["support"],
    );

    if (response.isErr()) {
      return message.reply({
        content:
          "An error occurred while processing your request. Please try again later.",
      });
    }

    await message.reply({
      content: response.value,
    });
  }
}
