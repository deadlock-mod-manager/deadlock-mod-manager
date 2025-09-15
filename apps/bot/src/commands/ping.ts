import { isMessageInstance } from '@sapphire/discord.js-utilities';
import { Command } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';

export class PingCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName('ping').setDescription('Ping bot to see if it is alive')
    );
  }

  override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const callbackResponse = await interaction.reply({
      content: 'Ping?',
      withResponse: true,
      flags: MessageFlags.Ephemeral,
    });
    const msg = callbackResponse.resource?.message;

    if (msg && isMessageInstance(msg)) {
      const diff = msg.createdTimestamp - interaction.createdTimestamp;
      const ping = Math.round(this.container.client.ws.ping);
      return interaction.editReply(
        `Pong 🏓! (Round trip took: ${diff}ms. Heartbeat: ${ping}ms.)`
      );
    }

    return interaction.editReply('Failed to retrieve ping :(');
  }
}
