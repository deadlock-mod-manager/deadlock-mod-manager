import { describe, expect, mock, test } from "bun:test";
import { fetchGameBananaMember } from "./gamebanana-member";

describe("fetchGameBananaMember", () => {
  test("accepts empty optional media returned by GameBanana", async () => {
    const fetcher = mock(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.includes("/Mod/Index")) {
        return new Response(
          JSON.stringify({
            _aRecords: [{ _aSubmitter: { _idRow: 4_577_138 } }],
          }),
        );
      }
      return new Response(
        JSON.stringify({
          _idRow: 4_577_138,
          _sName: "Hanturaya",
          _sProfileUrl: "https://gamebanana.com/members/4577138",
          _sAvatarUrl: "https://images.gamebanana.com/avatar.jpg",
          _sSigUrl: "",
          _sUserTitle: "Bananite",
          _tsJoinDate: 1_750_301_063,
          _nSubscriberCount: 64,
          _bIsPrivate: false,
          _bIsBanned: false,
        }),
      );
    });

    const result = await fetchGameBananaMember("4577138", fetcher);

    expect(result).toMatchObject({
      provider: "gamebanana",
      remoteId: "4577138",
      name: "Hanturaya",
      signatureUrl: null,
    });
  });

  test("rejects members without Deadlock submissions", async () => {
    const fetcher = mock(
      async () => new Response(JSON.stringify({ _aRecords: [] })),
    );

    const result = await fetchGameBananaMember("4577138", fetcher);

    expect(result).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
