import { describe, expect, test } from "bun:test";
import type { ServerPickerLocation } from "@/types/generated/ServerPickerLocation";
import {
  changeBlockedLocations,
  countPickerChanges,
  datacenterLocation,
  fastestAllowedLocation,
  groupPickerLocations,
  pickerRoutingStatus,
  recentMatchesByLocation,
} from "./server-picker";

const LOCATIONS: ServerPickerLocation[] = [
  {
    id: "fra",
    name: "Frankfurt",
    region: "europe",
    countryCode: "DE",
    relays: [],
  },
  {
    id: "ams",
    name: "Amsterdam",
    region: "europe",
    countryCode: "NL",
    relays: [],
  },
  { id: "par", name: "Paris", region: "europe", countryCode: "FR", relays: [] },
  {
    id: "iad",
    name: "Ashburn",
    region: "northAmerica",
    countryCode: "US",
    relays: [],
  },
];

describe("server picker observed routing", () => {
  test("unknown firewall observations never claim routing is restored", () => {
    expect(pickerRoutingStatus()).toBe("serverPicker.unverified");
    expect(
      pickerRoutingStatus({
        observationKnown: false,
        hasRestrictions: false,
        observedBlockedLocations: [],
      }),
    ).toBe("serverPicker.unverified");
  });

  test("partial and obsolete owned rules are still active restrictions", () => {
    expect(
      pickerRoutingStatus({
        observationKnown: true,
        hasRestrictions: true,
        observedBlockedLocations: [],
      }),
    ).toBe("serverPicker.partialRestrictions");
  });

  test("default routing requires verified absence of restrictions", () => {
    expect(
      pickerRoutingStatus({
        observationKnown: true,
        hasRestrictions: false,
        observedBlockedLocations: [],
      }),
    ).toBe("serverPicker.defaultRouting");
    expect(
      pickerRoutingStatus({
        observationKnown: true,
        hasRestrictions: true,
        observedBlockedLocations: ["fra"],
      }),
    ).toBe("serverPicker.activeBlocks");
  });
});

describe("server picker draft", () => {
  test("bulk changes preserve locations outside the visible group", () => {
    const baseline = ["iad", "retired"];
    const blocked = changeBlockedLocations(baseline, ["fra", "ams"], true);
    expect(blocked).toEqual(["ams", "fra", "iad", "retired"]);
    expect(changeBlockedLocations(blocked, ["fra"], false)).toEqual([
      "ams",
      "iad",
      "retired",
    ]);
    expect(baseline).toEqual(["iad", "retired"]);
  });

  test("counts both new blocks and removals without order or duplicate changes", () => {
    expect(countPickerChanges(["fra", "iad"], ["ams", "iad"])).toBe(2);
    expect(countPickerChanges(["fra", "iad"], ["iad", "fra", "fra"])).toBe(0);
    expect(
      countPickerChanges(
        ["fra"],
        changeBlockedLocations(["fra"], ["fra"], false),
      ),
    ).toBe(1);
  });
});

describe("server picker location discovery", () => {
  test("searches names, stable location ids, and country codes within the selected region", () => {
    expect(
      groupPickerLocations(
        LOCATIONS,
        "  fRa  ",
        "all",
        "name",
        [],
      )[0]?.locations.map((location) => location.id),
    ).toEqual(["fra"]);
    expect(
      groupPickerLocations(
        LOCATIONS,
        "nl",
        "europe",
        "name",
        [],
      )[0]?.locations.map((location) => location.id),
    ).toEqual(["ams"]);
    expect(
      groupPickerLocations(LOCATIONS, "ash", "europe", "name", []),
    ).toEqual([]);
  });

  test("sorts measured ping first, preserves zero latency, and leaves unavailable locations last", () => {
    const result = groupPickerLocations(LOCATIONS, "", "europe", "latency", [
      { locationId: "fra", latencyMs: 0, measuredAt: 100 },
      { locationId: "par", latencyMs: 24, measuredAt: 100 },
      { locationId: "ams", latencyMs: null, measuredAt: 100 },
    ]);
    expect(result[0]?.locations.map((location) => location.id)).toEqual([
      "fra",
      "par",
      "ams",
    ]);
    expect(LOCATIONS[0]?.id).toBe("fra");
  });
});

describe("server picker fastest allowed location", () => {
  test("skips blocked and unmeasured locations and keeps zero latency", () => {
    const latencies = [
      { locationId: "ams", latencyMs: 0, measuredAt: 1 },
      { locationId: "fra", latencyMs: 12, measuredAt: 1 },
      { locationId: "par", latencyMs: null, measuredAt: 1 },
      { locationId: "iad", latencyMs: 90, measuredAt: 1 },
    ];
    expect(
      fastestAllowedLocation(LOCATIONS, new Set(), latencies)?.location.id,
    ).toBe("ams");
    expect(
      fastestAllowedLocation(LOCATIONS, new Set(["ams", "fra"]), latencies)
        ?.location.id,
    ).toBe("iad");
    expect(
      fastestAllowedLocation(
        LOCATIONS,
        new Set(["ams", "fra", "iad"]),
        latencies,
      ),
    ).toBeNull();
  });
});

describe("datacenterLocation", () => {
  const ids = new Set(["fra", "dfra", "hel", "sto", "sto2", "ord"]);

  test("maps deadlock-api datacenter codes to SDR POP ids", () => {
    expect(datacenterLocation("fra2", ids)).toBe("fra");
    expect(datacenterLocation("fra-dpkt", ids)).toBe("dfra");
    expect(datacenterLocation("hel-hetz", ids)).toBe("hel");
    expect(datacenterLocation("sto1", ids)).toBe("sto");
    expect(datacenterLocation("sto2", ids)).toBe("sto2");
    expect(datacenterLocation("ord1,ord2", ids)).toBe("ord");
    expect(datacenterLocation("xyz9", ids)).toBeNull();
  });
});

const month = (m: number) => Date.UTC(2026, m, 1) / 1000;

describe("recentMatchesByLocation", () => {
  test("sums matches per location within the recent months only", () => {
    const counts = recentMatchesByLocation(
      [
        { month: month(10), datacenter: "fra2", matches: 3 },
        { month: month(9), datacenter: "fra-dpkt", matches: 2 },
        { month: month(8), datacenter: "fra1", matches: 4 },
        { month: month(7), datacenter: "fra2", matches: 50 },
        { month: month(10), datacenter: null, matches: 9 },
      ],
      LOCATIONS,
      new Date(Date.UTC(2026, 10, 10)),
    );
    expect([...counts]).toEqual([["fra", 7]]);
  });
});
