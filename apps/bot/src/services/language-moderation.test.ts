import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { LanguageIdentifier } from "cld3-asm";
import type { LanguageModerationConfig } from "../config/language-moderation";
import {
  createLanguageDetector,
  detectNonEnglishLanguage,
  getLanguageDetectionText,
} from "../lib/language-detection";
import {
  LanguageModerationService,
  type LanguageModerationMessage,
} from "./language-moderation";
import type { LanguageWarningStore } from "./language-warnings";

let detector: LanguageIdentifier;
beforeAll(async () => {
  detector = await createLanguageDetector();
});
afterAll(() => {
  detector.dispose();
});

const french = "Je ne peux pas installer ce mod, quelqu’un peut m’aider ?";
const config: LanguageModerationConfig = {
  enabled: true,
  guildId: "guild",
  channelIds: ["channel"],
  ignoredChannelIds: [],
  maxWarnings: 3,
  windowMinutes: 30,
};

class MemoryWarningStore implements LanguageWarningStore {
  now = 0;
  private warnings = new Map<string, { count: number; expires: number }>();
  private messages = new Set<string>();

  async claimMessage(guildId: string, userId: string, messageId: string) {
    if (this.messages.has(messageId)) return null;
    this.messages.add(messageId);
    const entry = this.warnings.get(`${guildId}:${userId}`);
    return entry && entry.expires > this.now ? entry.count : 0;
  }

  async recordWarning(guildId: string, userId: string, windowSeconds: number) {
    const key = `${guildId}:${userId}`;
    const entry = this.warnings.get(key);
    this.warnings.set(
      key,
      entry && entry.expires > this.now
        ? { ...entry, count: entry.count + 1 }
        : { count: 1, expires: this.now + windowSeconds },
    );
  }
}

function setup() {
  const store = new MemoryWarningStore();
  const service = new LanguageModerationService(config, detector, store);
  const replies: string[] = [];
  const deletions: string[] = [];
  function message(
    id: string,
    overrides: Partial<LanguageModerationMessage> = {},
  ): LanguageModerationMessage {
    return {
      id,
      guildId: "guild",
      authorId: "user",
      content: french,
      deletable: true,
      reply: async (content) => {
        replies.push(content);
      },
      delete: async () => {
        deletions.push(id);
      },
      ...overrides,
    };
  }
  return { store, service, replies, deletions, message };
}

describe("local language detection", () => {
  it("recognizes non-English sentences across scripts", () => {
    for (const [text, language] of [
      [french, "fr"],
      ["No puedo instalar este mod, alguien puede ayudarme?", "es"],
      ["Я не могу установить этот мод, пожалуйста помогите мне.", "ru"],
      ["这个模组无法安装，有人可以帮我解决这个问题吗？", "zh"],
    ]) {
      expect(detectNonEnglishLanguage(detector, text!)).toBe(language!);
    }
  });

  it("leaves English, brief messages, and content without prose alone", () => {
    for (const text of [
      "I cannot install this mod, can someone please help me?",
      "my mod isnt working idk why pls help",
      "the vpk doesnt work after the update lol",
      "bonjour",
      "привет",
      "你好",
      "Haze Vindicta",
      "gg wp",
      "1234567890",
      "<@123456789> <:bonjourbonjourbonjour:123456789>",
      "https://example.com/bonjour-comment-allez-vous",
      "```Je ne peux pas installer ce mod, quelqu’un peut m’aider ?```",
      "> Je ne peux pas installer ce mod, quelqu’un peut m’aider ?",
    ])
      expect(detectNonEnglishLanguage(detector, text)).toBeNull();
  });

  it("does not classify quoted or technical text as part of English prose", () => {
    const content = `> ${french}\nI cannot install this mod, can someone please help me? \`bonjour\``;
    expect(getLanguageDetectionText(content)).toBe(
      "I cannot install this mod, can someone please help me?",
    );
    expect(detectNonEnglishLanguage(detector, content)).toBeNull();
    expect(
      getLanguageDetectionText("```unclosed code block with lots of words"),
    ).toBe("");
  });

  it("skips unreliable detections", () => {
    const uncertain: LanguageIdentifier = {
      findLanguage: () => ({
        ...detector.findLanguage(french),
        probability: 0.5,
        is_reliable: false,
      }),
      findMostFrequentLanguages: () => [],
      dispose: () => {},
    };
    expect(detectNonEnglishLanguage(uncertain, french)).toBeNull();
  });
});

