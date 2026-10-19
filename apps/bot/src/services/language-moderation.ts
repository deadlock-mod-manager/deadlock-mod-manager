import type { LanguageIdentifier } from "cld3-asm";
import type { LanguageModerationConfig } from "../config/language-moderation";
import { detectNonEnglishLanguage } from "../lib/language-detection";
import type { LanguageWarningStore } from "./language-warnings";

export interface LanguageModerationMessage {
  id: string;
  guildId: string;
  authorId: string;
  content: string;
  deletable: boolean;
  reply: (content: string) => Promise<void>;
  delete: () => Promise<void>;
}

export class LanguageModerationService {
  constructor(
    private readonly config: LanguageModerationConfig,
    private readonly detector: LanguageIdentifier,
    private readonly warnings: LanguageWarningStore,
  ) {}

  async moderate(message: LanguageModerationMessage) {
    const language = detectNonEnglishLanguage(this.detector, message.content);
    if (!language) return null;

    const { maxWarnings, windowMinutes } = this.config;
    const windowSeconds = windowMinutes * 60;
    const warningCount = await this.warnings.claimMessage(
      message.guildId,
      message.authorId,
      message.id,
      windowSeconds,
    );
    if (warningCount === null) return null;

    if (warningCount >= maxWarnings) {
      if (!message.deletable)
        return { action: "missing_delete_permission", language };
      await message.delete();
      return { action: "deleted", language };
    }

    await message.reply(
      `Please use English in this channel so everyone, including our moderators, can understand you. ` +
        `After ${maxWarnings} warnings within ${windowMinutes} minutes, further non-English messages will be deleted until the warning window expires.`,
    );
    // Only delivered warnings count toward deletion.
    await this.warnings.recordWarning(
      message.guildId,
      message.authorId,
      windowSeconds,
    );
    return { action: "warned", language };
  }
}
