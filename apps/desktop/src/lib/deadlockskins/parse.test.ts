import { describe, expect, test } from "bun:test";
import { AlbumDetailResponseSchema, AlbumListResponseSchema } from "./parse";

const album = {
  slug: "mann-co",
  title: "Mann Co.",
  description: "Team Fortress 2 mercs.",
  itemCount: 3,
  url: "https://deadlockskins.gg/albums/mann-co",
  coverUrl: "https://assets.deadlockskins.gg/album-covers/abc.webp",
  shareCardUrl: "https://assets.deadlockskins.gg/card/album-mann-co",
};

const item = (type: string, id: number, installUrl: string | null = null) => ({
  name: `${type} ${id}`,
  nsfw: false,
  url: `https://deadlockskins.gg/mods/${id}`,
  gameBanana: { type, id },
  installUrl,
});

describe("deadlockskins album API parsing", () => {
  test("maps the album list onto the card shape", () => {
    expect(
      AlbumListResponseSchema.parse({ version: 1, albums: [album] }),
    ).toEqual([
      {
        slug: "mann-co",
        name: "Mann Co.",
        description: "Team Fortress 2 mercs.",
        coverUrl: "https://assets.deadlockskins.gg/album-covers/abc.webp",
        itemCount: 3,
      },
    ]);
  });

  test("maps items to catalog slugs with the curator's file", () => {
    const { members } = AlbumDetailResponseSchema.parse({
      version: 1,
      album,
      items: [
        item(
          "mod",
          655808,
          "deadlock-mod-manager:https://gamebanana.com/mmdl/1804516,Mod,655808",
        ),
        item(
          "sound",
          7,
          "deadlock-mod-manager:https://gamebanana.com/mmdl/42,Sound,7",
        ),
      ],
    });
    expect(members).toEqual([
      { remoteId: "655808", fileId: "1804516" },
      { remoteId: "snd-7", fileId: "42" },
    ]);
  });

  test("keeps items without a 1-click link, leaving the file unpicked", () => {
    expect(
      AlbumDetailResponseSchema.parse({
        version: 1,
        album,
        items: [item("mod", 644152)],
      }).members,
    ).toEqual([{ remoteId: "644152" }]);
  });

  test("ignores 1-click links for another submission or host", () => {
    const { members } = AlbumDetailResponseSchema.parse({
      version: 1,
      album,
      items: [
        item(
          "mod",
          2,
          "deadlock-mod-manager:https://gamebanana.com/mmdl/1,Mod,3",
        ),
        item("mod", 5, "deadlock-mod-manager:https://evil.test/mmdl/4,Mod,5"),
        item(
          "mod",
          7,
          "deadlock-mod-manager:https://gamebanana.com/mmdl/6,Sound,7",
        ),
      ],
    });
    expect(members).toEqual([
      { remoteId: "2" },
      { remoteId: "5" },
      { remoteId: "7" },
    ]);
  });

  test("keeps album order and skips unsupported items", () => {
    const { members } = AlbumDetailResponseSchema.parse({
      version: 1,
      album,
      items: [
        item("mod", 655692),
        item("tool", 2),
        { name: "No GameBanana", gameBanana: null, installUrl: null },
        item("mod", 616541),
      ],
    });
    expect(members.map((member) => member.remoteId)).toEqual([
      "655692",
      "616541",
    ]);
  });
});
