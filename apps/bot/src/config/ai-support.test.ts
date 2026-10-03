import { describe, expect, it } from "bun:test";
import { GatewayIntentBits } from "discord.js";
import { aiSupportEnabledSchema, getBotIntents } from "./ai-support";

describe("AI support configuration", () => {
  it("requires explicit opt-in instead of treating the string false as enabled", () => {
    expect(aiSupportEnabledSchema.parse(undefined)).toBe(false);
    expect(aiSupportEnabledSchema.parse("false")).toBe(false);
    expect(aiSupportEnabledSchema.parse("true")).toBe(true);
    expect(() => aiSupportEnabledSchema.parse("yes")).toThrow();
  });

  it("keeps non-AI events without requesting any privileged intents by default", () => {
    const intents = getBotIntents(aiSupportEnabledSchema.parse(undefined));
    expect(intents).toContain(GatewayIntentBits.Guilds);
    expect(intents).toContain(GatewayIntentBits.GuildMessages);
    expect(intents).not.toContain(GatewayIntentBits.GuildMembers);
    expect(intents).not.toContain(GatewayIntentBits.GuildPresences);
    expect(intents).not.toContain(GatewayIntentBits.MessageContent);
  });

  it("requests only Message Content when AI support is explicitly restored", () => {
    const intents = getBotIntents(aiSupportEnabledSchema.parse("true"));
    expect(intents).toContain(GatewayIntentBits.MessageContent);
    expect(intents).not.toContain(GatewayIntentBits.GuildMembers);
    expect(intents).not.toContain(GatewayIntentBits.GuildPresences);
  });
});
