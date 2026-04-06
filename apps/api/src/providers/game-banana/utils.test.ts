import { describe, expect, it } from "bun:test";
import type { GameBanana } from "@deadlock-mods/shared";
import {
  buildDonationLinks,
  buildMetadata,
  donationLinksFromMethods,
  extractDonationLinksFromDescription,
  extractMapName,
} from "./utils";

describe("extractMapName", () => {
  it("returns undefined for empty description", () => {
    expect(extractMapName("")).toBeUndefined();
  });

  it("returns undefined for description without map command", () => {
    expect(
      extractMapName("This is a cool mod with custom skins."),
    ).toBeUndefined();
  });

  it("extracts map name from quoted context", () => {
    expect(
      extractMapName(
        'open the console with f7 and type "map movementmap" and press enter',
      ),
    ).toBe("movementmap");
  });

  it("extracts map name from single-quoted context", () => {
    expect(extractMapName("In console type 'map jump_school' to load")).toBe(
      "jump_school",
    );
  });

  it("extracts map name from backtick context", () => {
    expect(extractMapName("Type the command: `map deadrun`")).toBe("deadrun");
  });

  it("extracts map name from HTML tag context (after >)", () => {
    expect(
      extractMapName('<span class="GreenColor">map soccer_stadium</span>'),
    ).toBe("soccer_stadium");
  });

  it("extracts map name from bare context", () => {
    expect(
      extractMapName(
        "f7 to open the console and type map ns_mindscape select any hero",
      ),
    ).toBe("ns_mindscape");
  });

  it("extracts map name with prefix (dl_)", () => {
    expect(extractMapName('type "map dl_express" and press enter')).toBe(
      "dl_express",
    );
  });

  it("extracts map name from HTML command instruction", () => {
    expect(
      extractMapName("Join the map using the command: <u>map streetball</u>"),
    ).toBe("streetball");
  });

  it("extracts from real GameBanana description: Movement Map", () => {
    const desc =
      "Launch your game, press F7, and type map movementmap</code>,</span></li></ol>";
    expect(extractMapName(desc)).toBe("movementmap");
  });

  it("extracts from real GameBanana description: Jump School", () => {
    const desc =
      'Install mod with Deadlock Mod Manager<br>- With dev console type "<b>map jump_school</b>"';
    expect(extractMapName(desc)).toBe("jump_school");
  });

  it("extracts from real GameBanana description: Street ball", () => {
    const desc = "2) Join the map using the command: <u>map streetball</u><br>";
    expect(extractMapName(desc)).toBe("streetball");
  });

  it("extracts from real GameBanana description: Soccer Stadium", () => {
    const desc = 'Type in <span class="GreenColor">"Map soccer_stadium"</span>';
    expect(extractMapName(desc)).toBe("soccer_stadium");
  });

  it("extracts from real GameBanana description: Mindscape", () => {
    const desc =
      "f7 to open the console and type map ns_mindscape <br>select any hero";
    expect(extractMapName(desc)).toBe("ns_mindscape");
  });

  it("extracts from real GameBanana description: Deadrun", () => {
    const desc =
      "Open the console (`~`).</li><li>Type the command: `map deadrun`</li>";
    expect(extractMapName(desc)).toBe("deadrun");
  });

  it("extracts from real GameBanana description: dl_express", () => {
    const desc =
      'open the console with f7 and type "map dl_express" and press enter.';
    expect(extractMapName(desc)).toBe("dl_express");
  });

  it("filters out common English words after 'map'", () => {
    expect(
      extractMapName("this map features various obstacles"),
    ).toBeUndefined();
    expect(extractMapName("the map includes custom lighting")).toBeUndefined();
    expect(extractMapName("a map created for practice")).toBeUndefined();
    expect(extractMapName("map currently has some bugs")).toBeUndefined();
    expect(extractMapName("map loading times improved")).toBeUndefined();
  });

  it("filters out 'map queue' (common false positive)", () => {
    expect(
      extractMapName("map queue<br><br>leave suggestions"),
    ).toBeUndefined();
  });

  it("ignores map names shorter than 3 characters", () => {
    expect(extractMapName('type "map ab"')).toBeUndefined();
  });

  it("prefers quoted match over bare match", () => {
    const desc =
      'this map features cool stuff, type "map real_map_name" to play';
    expect(extractMapName(desc)).toBe("real_map_name");
  });

  it("handles &quot; HTML entity as quote context", () => {
    expect(extractMapName("type &quot;map test_arena&quot; in console")).toBe(
      "test_arena",
    );
  });

  it("handles mixed case in map command (case insensitive matching)", () => {
    expect(extractMapName('type "Map MyCustomMap" in console')).toBe(
      "mycustommap",
    );
  });

  it("returns the first valid match when multiple exist", () => {
    const desc = 'type "map first_map" or "map second_map" to choose';
    expect(extractMapName(desc)).toBe("first_map");
  });
});

