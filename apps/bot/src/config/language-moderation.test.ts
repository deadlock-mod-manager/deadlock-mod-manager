import { describe, expect, it } from "bun:test";
import {
  isLanguageModerationChannel,
  languageModerationEnvSchema,
  type LanguageModerationConfig,
} from "./language-moderation";

const config: LanguageModerationConfig = {
  enabled: true,
  guildId: "1",
  channelIds: ["10"],
  ignoredChannelIds: ["12"],
  maxWarnings: 3,
  windowMinutes: 30,
};

describe("language moderation configuration", () => {
  it("defaults to disabled and parses false explicitly", () => {
    expect(
      languageModerationEnvSchema.parse({}).LANGUAGE_MODERATION_ENABLED,
    ).toBe(false);
    expect(
      languageModerationEnvSchema.parse({
        LANGUAGE_MODERATION_ENABLED: "false",
      }).LANGUAGE_MODERATION_ENABLED,
    ).toBe(false);
    expect(() =>
      languageModerationEnvSchema.parse({ LANGUAGE_MODERATION_ENABLED: "yes" }),
    ).toThrow();
  });

  it("parses channel lists and rejects invalid limits and IDs", () => {
    expect(
      languageModerationEnvSchema.parse({
        LANGUAGE_MODERATION_CHANNEL_IDS: " 10, 11, ",
      }).LANGUAGE_MODERATION_CHANNEL_IDS,
    ).toEqual(["10", "11"]);
    for (const value of [0, -1, 1.5, 11]) {
      expect(() =>
        languageModerationEnvSchema.parse({
          LANGUAGE_MODERATION_MAX_WARNINGS: value,
        }),
      ).toThrow();
    }
    expect(() =>
      languageModerationEnvSchema.parse({
        LANGUAGE_MODERATION_WINDOW_MINUTES: 0,
      }),
    ).toThrow();
    expect(() =>
      languageModerationEnvSchema.parse({
        LANGUAGE_MODERATION_CHANNEL_IDS: "general",
      }),
    ).toThrow();
  });

  it("only watches configured channels and their threads in the configured guild", () => {
    expect(isLanguageModerationChannel(config, "1", "10", null)).toBe(true);
    expect(isLanguageModerationChannel(config, "1", "11", "10")).toBe(true);
    expect(isLanguageModerationChannel(config, "1", "20", null)).toBe(false);
    expect(isLanguageModerationChannel(config, "2", "10", null)).toBe(false);
    expect(isLanguageModerationChannel(config, null, "10", null)).toBe(false);
    expect(
      isLanguageModerationChannel(
        { ...config, enabled: false },
        "1",
        "10",
        null,
      ),
    ).toBe(false);
  });

  it("lets exclusions override watched channels and threads", () => {
    expect(isLanguageModerationChannel(config, "1", "12", "10")).toBe(false);
    expect(
      isLanguageModerationChannel(
        { ...config, channelIds: ["11"], ignoredChannelIds: ["10"] },
        "1",
        "11",
        "10",
      ),
    ).toBe(false);
  });
});
