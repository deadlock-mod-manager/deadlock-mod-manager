import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  DeadworksRegistryResponseSchema,
  DeadworksSteamResponseSchema,
  normalizeDeadworksServers,
} from "./deadworks-registry";

const SOURCE = "https://api.deadworks.net/";
const FETCHED_AT = new Date("2026-10-20T08:00:00.000Z");

type SteamServerInput = z.input<
  typeof DeadworksSteamResponseSchema
>["servers"][number];

const steam = (servers: SteamServerInput[]) =>
  DeadworksSteamResponseSchema.parse({ servers });

const steamServer = (
  overrides: Partial<SteamServerInput> = {},
): SteamServerInput => ({
  addr: "137.74.4.159:27017",
  gameport: 27017,
  steamid: "90295300122267656",
  name: "Community Server",
  players: 2,
  max_players: 25,
  map: "jump_control",
  gametype: "empty,dw1,dwacc6a3224,insecure",
  ...overrides,
});

describe("normalizeDeadworksServers", () => {
  it("enriches Steam records with the registry entry at the same address", () => {
    const entries = normalizeDeadworksServers(
      steam([steamServer()]),
      DeadworksRegistryResponseSchema.parse({
        servers: [
          {
            id: "server-1",
            name: "Registry Name",
            raw_address: "137.74.4.159:27017",
            country: "PL",
            max_players: 25,
            content_addons: ["mog_cosmetics"],
            extra_maps: ["jump_control"],
            version: "v0.6.1",
            last_heartbeat: "2026-08-02 16:58:31",
          },
        ],
      }),
      SOURCE,
      FETCHED_AT,
    );

    expect(entries).toEqual([
      {
        id: "90295300122267656",
        name: "Community Server",
        ip: "137.74.4.159",
        port: 27017,
        visibility: "public",
        password_protected: false,
        connect_code: "137.74.4.159:27017",
        gateway_url: "",
        player_count: 2,
        max_players: 25,
        map: "jump_control",
        game_mode: "",
        version: "0.6.1",
        players: [],
        mods: [
          { name: "mog_cosmetics", version: "" },
          { name: "jump_control", version: "" },
        ],
        required_mods: [],
        last_seen: "2026-08-02T16:58:31.000Z",
        auth_required: false,
        auth_providers: [],
        source_relay: "https://api.deadworks.net",
        source_region: "pl",
        managed_content: true,
      },
    ]);
  });

  it("keeps unregistered servers without registry details", () => {
    const [entry] = normalizeDeadworksServers(
      steam([steamServer()]),
      null,
      SOURCE,
      FETCHED_AT,
    );

    expect(entry?.source_region).toBeUndefined();
    expect(entry?.version).toBe("");
    expect(entry?.last_seen).toBe(FETCHED_AT.toISOString());
  });

  it("matches whole tags and drops unlisted or non-Deadworks servers", () => {
    const entries = normalizeDeadworksServers(
      steam([
        steamServer({ steamid: "listed" }),
        steamServer({ steamid: "unlisted", gametype: "dw1,dwu" }),
        steamServer({ steamid: "lookalike", gametype: "dw10,xdw1" }),
      ]),
      null,
      SOURCE,
      FETCHED_AT,
    );

    expect(entries.map((entry) => entry.id)).toEqual(["listed"]);
  });

  it("drops records without a usable address", () => {
    const entries = normalizeDeadworksServers(
      steam([steamServer({ addr: "not-an-address" })]),
      null,
      SOURCE,
      FETCHED_AT,
    );

    expect(entries).toEqual([]);
  });
});
