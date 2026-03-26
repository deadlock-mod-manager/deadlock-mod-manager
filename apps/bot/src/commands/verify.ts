import { Command } from "@sapphire/framework";
import type { GuildMember } from "discord.js";
import { env } from "../lib/env";
import { logger as mainLogger } from "../lib/logger";
import {
  confirmVerification,
  getVerificationStatus,
  startVerification,
} from "../services/gamebanana-verification";

const logger = mainLogger.child().withContext({
  service: "verify-command",
});

export class VerifyCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("verify")
        .setDescription("Verify your GameBanana mod author identity")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("start")
            .setDescription("Start verifying your GameBanana account")
            .addStringOption((option) =>
              option
                .setName("gamebanana_profile")
                .setDescription(
                  "Your GameBanana member URL or ID (e.g. https://gamebanana.com/members/12345)",
                )
                .setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("confirm")
            .setDescription(
              "Confirm verification after adding the code to your GameBanana bio",
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("status")
            .setDescription("Check your current verification status"),
        ),
    );
  }

  override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case "start":
          return await this.handleStart(interaction);
        case "confirm":
          return await this.handleConfirm(interaction);
        case "status":
          return await this.handleStatus(interaction);
      }
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          userId: interaction.user.id,
          username: interaction.user.username,
          subcommand,
        })
        .error("Error in verify command");

      return interaction.reply({
        content: "An error occurred while processing the request.",
        ephemeral: true,
      });
    }
  }

  private async handleStart(interaction: Command.ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const profileInput = interaction.options.getString(
      "gamebanana_profile",
      true,
    );

    const result = await startVerification(
      interaction.user.id,
      interaction.user.username,
      profileInput,
    );

    switch (result.outcome) {
      case "member_not_found":
        return interaction.editReply({
          content:
            "Could not find a GameBanana member with that URL or ID. Please provide a valid GameBanana member profile URL (e.g. `https://gamebanana.com/members/12345`).",
        });

      case "already_verified":
        return interaction.editReply({
          content: `You are already verified as **${result.gamebananaUsername}** on GameBanana.`,
        });

      case "already_claimed":
        return interaction.editReply({
          content: `The GameBanana account **${result.gamebananaUsername}** is already verified by another Discord user.`,
        });

      case "auto_verified": {
        await this.grantVerifiedRole(interaction.member as GuildMember);
        return interaction.editReply({
          content: `Your Discord username matches the Discord contact info on the GameBanana profile for **${result.gamebananaUsername}**. You have been automatically verified!`,
        });
      }

      case "pending":
        return interaction.editReply({
          content: [
            `To verify you own the GameBanana account **${result.gamebananaUsername}**, please:`,
            "",
            `1. Go to your [GameBanana profile settings](https://gamebanana.com/members/account)`,
            `2. Add a custom **Bio** entry with the value: \`${result.verificationCode}\``,
            `3. Save your profile`,
            `4. Run \`/verify confirm\``,
            "",
            "The code expires in 30 minutes. You can remove the bio entry after verification.",
          ].join("\n"),
        });
    }
  }

  private async handleConfirm(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    await interaction.deferReply({ ephemeral: true });

    const result = await confirmVerification(interaction.user.id);

    switch (result.outcome) {
      case "no_pending":
        return interaction.editReply({
          content:
            "You don't have a pending verification. Run `/verify start` first.",
        });

      case "expired":
        return interaction.editReply({
          content:
            "Your verification code has expired. Please run `/verify start` again to get a new code.",
        });

      case "fetch_failed":
        return interaction.editReply({
          content:
            "Could not fetch your GameBanana profile. Please try again in a moment.",
        });

      case "code_not_found":
        return interaction.editReply({
          content:
            "Could not find the verification code in your GameBanana bio. Make sure you added it as a custom bio entry and saved your profile, then try again.",
        });

      case "verified": {
        await this.grantVerifiedRole(interaction.member as GuildMember);
        return interaction.editReply({
          content: `Successfully verified as **${result.gamebananaUsername}** on GameBanana! You can now remove the verification code from your bio.`,
        });
      }
    }
  }

  private async handleStatus(interaction: Command.ChatInputCommandInteraction) {
    const result = await getVerificationStatus(interaction.user.id);

    switch (result.outcome) {
      case "none":
        return interaction.reply({
          content:
            "You are not verified. Run `/verify start` to begin the process.",
          ephemeral: true,
        });

      case "pending":
        return interaction.reply({
          content: [
            `You have a pending verification for **${result.gamebananaUsername}**.`,
            `Code: \`${result.verificationCode}\``,
            `Expires: <t:${Math.floor(result.expiresAt.getTime() / 1000)}:R>`,
            "",
            "Add this code to your GameBanana bio, then run `/verify confirm`.",
          ].join("\n"),
          ephemeral: true,
        });

      case "verified":
        return interaction.reply({
          content: `You are verified as **${result.gamebananaUsername}** on GameBanana${result.verifiedAt ? ` (since <t:${Math.floor(result.verifiedAt.getTime() / 1000)}:D>)` : ""}.`,
          ephemeral: true,
        });
    }
  }

  private async grantVerifiedRole(member: GuildMember | null): Promise<void> {
    const roleId = env.VERIFIED_AUTHOR_ROLE_ID;
    if (!roleId || !member) return;

    try {
      if (!member.roles.cache.has(roleId)) {
        await member.roles.add(roleId);
        logger
          .withMetadata({
            userId: member.id,
            username: member.user.username,
            roleId,
          })
          .info("Granted verified author role");
      }
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({
          userId: member.id,
          roleId,
        })
        .error("Failed to grant verified author role");
    }
  }
}
