import { describe, expect, it } from "bun:test";
import { deriveGameConfigAlert } from "./game-update";

const base = {
  buildId: 100,
  knownBuildId: 100,
  hasModPaths: true,
  enabledModsCount: 3,
  lastLaunchVanilla: false,
};

describe("deriveGameConfigAlert", () => {
  it("stays quiet when mods are wired up and the build is known", () => {
    expect(deriveGameConfigAlert(base)).toBeNull();
  });

  it("flags a Steam update that reset gameinfo.gi", () => {
    expect(
      deriveGameConfigAlert({ ...base, buildId: 101, hasModPaths: false }),
    ).toEqual({ modsDetached: true, gameUpdated: true });
  });

  it("flags an external rewrite without an update", () => {
    expect(deriveGameConfigAlert({ ...base, hasModPaths: false })).toEqual({
      modsDetached: true,
      gameUpdated: false,
    });
  });

  it("treats missing search paths after a vanilla launch as intended", () => {
    expect(
      deriveGameConfigAlert({
        ...base,
        hasModPaths: false,
        lastLaunchVanilla: true,
      }),
    ).toBeNull();
  });

  it("still flags a vanilla-launch user once Steam updates the game", () => {
    expect(
      deriveGameConfigAlert({
        ...base,
        buildId: 101,
        hasModPaths: false,
        lastLaunchVanilla: true,
      }),
    ).toEqual({ modsDetached: true, gameUpdated: true });
  });

  it("ignores missing search paths when no mods are enabled", () => {
    expect(
      deriveGameConfigAlert({
        ...base,
        hasModPaths: false,
        enabledModsCount: 0,
      }),
    ).toBeNull();
  });

  it("announces an update when mods still load", () => {
    expect(deriveGameConfigAlert({ ...base, buildId: 101 })).toEqual({
      modsDetached: false,
      gameUpdated: true,
    });
  });

  it("does not announce the first build it sees", () => {
    expect(deriveGameConfigAlert({ ...base, knownBuildId: null })).toBeNull();
  });

  it("waits for the gameinfo status before flagging anything", () => {
    expect(
      deriveGameConfigAlert({ ...base, hasModPaths: undefined }),
    ).toBeNull();
  });
});
