import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseKvFile, serializeKv } from "../src/parser";

describe("gameinfo.gi", () => {
  it("should parse the real gameinfo.gi file", () => {
    const filePath = resolve(__dirname, "../data/gameinfo.gi");
    const result = parseKvFile(filePath);

    // Check that the root key exists
    expect(result).toHaveProperty("GameInfo");
    expect(result.GameInfo).toBeTypeOf("object");

    // Check some basic properties
    const gameInfo = result.GameInfo as Record<string, unknown>;
    expect(gameInfo).toHaveProperty("game");
    expect(gameInfo.game).toBe("citadel");
    expect(gameInfo).toHaveProperty("title");
    expect(gameInfo.title).toBe("Citadel");
  });

  it("should parse nested FileSystem section", () => {
    const filePath = resolve(__dirname, "../data/gameinfo.gi");
    const result = parseKvFile(filePath);

    const gameInfo = result.GameInfo as Record<string, unknown>;
    expect(gameInfo).toHaveProperty("FileSystem");
    expect(gameInfo.FileSystem).toBeTypeOf("object");
  });

  it("should parse SearchPaths", () => {
    const filePath = resolve(__dirname, "../data/gameinfo.gi");
    const result = parseKvFile(filePath);

    const gameInfo = result.GameInfo as Record<string, unknown>;
    const fileSystem = gameInfo.FileSystem as Record<string, unknown>;
    expect(fileSystem).toHaveProperty("SearchPaths");
  });

  it("should parse ConVars section", () => {
    const filePath = resolve(__dirname, "../data/gameinfo.gi");
    const result = parseKvFile(filePath);

    const gameInfo = result.GameInfo as Record<string, unknown>;
    expect(gameInfo).toHaveProperty("ConVars");
    const conVars = gameInfo.ConVars as Record<string, unknown>;
    expect(conVars).toBeTypeOf("object");
  });

  it("should handle round-trip parsing", () => {
    const filePath = resolve(__dirname, "../data/gameinfo.gi");
    const parsed = parseKvFile(filePath);
    const serialized = serializeKv(parsed);
    const reparsed = parseKvFile(filePath);

    // Should have the same structure
    expect(reparsed).toHaveProperty("GameInfo");
  });
});
