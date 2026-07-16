import type {
  QuickAnswerAsset,
  QuickAnswerTemplate,
} from "@deadlock-mods/database";
import { EmbedBuilder } from "discord.js";

const DMM_EMBED_COLOR = 0x66c0f4;

export function buildQuickAnswerEmbed(
  template: QuickAnswerTemplate,
  assets: readonly QuickAnswerAsset[],
  logoUrl: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(DMM_EMBED_COLOR)
    .setTitle(template.title)
    .setDescription(template.body)
    .setFooter({ text: "Deadlock Mod Manager", iconURL: logoUrl });

  const firstImage = assets.find((asset) => asset.kind === "image");
  if (firstImage) {
    embed.setImage(`attachment://${firstImage.filename}`);
  }

  return embed;
}
