import { describe, expect, it } from "vitest";
import {
  DeadworksRegistryResponseSchema,
  normalizeDeadworksRegistryServers,
} from "./deadworks-registry";

describe("parseDeadworksRegistryServers", () => {
  it("normalizes Deadworks registry servers for the DMM server browser", () => {
    const entries = normalizeDeadworksRegistryServers(
      DeadworksRegistryResponseSchema.parse({
        servers: [
          {
            id: "server-1",
            name: "Community Server",
            address: "137.74.4.159:27017",
            raw_address: "137.74.4.159:27017",
            country: "PL",
            player_count: 2,
            max_players: 25,
            map: "jump_control",
            players: [{ name: "Player One", hero: "Holliday", team: 2 }],
            content_addons: ["mog_cosmetics"],
            extra_maps: ["beginnings", "jump_control"],
            version: "1.0.0.0",
            last_heartbeat: "2026-08-02 16:58:31",
          },
        ],
      }),
      "https://api.deadworks.net/",
    );

    expect(entries).toEqual([
      {
        id: "server-1",
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
        version: "1.0.0.0",
        players: [
          {
            name: "Player One",
            hero: "Holliday",
            team: 2,
            kills: 0,
            deaths: 0,
            assists: 0,
            level: 0,
          },
        ],
        mods: [
          { name: "mog_cosmetics", version: "" },
          { name: "beginnings", version: "" },
          { name: "jump_control", version: "" },
        ],
        required_mods: [],
        last_seen: "2026-08-02T16:58:31.000Z",
        auth_required: false,
        auth_providers: [],
        source_relay: "https://api.deadworks.net",
        source_region: "pl",
      },
    ]);
  });

  it("drops entries without a usable connection address", () => {
    const entries = normalizeDeadworksRegistryServers(
      DeadworksRegistryResponseSchema.parse({
        servers: [
          {
            id: "invalid",
            name: "Invalid Server",
            address: "not-an-address",
            max_players: 12,
          },
        ],
      }),
      "https://api.deadworks.net",
    );

    expect(entries).toEqual([]);
  });

  it("supports bracketed IPv6 addresses", () => {
    const entries = normalizeDeadworksRegistryServers(
      DeadworksRegistryResponseSchema.parse({
        servers: [
          {
            id: "ipv6",
            name: "IPv6 Server",
            raw_address: "[2001:db8::1]:27015",
            max_players: 12,
          },
        ],
      }),
      "https://api.deadworks.net",
    );

    expect(entries[0]?.ip).toBe("2001:db8::1");
    expect(entries[0]?.port).toBe(27015);
  });
});
