import { describe, expect, test } from "bun:test";
import { parseAlbumMembers, parseDmmUrl } from "./parse";

describe("deadlockskins album parsing", () => {
  test("maps 1-click links to catalog slugs", () => {
    expect(
      parseDmmUrl(
        "deadlock-mod-manager:https://gamebanana.com/mmdl/1804516,Mod,655808",
      ),
    ).toEqual({ remoteId: "655808", fileId: "1804516" });
    expect(
      parseDmmUrl(
        "deadlock-mod-manager:https://gamebanana.com/mmdl/42,Sound,7",
      ),
    ).toEqual({ remoteId: "snd-7", fileId: "42" });
  });

  test("rejects other hosts, item types, and schemes", () => {
    expect(
      parseDmmUrl("deadlock-mod-manager:https://evil.test/mmdl/1,Mod,2"),
    ).toBeNull();
    expect(
      parseDmmUrl("deadlock-mod-manager:https://gamebanana.com/mmdl/1,Tool,2"),
    ).toBeNull();
    expect(
      parseDmmUrl("grimoire:https://gamebanana.com/mmdl/1,Mod,2"),
    ).toBeNull();
  });

  test("keeps album order and skips unsupported links", () => {
    const json = JSON.stringify([
      {
        name: "Pyro TF2 Infernus",
        dmmUrl:
          "deadlock-mod-manager:https://gamebanana.com/mmdl/1671980,Mod,655692",
      },
      {
        name: "A tool",
        dmmUrl: "deadlock-mod-manager:https://gamebanana.com/mmdl/1,Tool,2",
      },
      {
        dmmUrl:
          "deadlock-mod-manager:https://gamebanana.com/mmdl/1647796,Mod,616541",
      },
    ]);

    expect(parseAlbumMembers(json)).toEqual([
      { remoteId: "655692", fileId: "1671980" },
      { remoteId: "616541", fileId: "1647796" },
    ]);
  });
});
