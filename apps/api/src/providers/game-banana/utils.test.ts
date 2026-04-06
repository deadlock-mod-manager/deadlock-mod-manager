import { describe, expect, it } from "bun:test";
import { extractMapName } from "./utils";

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