const kofiMethod: GameBanana.GameBananaDonationMethod = {
  _sTitle: "Ko-fi Profile",
  _sCustomTitle: "",
  _sValue: "https://ko-fi.com/pinkcrackshot",
  _bIsUrl: true,
  _sIconClasses: "MiscIcon KofiIcon",
};

describe("donationLinksFromMethods", () => {
  it("returns empty array for empty methods", () => {
    expect(donationLinksFromMethods([])).toEqual([]);
  });

  it("returns empty array for non-array input", () => {
    expect(donationLinksFromMethods(null as never)).toEqual([]);
  });

  it("maps a Ko-fi donation method", () => {
    expect(donationLinksFromMethods([kofiMethod])).toEqual([
      { url: "https://ko-fi.com/pinkcrackshot", platform: "Ko-fi" },
    ]);
  });

  it("skips entries where _bIsUrl is false", () => {
    const method = { ...kofiMethod, _bIsUrl: false };
    expect(donationLinksFromMethods([method])).toEqual([]);
  });

  it("skips entries with empty _sValue", () => {
    const method = { ...kofiMethod, _sValue: "" };
    expect(donationLinksFromMethods([method])).toEqual([]);
  });

  it("skips entries with non-allowlisted hosts", () => {
    const method = {
      ...kofiMethod,
      _sValue: "https://example.com/donate",
    };
    expect(donationLinksFromMethods([method])).toEqual([]);
  });

  it("maps Patreon donation method", () => {
    const method: GameBanana.GameBananaDonationMethod = {
      ...kofiMethod,
      _sTitle: "Patreon Page",
      _sValue: "https://www.patreon.com/someauthor",
    };
    expect(donationLinksFromMethods([method])).toEqual([
      { url: "https://www.patreon.com/someauthor", platform: "Patreon" },
    ]);
  });

  it("maps Buy Me a Coffee donation method", () => {
    const method: GameBanana.GameBananaDonationMethod = {
      ...kofiMethod,
      _sTitle: "Buy Me a Coffee",
      _sValue: "https://buymeacoffee.com/grelgn",
    };
    expect(donationLinksFromMethods([method])).toEqual([
      {
        url: "https://buymeacoffee.com/grelgn",
        platform: "Buy Me a Coffee",
      },
    ]);
  });

  it("allows GitHub Sponsors path", () => {
    const method: GameBanana.GameBananaDonationMethod = {
      ...kofiMethod,
      _sTitle: "GitHub Sponsors",
      _sValue: "https://github.com/sponsors/someuser",
    };
    expect(donationLinksFromMethods([method])).toEqual([
      {
        url: "https://github.com/sponsors/someuser",
        platform: "GitHub Sponsors",
      },
    ]);
  });

  it("rejects non-sponsors GitHub links", () => {
    const method: GameBanana.GameBananaDonationMethod = {
      ...kofiMethod,
      _sTitle: "GitHub Repo",
      _sValue: "https://github.com/someuser/somerepo",
    };
    expect(donationLinksFromMethods([method])).toEqual([]);
  });
});