describe("English-only moderation", () => {
  it("delivers three warnings and deletes subsequent messages", async () => {
    const { service, replies, deletions, message } = setup();
    for (const id of ["1", "2", "3"]) {
      expect(await service.moderate(message(id))).toMatchObject({
        action: "warned",
      });
    }
    expect(replies).toHaveLength(3);
    expect(replies[0]).toContain("Please use English");
    expect(deletions).toHaveLength(0);
    expect(await service.moderate(message("4"))).toMatchObject({
      action: "deleted",
    });
    expect(await service.moderate(message("5"))).toMatchObject({
      action: "deleted",
    });
    expect(deletions).toEqual(["4", "5"]);
    expect(replies).toHaveLength(3);
  });

  it("resets the fixed warning window without extending it for new warnings", async () => {
    const { store, service, message } = setup();
    await service.moderate(message("1"));
    store.now = 1000;
    await service.moderate(message("2"));
    await service.moderate(message("3"));
    store.now = 1800;
    expect(await service.moderate(message("4"))).toMatchObject({
      action: "warned",
    });
  });

  it("isolates warning counts by user and guild and deduplicates message delivery", async () => {
    const { service, replies, message } = setup();
    await service.moderate(message("1"));
    expect(await service.moderate(message("1"))).toBeNull();
    expect(replies).toHaveLength(1);
    await service.moderate(message("2"));
    await service.moderate(message("3"));
    expect(
      await service.moderate(message("4", { authorId: "another-user" })),
    ).toMatchObject({ action: "warned" });
    expect(
      await service.moderate(message("5", { guildId: "another-guild" })),
    ).toMatchObject({ action: "warned" });
  });

  it("does not count failed warnings", async () => {
    const { service, message } = setup();
    await expect(
      service.moderate(
        message("1", {
          reply: async () => {
            throw new Error("Missing permission");
          },
        }),
      ),
    ).rejects.toThrow();
    for (const id of ["2", "3", "4"]) {
      expect(await service.moderate(message(id))).toMatchObject({
        action: "warned",
      });
    }
  });

  it("never warns or deletes English messages even after the warning limit", async () => {
    const { service, replies, deletions, message } = setup();
    for (const id of ["1", "2", "3"]) await service.moderate(message(id));
    expect(
      await service.moderate(
        message("4", {
          content: "I would like some help installing this mod please.",
        }),
      ),
    ).toBeNull();
    expect(replies).toHaveLength(3);
    expect(deletions).toHaveLength(0);
  });

  it("leaves messages intact when deletion is unavailable", async () => {
    const { service, deletions, message } = setup();
    for (const id of ["1", "2", "3"]) await service.moderate(message(id));
    expect(
      await service.moderate(message("4", { deletable: false })),
    ).toMatchObject({ action: "missing_delete_permission" });
    expect(deletions).toHaveLength(0);
  });

  it("leaves messages intact if the warning store fails", async () => {
    const { message, replies, deletions } = setup();
    const unavailableStore: LanguageWarningStore = {
      claimMessage: async () => {
        throw new Error("Redis unavailable");
      },
      recordWarning: async () => {},
    };
    const service = new LanguageModerationService(
      config,
      detector,
      unavailableStore,
    );
    await expect(service.moderate(message("1"))).rejects.toThrow(
      "Redis unavailable",
    );
    expect(replies).toHaveLength(0);
    expect(deletions).toHaveLength(0);
  });
});
