import { GatewayIntentBits } from "discord.js";
import { z } from "zod";

export const aiSupportEnabledSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

export function getBotIntents(
  aiSupportEnabled: boolean,
  languageModerationEnabled = false,
): GatewayIntentBits[] {
  return [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    ...(aiSupportEnabled || languageModerationEnabled
      ? [GatewayIntentBits.MessageContent]
      : []),
  ];
}