describe("extractDonationLinksFromDescription", () => {
  it("returns empty for empty description", () => {
    expect(extractDonationLinksFromDescription("")).toEqual([]);
  });

  it("extracts a bare Ko-fi URL", () => {
    const desc = "support me at https://ko-fi.com/pinkcrackshot or click here";
    expect(extractDonationLinksFromDescription(desc)).toEqual([
      { url: "https://ko-fi.com/pinkcrackshot", platform: "Ko-fi" },
    ]);
  });

  it("extracts URL from HTML <a> tag", () => {
    const desc = '<a href="https://ko-fi.com/accursedvagabond">Support me</a>';
    expect(extractDonationLinksFromDescription(desc)).toEqual([
      { url: "https://ko-fi.com/accursedvagabond", platform: "Ko-fi" },
    ]);
  });

  it("strips trailing HTML junk", () => {
    const desc = 'Visit https://ko-fi.com/pinkcrackshot">click here</a>';
    const result = extractDonationLinksFromDescription(desc);
    expect(result).toEqual([
      { url: "https://ko-fi.com/pinkcrackshot", platform: "Ko-fi" },
    ]);
  });

  it("strips trailing punctuation", () => {
    const desc = "Check out https://patreon.com/someauthor.";
    const result = extractDonationLinksFromDescription(desc);
    expect(result).toEqual([
      { url: "https://patreon.com/someauthor", platform: "Patreon" },
    ]);
  });

  it("deduplicates identical URLs", () => {
    const desc = "https://ko-fi.com/foo and again https://ko-fi.com/foo please";
    const result = extractDonationLinksFromDescription(desc);
    expect(result).toHaveLength(1);
  });

  it("ignores non-donation URLs", () => {
    const desc =
      "https://www.youtube.com/watch?v=123 and https://discord.gg/abc";
    expect(extractDonationLinksFromDescription(desc)).toEqual([]);
  });

  it("extracts Patreon with www prefix", () => {
    const desc = "Support at https://www.patreon.com/posts/somepost";
    expect(extractDonationLinksFromDescription(desc)).toEqual([
      {
        url: "https://www.patreon.com/posts/somepost",
        platform: "Patreon",
      },
    ]);
  });

  it("extracts multiple different donation URLs", () => {
    const desc =
      "https://ko-fi.com/foo and https://patreon.com/bar for support";
    const result = extractDonationLinksFromDescription(desc);
    expect(result).toHaveLength(2);
    expect(result[0].platform).toBe("Ko-fi");
    expect(result[1].platform).toBe("Patreon");
  });

  it("only allows github.com for /sponsors paths", () => {
    const desc =
      "https://github.com/user/repo and https://github.com/sponsors/user";
    const result = extractDonationLinksFromDescription(desc);
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe("GitHub Sponsors");
  });
});

describe("buildDonationLinks", () => {
  it("returns empty array when no links found", () => {
    expect(
      buildDonationLinks({
        methods: [],
        description: "No donation links here.",
      }),
    ).toEqual([]);
  });

  it("merges API methods and description, API first", () => {
    const result = buildDonationLinks({
      methods: [kofiMethod],
      description: "Also at https://patreon.com/someone",
    });
    expect(result).toHaveLength(2);
    expect(result[0].platform).toBe("Ko-fi");
    expect(result[1].platform).toBe("Patreon");
  });

  it("deduplicates when same URL in methods and description", () => {
    const result = buildDonationLinks({
      methods: [kofiMethod],
      description:
        "Support me at https://ko-fi.com/pinkcrackshot or click here",
    });
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://ko-fi.com/pinkcrackshot");
  });
});

describe("buildMetadata", () => {
  it("returns null when no metadata fields are populated", () => {
    expect(
      buildMetadata({
        description: "Nothing useful here.",
        isMap: false,
        donationMethods: [],
      }),
    ).toBeNull();
  });

  it("returns mapName when isMap is true", () => {
    const result = buildMetadata({
      description: 'type "map my_arena" to play',
      isMap: true,
      donationMethods: [],
    });
    expect(result).toEqual({ mapName: "my_arena" });
  });

  it("returns donationLinks when present", () => {
    const result = buildMetadata({
      description: "No map here.",
      isMap: false,
      donationMethods: [kofiMethod],
    });
    expect(result?.donationLinks).toHaveLength(1);
    expect(result?.donationLinks?.[0].platform).toBe("Ko-fi");
    expect(result?.mapName).toBeUndefined();
  });

  it("returns both mapName and donationLinks when applicable", () => {
    const result = buildMetadata({
      description: 'type "map my_arena" to play',
      isMap: true,
      donationMethods: [kofiMethod],
    });
    expect(result?.mapName).toBe("my_arena");
    expect(result?.donationLinks).toHaveLength(1);
  });
});
