import { describe, expect, it } from "vitest";
import { isAuthorContactUrl, parseGameBananaContacts } from "./author-contacts";

describe("parseGameBananaContacts", () => {
  it("normalises what authors actually type into GameBanana", () => {
    expect(
      parseGameBananaContacts([
        { title: "Discord", value: "flamingrug" },
        { title: "Discord", value: "@Yazanios" },
        { title: "Discord", value: "discord.gg/NwExmC7P5e" },
        { title: "STEAM", value: "https://steamcommunity.com/id/AmpSev/" },
        { title: "Twitter/X", value: "https://x.com/cataton1c__" },
        { title: "Twitter/X", value: "ModderMarbix" },
        { title: "Patreon", value: "patreon.com/Ahzealion" },
        { title: "YouTube", value: "https://youtube.com/@Sasha11711" },
        { title: "Buy Me a Coffee", value: "grelgn" },
      ]),
    ).toEqual([
      { type: "discord", value: "flamingrug", url: null },
      { type: "discord", value: "Yazanios", url: null },
      {
        type: "discord",
        value: "discord.gg/NwExmC7P5e",
        url: "https://discord.gg/NwExmC7P5e",
      },
      {
        type: "steam",
        value: "AmpSev",
        url: "https://steamcommunity.com/id/AmpSev/",
      },
      { type: "x", value: "cataton1c__", url: "https://x.com/cataton1c__" },
      { type: "x", value: "ModderMarbix", url: "https://x.com/ModderMarbix" },
      {
        type: "patreon",
        value: "Ahzealion",
        url: "https://patreon.com/Ahzealion",
      },
      {
        type: "youtube",
        value: "@Sasha11711",
        url: "https://youtube.com/@Sasha11711",
      },
      {
        type: "buymeacoffee",
        value: "grelgn",
        url: "https://buymeacoffee.com/grelgn",
      },
    ]);
  });

  it("drops unknown platforms, foreign hosts and free text", () => {
    expect(
      parseGameBananaContacts([
        { title: "Carrd", value: "someone.carrd.co" },
        { title: "Twitter/X", value: "https://evil.example/x.com" },
        { title: "YouTube", value: "kurenai_chi (main)" },
        { title: "Discord", value: "javascript:alert(1)" },
      ]),
    ).toEqual([]);
  });
});

describe("isAuthorContactUrl", () => {
  it("only accepts https links on the platform's own hosts", () => {
    expect(isAuthorContactUrl("x", "https://x.com/someone")).toBe(true);
    expect(isAuthorContactUrl("x", "http://x.com/someone")).toBe(false);
    expect(isAuthorContactUrl("x", "https://youtube.com/@someone")).toBe(false);
    expect(isAuthorContactUrl("discord", "https://discord.gg/abc")).toBe(true);
  });
});
